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

/* ══════════ AXION PREFILL — empfaengt Kundendaten ══════════ */
window.addEventListener('message', function (e) {
  if (e.data?.type === 'axion-prefill') {
    var d = e.data;
    if (d.geburtsdatum) {
      var el = document.getElementById('p_geburt') || document.getElementById('gebdat');
      if (el) { el.value = d.geburtsdatum; el.dispatchEvent(new Event('input')); }
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
    if (d.clearEinmal) {
      if (typeof einmal !== 'undefined') einmal = [];
      if (typeof renderEinmal === 'function') renderEinmal();
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
