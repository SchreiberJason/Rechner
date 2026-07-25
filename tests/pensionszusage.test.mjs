// Tests fuer pensionszusage-core.js — Math-Layer.
// Laeuft via "node --test". vm-Sandbox, keine npm-Deps.
//
// Der Rechenkern liegt als eigene Datei vor (nicht inline im HTML), daher braucht
// es hier keinen Script-Extraktor und keinen DOM-Mock — der Kern bis einschliesslich
// Abschnitt 10 ist DOM-frei.
//
// Referenzwerte stammen aus der OVB/Wiener-Staedtische-Praesentation vom 02.06.2026:
//   Folie 16 — 100 EUR Bruttoerhoehung kostet 129,79 (unter HBGL) / 108,59 (ueber HBGL)
//   Folie 40 — Aufwand 12.000 -> 11.050,74 brutto -> 6.409,44 netto

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let _ctx = null;
function ctx() {
  if (_ctx) return _ctx;
  const sandbox = {
    console, Math, Date, parseFloat, parseInt, isNaN, Number, String, Array, Object, JSON,
    document: { getElementById: () => null, addEventListener: () => {}, querySelector: () => null },
    window: { addEventListener: () => {} },
    setTimeout: () => 0,
  };
  sandbox.globalThis = sandbox;
  sandbox.CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  _ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'pensionszusage-core.js'), 'utf8'), _ctx);
  vm.runInContext('applyPzConfig();', _ctx);
  return _ctx;
}
const ev = expr => vm.runInContext(expr, ctx());

// ─── Config-Integration ──────────────────────────────────────────────────────
test('Config — Parameter kommen aus config.json', () => {
  assert.equal(ev('KOEST'), 23, 'Koerperschaftsteuer 23 %');
  assert.equal(ev('PZ_ZINS'), 6, '§14 Rechnungszins 6 %');
  assert.equal(ev('PZ_DECKUNG'), 50, 'Deckungserfordernis 50 %');
  assert.equal(ev('PZ_STRAF'), 30, 'Strafzuschlag 30 %');
  assert.equal(ev('HBGL'), 6930, 'HBGL ASVG');
  assert.equal(ev('TAX_BRACKETS[0].bis'), 13539, 'Nullzone');
  assert.equal(ev('PZ_RDV'), null, 'RDV-Tabellen bewusst leer, bis Modellrechnung vorliegt');
});

// ─── Lohnsteuer §33 EStG ─────────────────────────────────────────────────────
test('calcLohnsteuer — Tarifstufen', () => {
  assert.equal(ev('calcLohnsteuer(13539)'), 0, 'Nullzone steuerfrei');
  assert.ok(Math.abs(ev('calcLohnsteuer(21992)') - 1690.6) < 0.01, '20 %-Stufe');
  assert.ok(Math.abs(ev('calcLohnsteuer(36458)') - 6030.4) < 0.01, '30 %-Stufe');
  assert.ok(Math.abs(ev('calcLohnsteuer(70365)') - 19593.2) < 0.01, '40 %-Stufe');
  assert.ok(Math.abs(ev('calcLohnsteuer(104859)') - 36150.32) < 0.01, '48 %-Stufe');
  assert.equal(ev('calcLohnsteuer(0)'), 0);
  assert.equal(ev('calcLohnsteuer(-500)'), 0, 'negatives Einkommen -> 0');
});

test('calcLohnsteuer — Spitzensteuersatz 55 % ueber 1 Mio', () => {
  const bei1Mio = ev('calcLohnsteuer(1000000)');
  const drueber = ev('calcLohnsteuer(1100000)');
  assert.ok(Math.abs((drueber - bei1Mio) - 100000 * 0.55) < 0.01, '55 % auf den Teil ueber 1 Mio');
});

test('getGrenzsteuersatz — Stufenzuordnung', () => {
  assert.equal(ev('getGrenzsteuersatz(10000)'), 0);
  assert.equal(ev('getGrenzsteuersatz(30000)'), 30);
  assert.equal(ev('getGrenzsteuersatz(80000)'), 48);
  assert.equal(ev('getGrenzsteuersatz(2000000)'), 55);
});

// ─── Sozialversicherung ──────────────────────────────────────────────────────
test('calcSV — HBGL-Deckelung und AV-Staffelung', () => {
  assert.equal(ev('calcSV(20000).basis'), 6930, 'Beitragsgrundlage bei HBGL gedeckelt');
  assert.equal(ev('calcSV(2000).avRate'), 0, 'AV entfaellt bei niedrigem Bezug');
  assert.equal(ev('calcSV(2300).avRate'), 1, 'AV 1 % in der ersten Staffel');
  assert.equal(ev('calcSV(5000).avRate'), 2.95, 'AV voll ueber der Staffelung');
  const voll = ev('calcSV(5000).total');
  assert.ok(Math.abs(voll - 5000 * 0.1807) < 0.01, 'Summe 18,07 % unter HBGL');
});

// ─── Lohnnebenkosten — Referenz Folie 16 ─────────────────────────────────────
test('lnkSatz — reproduziert Folie 16 (129,79 / 108,59)', () => {
  const unter = ev('lnkSatz(3000,{})');
  assert.ok(Math.abs(unter - 29.79) < 0.005, `unter HBGL 29,79 % (ist ${unter})`);
  const fixOnly = ev('LNK.db + LNK.dz + LNK.kommst + LNK.mvk');
  assert.ok(Math.abs(fixOnly - 8.59) < 0.005, `ueber HBGL 8,59 % (ist ${fixOnly})`);
});

test('lnkSatz — wesentlich beteiligter GF: keine ASVG-DG-Beitraege, aber DB/DZ/KommSt', () => {
  const w = ev('lnkSatz(8000,{wesentlich:true})');
  const erwartet = ev('LNK.db + LNK.dz + LNK.kommst');
  assert.ok(Math.abs(w - erwartet) < 1e-9, 'nur DB + DZ + KommSt');
  assert.ok(w > 0, 'Lohnnebenkosten fallen sehr wohl an');
});

// ─── Vergleichspfade — Referenz Folie 40 ─────────────────────────────────────
test('bruttoAusAufwand — reproduziert Folie 40 (12.000 -> 11.050,74)', () => {
  const b = ev('bruttoAusAufwand(12000, 8000, {})');
  assert.ok(Math.abs(b - 11050.74) < 0.5, `erwartet 11.050,74, ist ${b.toFixed(2)}`);
});

test('nettoZuwachsAusBrutto — reproduziert Folie 40 (-> 6.409,44)', () => {
  const b = ev('bruttoAusAufwand(12000, 8000, {})');
  const n = vm.runInContext(`nettoZuwachsAusBrutto(${b}, 8000)`, ctx());
  assert.ok(Math.abs(n - 6409.44) < 1.0, `erwartet 6.409,44, ist ${n.toFixed(2)}`);
  const belastung = (1 - n / b) * 100;
  assert.ok(Math.abs(belastung - 42.0) < 0.05, `42 % Abgaben (12/14 zu 48 % + 2/14 zu 6 %), ist ${belastung.toFixed(2)}`);
});

test('nettoAusAusschuettung — Gesamtbelastung 44,175 %', () => {
  const n = ev('nettoAusAusschuettung(12000)');
  assert.ok(Math.abs(n - 12000 * 0.55825) < 0.01);
  assert.ok(Math.abs((1 - n / 12000) * 100 - 44.175) < 0.001);
});

// ─── Biometrie ───────────────────────────────────────────────────────────────
test('buildLifeTable — Ueberlebensordnung faellt monoton', () => {
  const ok = ev('(() => { const l = buildLifeTable(QX_M); return l[0]===100000 && l.every((v,i)=>i===0||v<=l[i-1]+1e-9); })()');
  assert.equal(ok, true);
});

test('buildLifeTable — rekonstruiert die Lebenserwartung der Originaltafel', () => {
  // Statistik Austria 2024: e65 = 18,76 (M) / 21,71 (W)
  const eM = ev('(() => { const l = buildLifeTable(QX_M); let s=0; for(let a=65;a<l.length-1;a++) s += (l[a]+l[a+1])/2/l[65]; return s; })()');
  const eW = ev('(() => { const l = buildLifeTable(QX_W); let s=0; for(let a=65;a<l.length-1;a++) s += (l[a]+l[a+1])/2/l[65]; return s; })()');
  assert.ok(Math.abs(eM - 18.76) < 0.05, `e65 Maenner ${eM.toFixed(2)} vs. 18,76`);
  assert.ok(Math.abs(eW - 21.71) < 0.05, `e65 Frauen ${eW.toFixed(2)} vs. 21,71`);
});

test('buildCommutation — N faellt monoton, D positiv', () => {
  const ok = ev('(() => { const c = buildCommutation(buildLifeTable(QX_M), 6); return c.N.every((v,i)=>i===0||v<=c.N[i-1]+1e-9) && c.D.slice(0,100).every(v=>v>0); })()');
  assert.equal(ok, true);
});

test('annuityDue12 — faellt mit steigendem Alter', () => {
  const ok = ev('(() => { const c = buildCommutation(buildLifeTable(QX_M), 6); return annuityDue12(c,60) > annuityDue12(c,70) && annuityDue12(c,70) > annuityDue12(c,80); })()');
  assert.equal(ok, true);
  const ae65 = ev('annuityDue12(buildCommutation(buildLifeTable(QX_M), 6), 65)');
  assert.ok(ae65 > 8 && ae65 < 14, `ae_65 bei 6 % plausibel (ist ${ae65.toFixed(3)})`);
});

// ─── §14 Teilwertverfahren ───────────────────────────────────────────────────
test('teilwertSerie — Randbedingung TW(Zusagealter) = 0', () => {
  const tw0 = ev('teilwertSerie(buildCommutation(buildLifeTable(QX_M), 6), 45, 65, 28000, true).tw[0]');
  assert.ok(Math.abs(tw0) < 1e-6, `TW zum Zusagezeitpunkt muss 0 sein, ist ${tw0}`);
});

test('teilwertSerie — Randbedingung TW(Pensionsalter) = Leistungsbarwert', () => {
  const r = ev(`(() => {
    const c = buildCommutation(buildLifeTable(QX_M), 6);
    const s = teilwertSerie(c, 45, 65, 28000, true);
    return { ende: s.tw[20], soll: 28000 * annuityDue12(c, 65) };
  })()`);
  assert.ok(Math.abs(r.ende - r.soll) < 1e-6, `TW am Ende ${r.ende.toFixed(2)} muss Leistungsbarwert ${r.soll.toFixed(2)} entsprechen`);
});

test('teilwertSerie — steigt monoton und Jahresbetrag ist positiv', () => {
  const r = ev(`(() => {
    const s = teilwertSerie(buildCommutation(buildLifeTable(QX_M), 6), 45, 65, 28000, true);
    return { jb: s.jb, monoton: s.tw.every((v,i,a)=>i===0||v>=a[i-1]-1e-9), n: s.tw.length };
  })()`);
  assert.ok(r.jb > 0, 'gleichbleibender Jahresbetrag positiv');
  assert.equal(r.monoton, true, 'Rueckstellung waechst monoton');
  assert.equal(r.n, 21, 't = 0..20');
});

test('teilwertSerie — Kapitalzusage: TW(Ende) = zugesagtes Kapital', () => {
  const r = ev('teilwertSerie(buildCommutation(buildLifeTable(QX_M), 6), 50, 65, 500000, false)');
  assert.ok(Math.abs(r.tw[15] - 500000) < 1e-6, `ist ${r.tw[15]}`);
  assert.ok(Math.abs(r.tw[0]) < 1e-6);
});

test('teilwertSerie — kuerzere Laufzeit erzwingt hoeheren Jahresbetrag', () => {
  const lang = ev('teilwertSerie(buildCommutation(buildLifeTable(QX_M), 6), 40, 65, 28000, true).jb');
  const kurz = ev('teilwertSerie(buildCommutation(buildLifeTable(QX_M), 6), 55, 65, 28000, true).jb');
  assert.ok(kurz > lang, 'weniger Jahre -> hoeherer jaehrlicher Aufwand');
});

// ─── Deckungserfordernis §14 Abs 5 ───────────────────────────────────────────
test('deckungspruefung — Fehlbetrag und 30 % Strafzuschlag', () => {
  const r = ev('deckungspruefung(200000, 60000, 0)');
  assert.equal(r.soll, 100000, '50 % der Vorjahresrueckstellung');
  assert.equal(r.ist, 60000);
  assert.equal(r.fehlbetrag, 40000);
  assert.ok(Math.abs(r.strafzuschlag - 12000) < 1e-9, '30 % von 40.000');
  assert.equal(r.gedeckt, false);
});

test('deckungspruefung — volle Deckung erzeugt keinen Zuschlag', () => {
  const r = ev('deckungspruefung(200000, 150000, 0)');
  assert.equal(r.fehlbetrag, 0);
  assert.equal(r.strafzuschlag, 0);
  assert.equal(r.gedeckt, true);
});

// ─── Hälftesteuersatz §37 EStG ───────────────────────────────────────────────
test('steuerKapitalabfindung — Haelftesteuersatz halbiert den Durchschnittssteuersatz', () => {
  const voll = ev('steuerKapitalabfindung(400000, 0, false)');
  const halb = ev('steuerKapitalabfindung(400000, 0, true)');
  assert.ok(Math.abs(halb.steuer - voll.steuer / 2) < 0.01, 'ohne sonstige Einkuenfte exakt die Haelfte');
  assert.ok(Math.abs(halb.dss - voll.dss) < 1e-12, 'DSS aus dem Gesamteinkommen, identisch');
  assert.ok(halb.effektiv < voll.effektiv);
});

test('steuerKapitalabfindung — sonstige Einkuenfte erhoehen die Belastung', () => {
  const ohne = ev('steuerKapitalabfindung(300000, 0, true)');
  const mit = ev('steuerKapitalabfindung(300000, 40000, true)');
  assert.ok(mit.steuer > ohne.steuer, 'hoeherer DSS durch weitere Einkuenfte');
  assert.ok(mit.dss > ohne.dss);
});

test('steuerKapitalabfindung — Randfaelle', () => {
  assert.equal(ev('steuerKapitalabfindung(0, 0, true).steuer'), 0);
  assert.ok(ev('steuerKapitalabfindung(100000, 0, false).steuer') > 0);
});

// ─── Rentenbesteuerung ───────────────────────────────────────────────────────
test('steuerRente — KV-Beitrag und Lohnsteuer werden abgezogen', () => {
  const r = ev('steuerRente(28000, 20000, 5.1)');
  assert.ok(Math.abs(r.kv - 28000 * 0.051) < 0.01, 'KV 5,1 %');
  assert.ok(r.lst > 0, 'Lohnsteuer marginal ueber den sonstigen Einkuenften');
  assert.ok(Math.abs(r.netto - (28000 - r.kv - r.lst)) < 1e-9);
});

test('steuerRente — ohne KV-Beitrag bleibt mehr netto', () => {
  const mit = ev('steuerRente(28000, 20000, 5.1).netto');
  const ohne = ev('steuerRente(28000, 20000, 0).netto');
  assert.ok(ohne > mit, 'Parameter firmenpension_kv_pct wirkt');
});

// ─── Depot & IRR ─────────────────────────────────────────────────────────────
test('depotEndwert — KESt nur auf den Gewinn', () => {
  const r = ev('depotEndwert(12000, 20, 6, 27.5)');
  assert.ok(Math.abs(r.eingezahlt - 240000) < 1e-6);
  assert.ok(r.brutto > r.eingezahlt, 'Wertzuwachs');
  assert.ok(Math.abs(r.kest - (r.brutto - r.eingezahlt) * 0.275) < 0.01, 'KESt auf den Gewinn');
  assert.ok(r.endwert < r.brutto && r.endwert > r.eingezahlt);
});

test('depotEndwert — ohne Rendite bleibt der Einzahlungsbetrag', () => {
  const r = ev('depotEndwert(12000, 10, 0, 27.5)');
  assert.ok(Math.abs(r.endwert - 120000) < 1e-6);
  assert.equal(r.kest, 0);
});

test('irrAnnuitaet — findet die eingesetzte Rendite zurueck', () => {
  const ziel = ev('depotEndwert(12000, 20, 6, 0).brutto');
  const irr = vm.runInContext(`irrAnnuitaet(12000, 20, ${ziel})`, ctx());
  assert.ok(Math.abs(irr - 6) < 0.01, `erwartet 6 %, ist ${irr}`);
});

test('irrAnnuitaet — Randfaelle liefern null', () => {
  assert.equal(ev('irrAnnuitaet(0, 20, 100000)'), null);
  assert.equal(ev('irrAnnuitaet(12000, 20, 0)'), null);
});

// ─── Zulässigkeitsmatrix (Folie 23) ──────────────────────────────────────────
test('ROLLEN — Pensionszusage fuer Unternehmer/Gesellschafter ohne Taetigkeit unzulaessig', () => {
  assert.equal(ev("getRolle('eu','unternehmer').moeglich"), false, 'Einzelunternehmer selbst');
  assert.equal(ev("getRolle('eu','an').moeglich"), true, 'dessen Arbeitnehmer sehr wohl');
  assert.equal(ev("getRolle('og','gesellschafter').moeglich"), false);
  assert.equal(ev("getRolle('kg','komplementaer').moeglich"), false);
  assert.equal(ev("getRolle('kg','kommanditist').moeglich"), false);
  assert.equal(ev("getRolle('gen','genossenschafter').moeglich"), false);
  assert.equal(ev("getRolle('ag','aktionaer').moeglich"), false);
  assert.equal(ev("getRolle('gmbh','gs_ohne').moeglich"), false);
});

test('ROLLEN — GmbH-Geschaeftsfuehrer sind zulaessig, Wesentlichkeit korrekt', () => {
  assert.equal(ev("getRolle('gmbh','gf_gs').moeglich"), true);
  assert.equal(ev("getRolle('gmbh','gf_gs').wesentlich"), true);
  assert.equal(ev("getRolle('gmbh','gf25').moeglich"), true);
  assert.equal(ev("getRolle('gmbh','gf25').wesentlich"), false, 'bis 25 % = wie Angestellter');
  assert.equal(ev("getRolle('gmbh','an').moeglich"), true);
});

// ─── Hälftesteuersatz-Voraussetzungen ────────────────────────────────────────
test('pruefeHaelftesteuersatz — alle vier Bedingungen erfuellt', () => {
  const r = ev("pruefeHaelftesteuersatz({wesentlich:true, beteiligung:100, jahreSelbstaendig:25, modus:'kapital', pensionsalter:65})");
  assert.equal(r.erfuellt, true);
  assert.equal(r.checks.length, 4);
  assert.ok(r.checks.every(c => c.ok));
});

test('pruefeHaelftesteuersatz — jede Bedingung kippt das Ergebnis einzeln', () => {
  assert.equal(ev("pruefeHaelftesteuersatz({wesentlich:false, beteiligung:20, jahreSelbstaendig:25, modus:'kapital', pensionsalter:65}).erfuellt"), false, 'Beteiligung <= 25 %');
  assert.equal(ev("pruefeHaelftesteuersatz({wesentlich:true, beteiligung:100, jahreSelbstaendig:5, modus:'kapital', pensionsalter:65}).erfuellt"), false, 'unter 7 Jahren');
  assert.equal(ev("pruefeHaelftesteuersatz({wesentlich:true, beteiligung:100, jahreSelbstaendig:25, modus:'rente', pensionsalter:65}).erfuellt"), false, 'keine Kapitalabfindung');
  assert.equal(ev("pruefeHaelftesteuersatz({wesentlich:true, beteiligung:100, jahreSelbstaendig:25, modus:'kapital', pensionsalter:58}).erfuellt"), false, 'vor dem 60. Lebensjahr');
});

test('pruefeHaelftesteuersatz — genau 25 % reichen nicht ("mehr als")', () => {
  assert.equal(ev("pruefeHaelftesteuersatz({wesentlich:true, beteiligung:25, jahreSelbstaendig:25, modus:'kapital', pensionsalter:65}).checks[0].ok"), false);
  assert.equal(ev("pruefeHaelftesteuersatz({wesentlich:true, beteiligung:25.1, jahreSelbstaendig:25, modus:'kapital', pensionsalter:65}).checks[0].ok"), true);
});

// ─── Produktadapter ──────────────────────────────────────────────────────────
test('rdvLookup — liefert null, solange keine Produktdaten hinterlegt sind', () => {
  assert.equal(ev("rdvLookup('veranlagungswert','3pct',10,1000)"), null);
  assert.equal(ev('hatProduktdaten()'), false);
});

test('rdvLookup — interpoliert und skaliert, sobald Daten vorliegen', () => {
  const r = ev(`(() => {
    const backup = PZ_RDV;
    PZ_RDV = { _basis_beitrag_monatlich_eur: 100,
               veranlagungswert: { s: { 1: 1000, 10: 20000 } } };
    const exakt  = rdvLookup('veranlagungswert','s',1,100);
    const interp = rdvLookup('veranlagungswert','s',5,100);
    const skal   = rdvLookup('veranlagungswert','s',1,500);
    PZ_RDV = backup;
    return { exakt, interp, skal };
  })()`);
  assert.equal(r.exakt, 1000, 'Stuetzstelle exakt');
  assert.ok(r.interp > 1000 && r.interp < 20000, 'linear interpoliert');
  assert.equal(r.skal, 5000, 'auf die tatsaechliche Praemie skaliert');
});

// ─── Kongruenz Prämie ↔ Zusage ───────────────────────────────────────────────
test('endwertFaktor — ohne Rendite entspricht er der Laufzeit', () => {
  assert.ok(Math.abs(ev('endwertFaktor(20, 0)') - 20) < 1e-9);
  assert.ok(ev('endwertFaktor(20, 6)') > 20, 'mit Verzinsung groesser');
  assert.equal(ev('endwertFaktor(0, 6)'), 0);
});

test('kongruentePraemie — baut exakt das Zielkapital auf', () => {
  const p = ev('kongruentePraemie(500000, 20, 6)');
  const erreicht = vm.runInContext(`depotEndwert(${p}, 20, 6, 0).brutto`, ctx());
  assert.ok(Math.abs(erreicht - 500000) < 1, `Zielkapital 500.000 erreicht (ist ${erreicht.toFixed(2)})`);
});

test('kongruentePraemie — laengere Laufzeit senkt die noetige Praemie', () => {
  const kurz = ev('kongruentePraemie(500000, 10, 6)');
  const lang = ev('kongruentePraemie(500000, 30, 6)');
  assert.ok(lang < kurz, 'mehr Zeit -> weniger Praemie noetig');
});

// ─── Wasserfall-Kontrollgleichung ────────────────────────────────────────────
test('Wasserfall — die vier Stufen summieren sich auf den Gesamtvorteil', () => {
  const r = ev(`(() => {
    const A = 8628, N = 4817, lz = 19, rend = 6, kest = 27.5;
    const bruttoZusage = 299305, nettoZusage = 232619;
    const dAlt  = depotEndwert(N, lz, rend, kest).endwert;
    const dVoll = depotEndwert(A, lz, rend, kest).endwert;
    const dBrut = depotEndwert(A, lz, rend, 0).brutto;
    const s1 = dVoll - dAlt, s2 = dBrut - dVoll;
    const s3 = bruttoZusage - dBrut, s4 = nettoZusage - bruttoZusage;
    return { summe: s1 + s2 + s3 + s4, vorteil: nettoZusage - dAlt };
  })()`);
  assert.ok(Math.abs(r.summe - r.vorteil) < 1e-6,
    `Summe ${r.summe.toFixed(2)} muss dem Vorteil ${r.vorteil.toFixed(2)} entsprechen`);
});

// ─── Regressionen aus der fachlichen Prüfung ─────────────────────────────────

test('steuerRente — 13./14. Bezug wird wie im Gehaltspfad zum festen Satz besteuert', () => {
  // Ohne diese Symmetrie wurde die Zusage gegenueber der Gehaltserhoehung
  // systematisch schlechter gerechnet (rund 1.973 EUR p.a. zuviel Steuer).
  const r = ev('steuerRente(42000, 20000, 5.1)');
  const basis = 42000 * (1 - 0.051);
  const vollTarif = vm.runInContext(`calcLohnsteuer(20000 + ${basis}) - calcLohnsteuer(20000)`, ctx());
  assert.ok(r.lst < vollTarif, 'guenstiger als volle Tarifbesteuerung');
  assert.ok(r.lstSz > 0, 'Sonderzahlungsanteil wird gesondert besteuert');
  const szBasis = basis * 2 / 14;
  assert.ok(Math.abs(r.lstSz - Math.max(0, szBasis - 620) * 0.06) < 0.01, '6 % ueber dem Freibetrag');
  assert.ok(Math.abs(r.lst - (r.lstLaufend + r.lstSz)) < 1e-9);
});

test('steuerRente — kein Pensionistenabsetzbetrag bei sonstigen Einkuenften von 0', () => {
  // Frueher senkte der unbedingt abgezogene Absetzbetrag die Steuer um 1.121 EUR,
  // weil die max(0,...)-Untergrenze griff und er sich nicht wegkuerzte.
  const r = ev('steuerRente(42000, 0, 5.1)');
  const basis = 42000 * (1 - 0.051);
  const laufend = basis * 12 / 14, sz = basis - laufend;
  const soll = vm.runInContext(`calcLohnsteuer(${laufend})`, ctx()) + Math.max(0, sz - 620) * 0.06;
  assert.ok(Math.abs(r.lst - soll) < 0.01, `erwartet ${soll.toFixed(2)}, ist ${r.lst.toFixed(2)}`);
});

test('steuerRente — Bezugsanzahl ist parametrierbar', () => {
  const r12 = ev('steuerRente(42000, 20000, 0, 12)');
  assert.equal(r12.lstSz, 0, 'bei 12 Bezuegen keine Sonderzahlung');
});

test('lnkFixSatz — einzige Quelle fuer den beitragsunabhaengigen Teil', () => {
  assert.ok(Math.abs(ev('lnkFixSatz({})') - 8.59) < 0.005, 'Dienstnehmer inkl. MVK');
  assert.ok(Math.abs(ev('lnkFixSatz({wesentlich:true})') - 7.06) < 0.005, 'wesentlich Beteiligter ohne MVK');
});

test('bruttoAusAufwand — konsistent zu lnkSatz oberhalb der HBGL', () => {
  // Ueber der HBGL faellt keine DG-SV mehr an, beide Wege muessen denselben Satz liefern.
  const b = ev('bruttoAusAufwand(12000, 20000, {})');
  const satz = ev('lnkFixSatz({})');
  assert.ok(Math.abs(b - 12000 / (1 + satz / 100)) < 0.5, 'keine zwei auseinanderlaufenden Wahrheiten');
});

test('pruefeHaelftesteuersatz — Altersbedingung ist tatsaechlich falsifizierbar', () => {
  // Das Eingabefeld erlaubt jetzt ab 55, sonst waere der Check eine Tautologie.
  assert.equal(ev("pruefeHaelftesteuersatz({wesentlich:true,beteiligung:100,jahreSelbstaendig:25,modus:'kapital',pensionsalter:58}).checks[3].ok"), false);
  assert.equal(ev("pruefeHaelftesteuersatz({wesentlich:true,beteiligung:100,jahreSelbstaendig:25,modus:'kapital',pensionsalter:60}).checks[3].ok"), true);
});

test('ROLLEN — GF der Komplementaer-GmbH ist bei GmbH & Co KG zulaessig', () => {
  assert.equal(ev("getRolle('gmbhcokg','gf_kompl_gmbh').moeglich"), true);
  assert.equal(ev("getRolle('gmbhcokg','gf_kompl_gmbh').wesentlich"), true);
  assert.equal(ev("getRolle('gmbhcokg','kommanditist').moeglich"), false, 'Kommanditist weiterhin unzulaessig');
});

// ─── Auszahlungsformen: Bruttowert darf nicht von der Form abhaengen ─────────
test('rentenBarwert — identischer Faktor wie die Kapitalabfindung', () => {
  // Frueher summierte die Rentenbewertung Jahresbetraege und landete beim rohen
  // Faktor N/D statt bei N/D - 11/24. Die Rente war dadurch schon VOR Steuern
  // rund 4 % mehr wert als die Kapitalabfindung derselben Zusage.
  const r = ev(`(() => {
    const comm = buildCommutation(buildLifeTable(QX_M), 6);
    const P = 2800 * 14;
    return { rente: rentenBarwert(comm, 65, P), kapital: P * annuityDue12(comm, 65) };
  })()`);
  assert.ok(Math.abs(r.rente - r.kapital) < 1e-9,
    `Bruttowert muss unabhaengig von der Auszahlungsform sein (Rente ${r.rente.toFixed(2)} vs Kapital ${r.kapital.toFixed(2)})`);
});

test('Auszahlungsformen — mit gesetzlicher Pension ist die Rente schlechter als das Kapital', () => {
  // Fachliche Erwartung: bei der Rente greift der volle Tarif, beim Kapital der
  // Haelftesteuersatz. Ohne sonstige Einkuenfte kehrt sich das kuenstlich um —
  // deshalb wird dieser Zustand im Rechner rot gewarnt.
  const r = ev(`(() => {
    const comm = buildCommutation(buildLifeTable(QX_M), 6);
    const P = 2800 * 14, y = 65, sonst = 30000;
    const K = P * annuityDue12(comm, y);
    const kNetto = K - steuerKapitalabfindung(K, sonst, true).steuer;
    const rr = steuerRente(P, sonst, PZ_RENTE_KV);
    return { kNetto, rNetto: rentenBarwert(comm, y, rr.netto) };
  })()`);
  assert.ok(r.rNetto < r.kNetto,
    `Rente (${Math.round(r.rNetto)}) muss unter Kapital (${Math.round(r.kNetto)}) liegen, wenn eine gesetzliche Pension besteht`);
});

// ─── Abfindungsverbot § 5 BPG ────────────────────────────────────────────────
test('abfindungZulaessig — nur der wesentlich beteiligte GGF darf abfinden', () => {
  assert.equal(ev('abfindungZulaessig(true).zulaessig'), true, 'GGF ueber 25 % faellt nicht unter das BPG');
  assert.equal(ev('abfindungZulaessig(false).zulaessig'), false, 'Arbeitnehmer: § 5 BPG sperrt die Abfindung');
  assert.equal(ev("abfindungZulaessig(false).grund"), 'bpg');
});

test('pruefeHaelftesteuersatz — Sieben-Jahres-Frist misst die selbstaendige Taetigkeit', () => {
  // Quelle: BAV_GmbH_Pensionszusage.pdf S. 6 — die Frist bezieht sich auf die
  // Taetigkeit als selbstaendiger Unternehmer, NICHT auf die Laufzeit der Zusage.
  const kurz = ev("pruefeHaelftesteuersatz({wesentlich:true,beteiligung:100,jahreSelbstaendig:5,modus:'kapital',pensionsalter:65})");
  const lang = ev("pruefeHaelftesteuersatz({wesentlich:true,beteiligung:100,jahreSelbstaendig:25,modus:'kapital',pensionsalter:65})");
  assert.equal(kurz.checks[1].ok, false, 'unter 7 Jahren selbstaendig');
  assert.equal(lang.checks[1].ok, true);
  assert.equal(kurz.erfuellt, false);
  assert.equal(lang.erfuellt, true);
});

// ─── Nachvollziehbarkeit der Abfindungsbesteuerung ───────────────────────────
test('steuerKapitalabfindung — Zwischenwerte bilden eine geschlossene Kette', () => {
  const s = ev('steuerKapitalabfindung(256547, 100000, true)');
  const estGesamtSoll = vm.runInContext('calcLohnsteuer(356547)', ctx());
  const estSonstSoll = vm.runInContext('calcLohnsteuer(100000)', ctx());
  assert.ok(Math.abs(s.gesamt - 356547) < 0.01, 'Gesamteinkommen = Kapital + sonstige');
  assert.ok(Math.abs(s.estGesamt - estGesamtSoll) < 0.01);
  assert.ok(Math.abs(s.estSonst - estSonstSoll) < 0.01);
  assert.ok(Math.abs(s.dss - s.estGesamt / s.gesamt) < 1e-12, 'DSS = ESt(gesamt) / Gesamteinkommen');
  assert.ok(Math.abs(s.entlastung - 256547 * s.dss / 2) < 0.01, 'Ermaessigung = Kapital x halber DSS');
  assert.ok(Math.abs(s.steuerGesamt - (s.estGesamt - s.entlastung)) < 0.01, 'Steuer nach Ermaessigung');
  assert.ok(Math.abs(s.steuer - (s.steuerGesamt - s.estSonst)) < 0.01, 'auf die Abfindung entfallender Anteil');
});

test('steuerKapitalabfindung — ohne Haelftesteuersatz gibt es keine Ermaessigung', () => {
  const s = ev('steuerKapitalabfindung(256547, 100000, false)');
  assert.equal(s.entlastung, 0);
  assert.ok(Math.abs(s.steuerGesamt - s.estGesamt) < 1e-9);
});

test('Bezuege — 12 statt 14 senkt die Jahrespension und den Barwert proportional', () => {
  const r = ev(`(() => {
    const comm = buildCommutation(buildLifeTable(QX_M), 6);
    return { b12: 2000 * 12 * annuityDue12(comm, 65), b14: 2000 * 14 * annuityDue12(comm, 65) };
  })()`);
  assert.ok(Math.abs(r.b14 / r.b12 - 14 / 12) < 1e-9, 'Barwert skaliert linear mit der Bezugsanzahl');
});
