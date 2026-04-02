/* ══════════════════════════════════════════════
   SHARED.JS — Gemeinsame Funktionen für alle Rechner
   Jason Schreiber · jasonschreiber.at
══════════════════════════════════════════════════ */

/* ══════════ ZUGRIFFSSCHUTZ ══════════ */
function checkAccess(accessKey) {
  const isLocal = ['localhost','127.0.0.1',''].includes(location.hostname);
  const validRef = document.referrer.includes('jasonschreiber.at');
  const urlKey = new URLSearchParams(location.search).get('access');
  if (!isLocal && !validRef && urlKey !== accessKey) {
    document.body.style.cssText = 'margin:0;background:#0F0F0F;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;';
    document.body.innerHTML = '<div style="color:#555;font-size:14px;text-align:center"><div style="font-size:32px;margin-bottom:12px">&#128274;</div>Zugriff nicht gestattet.</div>';
    throw new Error('Access denied');
  }
}

/* ══════════ IFRAME HEIGHT (postMessage) ══════════ */
function sendHeight() {
  if (window.parent === window) return;
  const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  window.parent.postMessage({ type: 'resize', height: h }, '*');
}
window.addEventListener('resize', () => sendHeight());
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => sendHeight()).observe(document.body);
}

/* ══════════ NUMBER FORMATTING ══════════ */
const fmt = n => n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fE = n => fmt(n) + ' \u20AC';
const fP = n => (n * 100).toFixed(1).replace('.', ',') + ' %';
const eurN = v => { if (v >= 1e6) return (v / 1e6).toFixed(1) + ' M'; if (v >= 1e3) return (v / 1e3).toFixed(0) + ' K'; return v.toFixed(0); };
const vv = id => parseFloat(document.getElementById(id).value) || 0;

/* ══════════ CONFIG LOADER ══════════ */
var CFG = null;
async function loadConfig() {
  try {
    const r = await fetch('config.json?v=' + Date.now());
    CFG = await r.json();
  } catch (e) { console.warn('config.json nicht geladen, Fallback-Werte aktiv.', e); }
  return CFG;
}

/* ══════════ COLLAPSIBLE SECTIONS ══════════ */
function toggleColl(t) {
  t.classList.toggle('open');
  document.getElementById(t.id.replace('ct-', 'cb-')).classList.toggle('open');
}

/* ══════════ PANEL HEIGHT LIMITER ══════════ */
function updatePanelMaxHeight() {
  const panel = document.querySelector('.params-panel');
  const rp = document.querySelector('.rp');
  if (!panel || !rp) return;
  if (window.innerWidth < 720) { panel.style.maxHeight = ''; return; }
  const rpH = rp.offsetHeight;
  if (rpH > 0) panel.style.maxHeight = rpH + 'px';
}
window.addEventListener('resize', () => updatePanelMaxHeight());
if (typeof ResizeObserver !== 'undefined') {
  const _rp = document.querySelector('.rp');
  if (_rp) new ResizeObserver(() => updatePanelMaxHeight()).observe(_rp);
}
