/* ══════════════════════════════════════════════════════
   SHARED.JS — Gemeinsame Utilities fuer alle Rechner
   FLV-Depot · Jason Schreiber
   ══════════════════════════════════════════════════════ */

/* ══════════ CONFIG LOADER ══════════ */
let CONFIG = null;

async function loadConfig() {
  try {
    const r = await fetch('config.json?v=' + Date.now());
    CONFIG = await r.json();
  } catch (e) {
    console.warn('config.json nicht geladen, Fallback-Werte aktiv.', e);
  }
  return CONFIG;
}

/* ══════════ FORMATTERS ══════════ */

/** "€ 1.234" (0 Nachkommastellen, de-AT Waehrungsformat) */
function eur(v) {
  return v.toLocaleString('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

/** "1.234,56 €" (2 Nachkommastellen) */
function eurFull(v) {
  return v.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC';
}

/** "12,5 %" (Dezimalzahl 0.125 → "12,5 %") */
function pct(v) {
  return (v * 100).toFixed(1).replace('.', ',') + ' %';
}

/** Kurzformat fuer Chart-Achsen: 1.2M / 45K / 123 */
function eurShort(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + ' K';
  return v.toFixed(0);
}

/* ══════════ THEME DETECTION ══════════ */
function isDark() {
  if (document.documentElement.classList.contains('dark')) return true;
  if (document.documentElement.classList.contains('light')) return false;
  return window.matchMedia('(prefers-color-scheme:dark)').matches;
}

/* ══════════ IFRAME HEIGHT (postMessage) ══════════ */
function sendHeight() {
  if (window.parent === window) return;
  // Fuer Multi-View-Seiten (index.html) die aktive View messen
  const view = document.querySelector('.view.active');
  const h = view
    ? view.scrollHeight
    : Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  window.parent.postMessage({ type: 'resize', height: h }, '*');
}
window.addEventListener('resize', sendHeight);
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(sendHeight).observe(document.body);
}

/* ══════════ PANEL HEIGHT SYNC ══════════ */
function updatePanelMaxHeight() {
  if (window.innerWidth < 720) {
    document.querySelectorAll('.params-panel').forEach(p => { p.style.maxHeight = ''; });
    return;
  }
  document.querySelectorAll('.calc-layout').forEach(layout => {
    const panel = layout.querySelector('.params-panel');
    const rp = layout.querySelector('.rp');
    if (!panel || !rp) return;
    const h = rp.offsetHeight;
    if (h > 0) panel.style.maxHeight = h + 'px';
  });
}
window.addEventListener('resize', updatePanelMaxHeight);
if (typeof ResizeObserver !== 'undefined') {
  const _rpObs = new ResizeObserver(updatePanelMaxHeight);
  document.querySelectorAll('.rp').forEach(el => _rpObs.observe(el));
}

/* ══════════ INPUT SANITIZATION ══════════ */
document.addEventListener('blur', e => {
  if (e.target.matches('input[type="number"]')) {
    let v = parseFloat(e.target.value);
    const min = e.target.min !== '' ? parseFloat(e.target.min) : null;
    const max = e.target.max !== '' ? parseFloat(e.target.max) : null;
    if (isNaN(v)) { v = min != null ? min : 0; }
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    // Step-aware rounding: step=0.1 → 1 decimal, step=1 → integer
    const step = parseFloat(e.target.step) || 1;
    const decimals = step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0;
    v = parseFloat(v.toFixed(decimals));
    e.target.value = v;
  }
}, true);

/* ══════════ AXION THEME BRIDGE ══════════ */
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'axion-theme') {
    var t = e.data.theme;
    document.documentElement.classList.toggle('light', t === 'light');
    document.documentElement.classList.toggle('dark', t === 'dark');
  }
});

/* ══════════ AXION CRM BRIDGE ══════════ */
(function () {
  var isIframe = window.parent !== window;

  window.__axionSendResult = function (data) {
    window.__AXION_RESULT = data;
    // Local event (for Tauri WebviewWindow mode)
    window.dispatchEvent(new CustomEvent('axion-calculator-result', { detail: data }));
    // postMessage to parent (for iFrame mode in Axion)
    if (isIframe) {
      window.parent.postMessage(data, '*');
    }
  };
})();

/* ══════════ FLV MATH — shared across calculators ══════════ */

/**
 * Wertstand-Tabellen fuer einen FLV-Anbieter laden.
 * Parametrisiert (kein DOM-Zugriff), nutzt globales CONFIG aus loadConfig().
 * @param {string} anbieterKey  z.B. 'donau'
 * @param {number} alter        Einstiegsalter
 * @returns {{ mb100, mb500, laufzeit_max, matched_alter, alter, ref } | null}
 */
function getFlvTables(anbieterKey, alter) {
  anbieterKey = anbieterKey || 'donau';
  alter = alter ?? 20;
  const provider = CONFIG?.flv_anbieter?.[anbieterKey];
  if (!provider?.wertstand_tabellen) return null;
  const avail = Object.keys(provider.wertstand_tabellen)
    .filter(k => k.startsWith('alter_'))
    .map(k => +k.replace('alter_', ''))
    .sort((a, b) => a - b);
  if (!avail.length) return null;
  let best = avail[0];
  for (const a of avail) { if (a <= alter) best = a; else break; }
  const wt = provider.wertstand_tabellen['alter_' + best];
  if (!wt) return null;
  let mb100 = wt.mb100 || wt.mb100_rückkaufswert || null;
  let mb500 = wt.mb500 || wt.mb500_rückkaufswert || null;
  if (!mb500 && mb100) {
    mb500 = {};
    for (const [k, v] of Object.entries(mb100)) { if (!k.startsWith('_')) mb500[k] = v * 5; }
  }
  return {
    mb100, mb500,
    laufzeit_max: wt._laufzeit_max || 45,
    matched_alter: best,
    alter,
    ref: provider.hochrechnungszins_referenz_pct ? provider.hochrechnungszins_referenz_pct / 100 : 0.06
  };
}

/**
 * FLV vs Depot Berechnung — Jahres-Ergebnisse.
 * 1:1 Portierung aus index.html (3-Saeulen langfristig).
 * @param {number} mb        Monatsbeitrag
 * @param {number} lj        Laufzeit (Jahre)
 * @param {number} rpa       Marktrendite (dezimal, z.B. 0.07)
 * @param {Array}  ein       Einmalzahlungen [{j, b}, ...]
 * @param {Object} flv       FLV-Kosten {ai, lk}
 * @param {Object} dep       Depot-Kosten {ag, sp, ez, ter, ke, dv, ae, dg, spread}
 * @param {number} dynamik   Beitragsdynamik (dezimal)
 * @param {number} flvTer    Fonds-TER (dezimal)
 * @param {number} flvRefTer Referenz-TER (dezimal)
 * @param {Object} [tables]  Ergebnis von getFlvTables() — optional
 * @returns {Array<{J, E, FN, TN, AN}>}
 */
function calcFLV(mb, lj, rpa, ein, flv, dep, dynamik, flvTer, flvRefTer, tables) {
  dynamik = dynamik || 0; flvTer = flvTer || 0; flvRefTer = flvRefTer || 0;
  const terDiff = flvTer - flvRefTer;
  const rpaAdj = rpa - terDiff;
  tables = tables || getFlvTables();
  const ref = tables?.ref || 0.06, qr = Math.pow(1 + ref, 1 / 12);
  function rwr(m, n) { return Math.abs(ref) < 1e-8 ? m * n : m * ((Math.pow(qr, n) - 1) / (qr - 1)); }
  const b1 = tables?.mb100 || { 0: 0, 1: 618.06, 2: 1270.27, 3: 1961.42, 4: 2693.89, 5: 3470.10, 10: 11062.82, 15: 21209.92, 20: 34766.96, 25: 52875.92, 30: 77060, 35: 109352.45, 40: 152464.60 };
  const b5 = tables?.mb500 || { 0: 0, 1: 3204.64, 2: 6597.50, 3: 10192.99, 4: 14003.30, 5: 18041.10, 10: 56149.33, 15: 108933.69, 20: 178401.14, 25: 271203.42, 30: 395157.38, 35: 560699.45 };
  const qf = Math.pow(1 + rpaAdj, 1 / 12), qd = Math.pow(1 + rpa - dep.ter - (dep.dg || 0), 1 / 12);
  function rwf(m, n) { return Math.abs(rpaAdj) < 1e-8 ? m * n : m * ((Math.pow(qf, n) - 1) / (qf - 1)); }
  const res = []; let kum = 0, fm = 0, kt = 0, bt = 0, ka = 0, ba = 0;
  const sp = dep.spread || 0;
  let kumE = 0;
  for (const a of ein) if (a.j <= 0) { kum += a.b; bt += a.b; ba += a.b; const n = Math.max(0, a.b * (1 - dep.ag) * (1 - sp) - dep.ez); kt += n; ka += n; }
  for (let j = 1; j <= lj; j++) {
    const mb_j = mb * Math.pow(1 + dynamik, j - 1);
    let bs, be, am;
    if (j <= 5) { bs = j - 1; be = j; am = 12; } else { bs = Math.floor((j - 1) / 5) * 5; be = bs + 5; am = 60; }
    function mr(ks, ke) { return (ke - ks * Math.pow(qr, am)) / rwr(1, am); }
    let m1, m5;
    if (b1[be] !== undefined && b5[be] !== undefined) { m1 = mr(b1[bs], b1[be]); m5 = mr(b5[bs], b5[be]); }
    else {
      const bk = Object.keys(b1).map(Number).filter(k => k >= 0 && k % 5 === 0).sort((a, b2) => a - b2);
      const fb = bk.length >= 2 ? bk.slice(-2) : [35, 40];
      m1 = mr(b1[fb[0]] || 0, b1[fb[1]] || b1[fb[0]] || 0);
      m5 = mr(b5[fb[0]] || 0, b5[fb[1]] || b5[fb[0]] || 0);
    }
    const ma = m1 + (m5 - m1) * ((mb_j - 100) / 400);
    fm = fm * Math.pow(qf, 12) + rwf(ma, 12);
    let fe = 0;
    for (const a of ein) {
      if (a.j === j) { kum += a.b; bt += a.b; ba += a.b; const n = Math.max(0, a.b * (1 - dep.ag) * (1 - sp) - dep.ez); kt += n; ka += n; }
      if (j >= a.j) { const jsa = a.j > 0 ? (j - a.j + 1) : j; fe += a.b * (1 - flv.ai) * Math.pow(1 - flv.lk, jsa) * Math.pow(1 + rpaAdj, jsa); }
    }
    for (let m = 1; m <= 12; m++) { bt += mb_j; ba += mb_j; const ns = Math.max(0, mb_j * (1 - dep.ag) * (1 - sp) - dep.sp); kt += ns; ka += ns; kt *= qd; ka *= qd; }
    kumE += mb_j * 12;
    const te = kt * dep.dv, st = te * dep.ae * dep.ke; kt -= st; bt += te * dep.ae;
    const da = ka * dep.dv, sa = da * dep.ke; ka -= sa; ba += da - sa;
    const kt_s = kt * (1 - sp), ka_s = ka * (1 - sp);
    const FN = fm + fe, TN = kt_s - Math.max(0, kt_s - bt) * dep.ke, AN = ka_s - Math.max(0, ka_s - ba) * dep.ke;
    res.push({ J: j, E: kumE + kum, FN, TN, AN });
  }
  return res;
}

/** FLV-Endwert fuer gegebene Sparrate. einmalArr = [{j, b}, ...] optional. */
function calcFlvEndwert(mb, laufzeit, rpa, tables, einmalArr) {
  const ZERO_DEP = { ag: 0, sp: 0, ez: 0, ter: 0, ke: 0, dv: 0, ae: 0, dg: 0, spread: 0 };
  const ein = Array.isArray(einmalArr) ? einmalArr : (einmalArr > 0 ? [{ j: 0, b: einmalArr }] : []);
  const data = calcFLV(mb, laufzeit, rpa, ein, { ai: 0, lk: 0 }, ZERO_DEP, 0, 0, 0, tables);
  return data.length ? data[data.length - 1].FN : 0;
}

/** Bisection: benoetigte monatliche FLV-Rate fuer ein Zielkapital. */
function bisectionFlv(zielKapital, laufzeit, rpa, tables, einmalArr) {
  if (zielKapital <= 0) return 0;
  const ein = Array.isArray(einmalArr) ? einmalArr : (einmalArr > 0 ? [{ j: 0, b: einmalArr }] : []);
  let lo = 1, hi = 10000;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const ew = calcFlvEndwert(mid, laufzeit, rpa, tables, ein);
    if (ew < zielKapital) lo = mid; else hi = mid;
    if (Math.abs(hi - lo) < 0.5) break;
  }
  return Math.ceil((lo + hi) / 2);
}

/* ══════════ AXION PREFILL — empfaengt Kundendaten ══════════ */
window.addEventListener('message', function (e) {
  if (e.data?.type === 'axion-prefill') {
    var d = e.data;
    if (d.geburtsdatum) {
      // Pensionsluecke
      var el = document.getElementById('p_geburt') || document.getElementById('gebdat');
      if (el) { el.value = d.geburtsdatum; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
      // Sparrechner
      var el2 = document.getElementById('ls_geburt');
      if (el2) { el2.value = d.geburtsdatum; el2.dispatchEvent(new Event('change')); }
      // 3-Saeulen
      var el3 = document.getElementById('l_gebdat');
      if (el3) { el3.value = d.geburtsdatum; el3.dispatchEvent(new Event('change')); }
    }
    if (d.einkommen) {
      var el = document.getElementById('p_eink') || document.getElementById('einkommen');
      if (el) { el.value = d.einkommen; el.dispatchEvent(new Event('input')); }
    }
    if (d.geschlecht) {
      var el = document.getElementById('p_geschlecht');
      if (el) { el.value = d.geschlecht; el.dispatchEvent(new Event('change')); }
    }
    if (d.luecke) {
      var el = document.getElementById('ls_luecke') || document.getElementById('luecke') || document.getElementById('p_luecke') || document.getElementById('sparrate_ziel');
      if (el) { el.value = d.luecke; el.dispatchEvent(new Event('input')); }
    }
    if (d.k_einkommen) {
      var el = document.getElementById('k_eink');
      if (el) { el.value = d.k_einkommen; el.dispatchEvent(new Event('input')); }
    }
    // Modus ZUERST setzen, damit Felder sichtbar sind bevor sie befuellt werden
    if (d.modus && typeof setMode === 'function') {
      setMode(d.modus);
    }
    if (d.zielbetrag) {
      var el = document.getElementById('m_ziel');
      if (el) { el.value = d.zielbetrag; el.dispatchEvent(new Event('input')); }
    }
    if (d.laufzeit) {
      var el = document.getElementById('m_jahre') || document.getElementById('mf_jahre');
      if (el) { el.value = d.laufzeit; el.dispatchEvent(new Event('input')); }
      var el2 = document.getElementById('l_lj');
      if (el2) { el2.value = d.laufzeit; el2.dispatchEvent(new Event('input')); }
    }
    if (d.monatsbeitrag !== undefined) {
      var el = document.getElementById('l_mb');
      if (el) { el.value = d.monatsbeitrag; el.dispatchEvent(new Event('input')); }
    }
    if (d.startkapital !== undefined) {
      var el = document.getElementById('m_start') || document.getElementById('mf_start');
      if (el) { el.value = d.startkapital; el.dispatchEvent(new Event('input')); }
    }
    if (d.zielname) {
      var el = document.getElementById('m_name');
      if (el) { el.value = d.zielname; el.dispatchEvent(new Event('input')); }
    }
    if (d.einmalzahlungen !== undefined) {
      if (typeof lsEinmal !== 'undefined') {
        lsEinmal = Array.isArray(d.einmalzahlungen) ? d.einmalzahlungen : [];
        if (typeof renderLsEinmal === 'function') renderLsEinmal();
      }
    }
    // Legacy single value support
    if (d.einmalinvestment !== undefined && d.einmalinvestment > 0) {
      if (typeof lsEinmal !== 'undefined') {
        lsEinmal = [{ j: 0, b: d.einmalinvestment }];
        if (typeof renderLsEinmal === 'function') renderLsEinmal();
      }
    }
    if (d.clearEinmal) {
      if (typeof einmal !== 'undefined') einmal = [];
      if (typeof renderEinmal === 'function') renderEinmal();
      if (typeof lsEinmal !== 'undefined') { lsEinmal = []; if (typeof renderLsEinmal === 'function') renderLsEinmal(); }
    }
    // 3-Säulen: zur richtigen Sub-View navigieren
    // view = 'kurz' | 'mittel' | 'lang'
    if (d.view && typeof goTo === 'function') {
      goTo(d.view);
    }
  }
  if (e.data?.type === 'axion-save-request') {
    // Set mode BEFORE calculating (for Zielsparen)
    if (e.data.modus && typeof setMode === 'function') {
      setMode(e.data.modus);
    }
    var view = e.data.view;
    // 3-Säulen: zur richtigen Sub-View navigieren und berechnen
    if (view && typeof goTo === 'function') {
      goTo(view);
      if (view === 'kurz' && typeof berechneKurz === 'function') berechneKurz();
      else if (view === 'mittel' && typeof berechneMittel === 'function') berechneMittel();
      else if (view === 'lang' && typeof berechneLang === 'function') berechneLang();
    }
    else if (typeof berechne === 'function') berechne();
    else if (typeof calculate === 'function') calculate();
    else if (typeof berechneGFB === 'function') berechneGFB();
    else if (typeof berechneKurz === 'function') berechneKurz();
  }
});
