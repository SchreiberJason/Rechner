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
  if (!window.__axionToolbar) return;

  window.__axionSendResult = function (data) {
    // data = { type: "3saeulen"|"pensionsluecke"|"bav"|"ifb", inputs: {...}, results: {...} }
    window.__AXION_RESULT = data;
    window.dispatchEvent(new CustomEvent('axion-calculator-result', { detail: data }));
  };
})();
