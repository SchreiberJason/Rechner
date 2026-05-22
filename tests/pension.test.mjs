// Tests fuer pensionsluecke.html — Math-Layer (Lohnsteuer, PK-Aufwertung).
// Laeuft via "node --test". Nutzt vm-Sandbox mit DOM-Mock; keine npm-Deps.
//
// Hauptzweck: Regression gegen den Bug aus 4d04df9, wo §108-Aufwertung immer
// angewendet wurde und die Pension-Deckung dadurch kuenstlich erhoehte.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Sandbox-Loader ─────────────────────────────────────────────────────────
function loadPensionContext({ inputs = {}, geschlecht = 'm', beschaeft = 'asvg', gehaelter = 14 } = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'pensionsluecke.html'), 'utf8');
  // Zweiter <script>-Block enthaelt den Math-Code (erster ist nur Theme-Detection).
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const mainScript = matches[1][1];

  // Globale Defaults — alle Input-Felder, die irgendwo gelesen werden.
  const defaults = {
    p_eink: '2050',
    p_wunsch_pct: '100',
    p_antritt: '65',
    p_karriere: '0',
    p_inflation: '2.1',
    p_vm: '0',
    p_pk_stand: '0',
    p_svs_basis: '518.44',
    p_geburt: '1990-01-01',
    p_geschlecht: geschlecht,
    p_beschaeft: beschaeft,
    p_kinder: '0',
    p_karenz_monate: '0',
    ...inputs,
  };

  const elementStore = new Map();
  function makeEl(id) {
    const el = {
      value: defaults[id] ?? '',
      textContent: '',
      innerHTML: '',
      className: '',
      style: { width: '', background: '', cssText: '', color: '' },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {},
      // Optional fuer min/max-Felder
      min: '',
      max: '',
    };
    return el;
  }
  function getElementById(id) {
    if (!elementStore.has(id)) elementStore.set(id, makeEl(id));
    return elementStore.get(id);
  }

  // Radio-Input fuer "gehaelter"
  function querySelector(sel) {
    if (sel === 'input[name="gehaelter"]:checked') {
      return { value: String(gehaelter) };
    }
    return null;
  }

  const sandbox = {
    console,
    Math, Date, parseFloat, parseInt, isNaN, Number, String, Array, Object, JSON,
    URL, URLSearchParams,
    setTimeout: () => 0,
    clearTimeout: () => {},
    document: {
      getElementById,
      querySelector,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: { style: { cssText: '', overflow: '' }, innerHTML: '' },
      documentElement: { classList: { contains: () => false, add() {}, remove() {} } },
      referrer: '',
    },
    window: {
      addEventListener: () => {},
      location: { search: '', hostname: 'localhost', href: 'http://localhost/' },
      parent: { postMessage: () => {} },
      matchMedia: () => ({ matches: false }),
    },
    location: { hostname: 'localhost', search: '', href: 'http://localhost/' },
    fetch: () => Promise.reject(new Error('test: no network')),
    Promise,
    Error,
    Symbol,
  };
  sandbox.globalThis = sandbox;

  // Config laden (synchron — der eigentliche Boot ueber DOMContentLoaded feuert nicht).
  sandbox.CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

  const ctx = vm.createContext(sandbox);
  // shared.js liefert loadConfig() — stubben, damit nichts knallt.
  vm.runInContext('function loadConfig(){ return Promise.resolve(CONFIG); }', ctx);
  vm.runInContext(mainScript, ctx);
  // Config-Defaults in den Math-Layer durchschieben.
  vm.runInContext('applyPensionConfig();', ctx);

  return { ctx, sandbox, defaults };
}

// ─── Lohnsteuer §33 EStG 2026 ───────────────────────────────────────────────
test('calcLohnsteuer — Nullzone bis €13.539', () => {
  const { ctx } = loadPensionContext();
  assert.equal(ctx.calcLohnsteuer(0), 0);
  assert.equal(ctx.calcLohnsteuer(13539), 0);
  assert.equal(ctx.calcLohnsteuer(5000), 0);
});

test('calcLohnsteuer — bei €21.992 = obere Grenze 20%-Stufe', () => {
  const { ctx } = loadPensionContext();
  // (21992 - 13539) * 0.20 = 1690.60
  const got = ctx.calcLohnsteuer(21992);
  assert.ok(Math.abs(got - 1690.60) < 0.01, `Erwartet 1690.60, bekommen ${got}`);
});

test('calcLohnsteuer — €30.000 (in 30%-Stufe)', () => {
  const { ctx } = loadPensionContext();
  // 1690.60 + (30000 - 21992) * 0.30 = 4093.00
  const got = ctx.calcLohnsteuer(30000);
  assert.ok(Math.abs(got - 4093.00) < 0.01, `Erwartet 4093.00, bekommen ${got}`);
});

test('calcLohnsteuer — €50.000 (in 40%-Stufe)', () => {
  const { ctx } = loadPensionContext();
  // 1690.60 + (36458 - 21992) * 0.30 + (50000 - 36458) * 0.40
  // = 1690.60 + 4339.80 + 5416.80 = 11447.20
  const got = ctx.calcLohnsteuer(50000);
  assert.ok(Math.abs(got - 11447.20) < 0.01, `Erwartet 11447.20, bekommen ${got}`);
});

// ─── Verkehrsabsetzbetrag / Einschleifregelung ──────────────────────────────
test('getAbsetzAN — voller Zuschlag unter €19.761', () => {
  const { ctx } = loadPensionContext();
  // VERKEHR_AB 496 + ZUSCHLAG_AB 804 = 1300
  assert.equal(ctx.getAbsetzAN(15000), 1300);
});

test('getAbsetzAN — kein Zuschlag ueber €30.259', () => {
  const { ctx } = loadPensionContext();
  assert.equal(ctx.getAbsetzAN(35000), 496);
});

test('getAbsetzAN — linear einschleifend dazwischen', () => {
  const { ctx } = loadPensionContext();
  // Mitte: 25010 → Zuschlag = 804 * (30259-25010)/(30259-19761) = 804 * 0.5 = 402
  const got = ctx.getAbsetzAN(25010);
  assert.ok(Math.abs(got - (496 + 402)) < 0.5, `Erwartet ~898, bekommen ${got}`);
});

// ─── PK-Aufwertung Toggle — DAS WAR DER BUG ─────────────────────────────────
// Hinweis: `let inflAn` / `let TAX_BRACKETS` aus dem Script liegen im Skript-Scope,
// nicht auf dem Sandbox-Global. Daher hier ueber vm.runInContext lesen/schreiben.
function setInfl(ctx, val) { vm.runInContext(`inflAn = ${val};`, ctx); }
function readVar(ctx, name) { return vm.runInContext(name, ctx); }

test('calcPKData — inflAn=false: keine Aufwertung (Summe der Rohbeitraege)', () => {
  const { ctx } = loadPensionContext({ inputs: { p_eink: '3000', p_karriere: '0' } });
  setInfl(ctx, false);
  // 25 J., 14 Gehaelter, 0% Karriere, 0 Vormonate
  // rawTK pro Jahr = 3000 * 14 * 0.0178 = 747.60
  // pkFuture (ohne Aufwertung) = 25 * 747.60 = 18690
  const { pkFuture, pkPast } = ctx.calcPKData(3000, 14, 25, 0);
  assert.equal(pkPast, 0, 'Ohne Vormonate sollte pkPast = 0 sein');
  assert.ok(Math.abs(pkFuture - 18690) < 0.5, `Erwartet ~18690, bekommen ${pkFuture}`);
});

test('calcPKData — inflAn=true: Aufwertung 1,022^Jahre wirkt', () => {
  const { ctx } = loadPensionContext({ inputs: { p_eink: '3000', p_karriere: '0' } });
  setInfl(ctx, true);
  const { pkFuture } = ctx.calcPKData(3000, 14, 25, 0);
  // Pro Jahr i: 747.60 * 1.022^(25-i-1), aufsummiert i=0..24
  let expected = 0;
  for (let i = 0; i < 25; i++) expected += 747.60 * Math.pow(1.022, 25 - i - 1);
  assert.ok(Math.abs(pkFuture - expected) < 1, `Erwartet ~${expected.toFixed(2)}, bekommen ${pkFuture}`);
  // Sicherheits-Check: deutlich groesser als ohne Aufwertung
  assert.ok(pkFuture > 22000, `pkFuture sollte > 22000 sein wenn Aufwertung greift, war ${pkFuture}`);
});

test('calcPKData — Toggle aendert Deckungs-Ergebnis spuerbar', () => {
  // Regressionstest gegen den User-Bug: bei 25 J. bis Pension darf der Toggle
  // die nominal angezeigte Pension NICHT einfach verdoppeln.
  const { ctx } = loadPensionContext({ inputs: { p_eink: '3000', p_karriere: '0' } });

  setInfl(ctx, false);
  const off = ctx.calcPKData(3000, 14, 25, 0);

  setInfl(ctx, true);
  const on = ctx.calcPKData(3000, 14, 25, 0);

  const ratio = on.pkFuture / off.pkFuture;
  // 1.022^25 = 1.717 → Durchschnitt 1.022^12.5 ≈ 1.31
  assert.ok(ratio > 1.25 && ratio < 1.45, `Aufwertung-Verhaeltnis sollte ~1.31 sein, war ${ratio.toFixed(3)}`);
});

// ─── pensionNetFromGross — DOM-Pfad ────────────────────────────────────────
test('pensionNetFromGross — €2.000/Mo Brutto-Pension', () => {
  const { ctx } = loadPensionContext();
  // grossAnn = 28000; kv = 1428; taxable = 26572
  // rawTax = 1690.60 + (26572 - 21992) * 0.30 = 3064.60
  // pab (Einschleif): 1121 * (29500 - 28000)/4500 = 373.67
  // lst = 3064.60 - 373.67 = 2690.93
  // net = (28000 - 1428 - 2690.93) / 14 = 1705.79
  const got = ctx.pensionNetFromGross(2000);
  assert.ok(Math.abs(got - 1705.79) < 1, `Erwartet ~1705.79, bekommen ${got.toFixed(2)}`);
});

// ─── Config wurde geladen ───────────────────────────────────────────────────
test('Config-Integration — Tarifstufen kommen aus config.json', () => {
  const { ctx } = loadPensionContext();
  const brackets = readVar(ctx, 'TAX_BRACKETS');
  // Aus config.json (lohnsteuer_tarifstufen[0].bis = 13539)
  assert.equal(brackets[0].bis, 13539);
  assert.equal(brackets[5].satz, 0.50);
  assert.equal(readVar(ctx, 'HBGG_ASVG'), 6930);
  assert.equal(readVar(ctx, 'SV_AN_RATE'), 0.1807);
});
