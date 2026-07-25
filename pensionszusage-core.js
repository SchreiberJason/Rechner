/* ═══════════════════════════════════════════════════════════════════════════
   PENSIONSZUSAGE-RECHNER — Rechenkern
   Österreich, direkte Leistungszusage (§ 14 EStG, § 37 EStG, BPG)

   Aufbau:
     1. Konstanten + applyPzConfig()
     2. Formatierung / Helfer
     3. Steuer & Sozialversicherung
     4. Lohnnebenkosten
     5. Biometrie & Kommutationszahlen
     6. § 14 Teilwertverfahren
     7. Produktadapter (Rückdeckungsversicherung)
     8. Vergleichspfade
     9. IRR / Systemrendite
    10. Zulässigkeitsmatrix
    11. DOM / Rendering

   Alles bis einschließlich Abschnitt 10 ist DOM-frei und damit direkt testbar.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ══════════ 1. KONSTANTEN (Fallback, werden von config.json überschrieben) ══════════ */
let TAX_BRACKETS = [
  { bis: 13539, satz: 0 }, { bis: 21992, satz: 0.20 }, { bis: 36458, satz: 0.30 },
  { bis: 70365, satz: 0.40 }, { bis: 104859, satz: 0.48 }, { bis: 1000000, satz: 0.50 }
];
let SPITZEN_SATZ = 0.55, SPITZEN_AB = 1000000;
let ABSETZ_AN = 1542, PENSIONISTEN_ABSETZ = 1121;
let SZ_SATZ = 0.06, SZ_FREIBETRAG = 620;

let SV_KV = 3.87, SV_PV = 10.25, SV_AV = 2.95, SV_AK = 0.5, SV_WBF = 0.5;
let SV_AV_STAFFEL = [{ bis: 2225, satz: 0 }, { bis: 2427, satz: 1 }, { bis: 2630, satz: 2 }];
let HBGL = 6930;

let KOEST = 23.0, KEST_STD = 27.5;
let LNK = { dgSv: 20.98, sonstige: 0.22, db: 3.7, dz: 0.36, kommst: 3.0, mvk: 1.53 };

let PZ_ZINS = 6.0, PZ_DECKUNG = 50.0, PZ_STRAF = 30.0;
let PZ_HST = { minBeteiligung: 25.0, minLaufzeit: 7, minAlter: 60 };
let PZ_ANGEM_MAX = 80.0;
let PZ_KLASSIK_MIN = 30.0;
let PZ_RENTE_KV = 5.1;
let PZ_PK = { verwaltung: 0.0, veranlagung: 0.0 };
let PZ_RDV = null;
let QX_M = null, QX_W = null, STERBETAFEL_META = {};

function applyPzConfig() {
  if (typeof CONFIG === 'undefined' || !CONFIG) return;
  const st = CONFIG.steuern || {}, sv = CONFIG.sozialversicherung || {};
  const lnk = CONFIG.lohnnebenkosten || {}, pz = CONFIG.pensionszusage || {};
  const stf = CONFIG.sterbetafel || {}, koe = CONFIG.koerperschaftsteuer || {};

  if (st.lohnsteuer_tarifstufen) TAX_BRACKETS = st.lohnsteuer_tarifstufen.map(s => ({ bis: s.bis, satz: s.satz }));
  if (st.arbeitnehmer_absetzbetrag_eur != null) ABSETZ_AN = st.arbeitnehmer_absetzbetrag_eur;
  if (st.pensionisten_absetzbetrag_eur != null) PENSIONISTEN_ABSETZ = st.pensionisten_absetzbetrag_eur;
  if (st.sonderzahlung_pauschalsatz_pct != null) SZ_SATZ = st.sonderzahlung_pauschalsatz_pct / 100;
  if (st.sonderzahlung_freibetrag_eur != null) SZ_FREIBETRAG = st.sonderzahlung_freibetrag_eur;
  if (st.kest_standard_pct != null) KEST_STD = st.kest_standard_pct;

  if (sv.an_kv_pct != null) SV_KV = sv.an_kv_pct;
  if (sv.an_pv_pct != null) SV_PV = sv.an_pv_pct;
  if (sv.an_av_pct != null) SV_AV = sv.an_av_pct;
  if (sv.an_ak_pct != null) SV_AK = sv.an_ak_pct;
  if (sv.an_wbf_pct != null) SV_WBF = sv.an_wbf_pct;
  if (sv.av_staffelung) SV_AV_STAFFEL = sv.av_staffelung;
  if (sv.hbgg_asvg_monat_eur != null) HBGL = sv.hbgg_asvg_monat_eur;

  if (koe.satz_pct != null) KOEST = koe.satz_pct;
  if (lnk.dg_sv_pct != null) LNK.dgSv = lnk.dg_sv_pct;
  if (lnk.sonstige_dg_pct != null) LNK.sonstige = lnk.sonstige_dg_pct;
  if (lnk.db_pct != null) LNK.db = lnk.db_pct;
  if (lnk.dz_pct != null) LNK.dz = lnk.dz_pct;
  if (lnk.kommst_pct != null) LNK.kommst = lnk.kommst_pct;
  if (lnk.mvk_pct != null) LNK.mvk = lnk.mvk_pct;

  if (pz.rechnungszins_pct != null) PZ_ZINS = pz.rechnungszins_pct;
  if (pz.deckungserfordernis_pct != null) PZ_DECKUNG = pz.deckungserfordernis_pct;
  if (pz.strafzuschlag_pct != null) PZ_STRAF = pz.strafzuschlag_pct;
  if (pz.haelftesteuersatz) {
    const h = pz.haelftesteuersatz;
    if (h.min_beteiligung_pct != null) PZ_HST.minBeteiligung = h.min_beteiligung_pct;
    if (h.min_laufzeit_jahre != null) PZ_HST.minLaufzeit = h.min_laufzeit_jahre;
    if (h.min_alter != null) PZ_HST.minAlter = h.min_alter;
  }
  if (pz.angemessenheit?.max_pct_letztbezug != null) PZ_ANGEM_MAX = pz.angemessenheit.max_pct_letztbezug;
  if (pz.hybrid?.klassik_anteil_min_pct != null) PZ_KLASSIK_MIN = pz.hybrid.klassik_anteil_min_pct;
  if (pz.firmenpension_kv_pct != null) PZ_RENTE_KV = pz.firmenpension_kv_pct;
  if (pz.pensionskasse) {
    PZ_PK.verwaltung = pz.pensionskasse.verwaltungskosten_pct || 0;
    PZ_PK.veranlagung = pz.pensionskasse.veranlagungskosten_pct || 0;
  }
  PZ_RDV = pz.rdv_tabellen || null;

  if (stf.qx_m) QX_M = stf.qx_m;
  if (stf.qx_w) QX_W = stf.qx_w;
  STERBETAFEL_META = { quelle: stf._quelle || '', hinweis: stf._hinweis || '', alterMax: stf._alter_max || 110 };
}

/* ══════════ 2. FORMATIERUNG / HELFER ══════════ */
const nf0 = n => (Math.round(n) || 0).toLocaleString('de-AT');
const fE = n => nf0(n) + ' €';
const fE2 = n => (n || 0).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fP = (n, d = 1) => (n || 0).toFixed(d).replace('.', ',') + ' %';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ══════════ 3. STEUER & SOZIALVERSICHERUNG ══════════ */

/** Einkommensteuer nach § 33 EStG auf ein Jahreseinkommen (Tarif, ohne Absetzbeträge). */
function calcLohnsteuer(taxableAnnual) {
  if (!(taxableAnnual > 0)) return 0;
  let steuer = 0, prev = 0;
  for (const s of TAX_BRACKETS) {
    const band = Math.max(0, Math.min(taxableAnnual, s.bis) - prev);
    steuer += band * s.satz;
    prev = s.bis;
    if (taxableAnnual <= s.bis) break;
  }
  if (taxableAnnual > SPITZEN_AB) steuer += (taxableAnnual - SPITZEN_AB) * SPITZEN_SATZ;
  return steuer;
}

/** Grenzsteuersatz in Prozent für ein Jahreseinkommen. */
function getGrenzsteuersatz(taxableAnnual) {
  const r = v => Math.round(v * 1e6) / 1e4; // Anteil -> Prozent, ohne Gleitkommarauschen
  if (taxableAnnual > SPITZEN_AB) return r(SPITZEN_SATZ);
  for (const s of TAX_BRACKETS) if (taxableAnnual <= s.bis) return r(s.satz);
  return r(SPITZEN_SATZ);
}

/** Arbeitnehmer-Sozialversicherung auf einen Monatsbruttobezug. */
function calcSV(bruttoMonat) {
  const basis = Math.min(Math.max(0, bruttoMonat), HBGL);
  let avRate = SV_AV;
  for (const s of SV_AV_STAFFEL) { if (bruttoMonat <= s.bis) { avRate = s.satz; break; } }
  const total = basis * (SV_KV + SV_PV + SV_AK + SV_WBF + avRate) / 100;
  return { basis, avRate, total };
}

/** Jahresnetto eines Angestellten aus dem Monatsbrutto (14 Bezüge). */
function nettoJahrAusBrutto(bruttoMonat) {
  if (!(bruttoMonat > 0)) return 0;
  const sv = calcSV(bruttoMonat).total;
  const laufend12 = Math.max(0, (bruttoMonat - sv) * 12);
  const lst12 = Math.max(0, calcLohnsteuer(laufend12) - ABSETZ_AN);
  const sz = Math.max(0, (bruttoMonat - sv) * 2);
  const lstSz = Math.max(0, sz - SZ_FREIBETRAG) * SZ_SATZ;
  return bruttoMonat * 14 - sv * 14 - lst12 - lstSz;
}

/**
 * Netto-Zuwachs aus einer Bruttoerhöhung — exakt marginal, weil die volle
 * Nettofunktion zweimal ausgewertet und differenziert wird.
 * @param bruttoJahrZuwachs zusätzlicher Jahresbruttobezug (auf 14 Bezüge verteilt)
 * @param basisBruttoMonat  bestehender Monatsbruttobezug
 */
function nettoZuwachsAusBrutto(bruttoJahrZuwachs, basisBruttoMonat) {
  if (!(bruttoJahrZuwachs > 0)) return 0;
  const neu = basisBruttoMonat + bruttoJahrZuwachs / 14;
  return nettoJahrAusBrutto(neu) - nettoJahrAusBrutto(basisBruttoMonat);
}

/**
 * Steuer auf eine Kapitalabfindung.
 * Mit Hälftesteuersatz (§ 37 Abs. 1 EStG): Der Durchschnittssteuersatz wird aus dem
 * Gesamteinkommen ermittelt, auf die außerordentlichen Einkünfte kommt die Hälfte davon.
 *   Steuer = ESt(gesamt) − Kapital · DSS/2
 */
function steuerKapitalabfindung(kapital, sonstigeEinkuenfte, haelfte) {
  const sonst = Math.max(0, sonstigeEinkuenfte);
  const gesamt = Math.max(0, kapital + sonst);
  if (gesamt <= 0) return { steuer: 0, dss: 0, effektiv: 0 };
  const estGesamt = calcLohnsteuer(gesamt);
  const dss = estGesamt / gesamt;
  const estSonst = calcLohnsteuer(sonst);
  // Gesamtsteuer: der Hälftesteuersatz wirkt auf die außerordentlichen Einkünfte.
  const entlastung = haelfte ? kapital * dss / 2 : 0;
  const steuerGesamt = Math.max(0, estGesamt - entlastung);
  // Ausgewiesen wird nur der auf die Abfindung entfallende Anteil.
  const steuer = Math.max(0, steuerGesamt - estSonst);
  return {
    steuer, dss, entlastung, estGesamt, estSonst, steuerGesamt, gesamt,
    effektiv: kapital > 0 ? steuer / kapital : 0
  };
}

/**
 * Steuer auf eine laufende Firmen-/Pensionskassenrente, marginal über den sonstigen Einkünften.
 *
 * Zwei Punkte, die hier bewusst so gelöst sind:
 * 1. Kein Pensionistenabsetzbetrag. In der Differenzrechnung kürzt er sich ohnehin weg, sobald
 *    die sonstigen Einkünfte über der Nullzone liegen; bei sonstigen Einkünften nahe null würde
 *    er dagegen fälschlich ein zweites Mal gewährt. § 33 Abs. 6 EStG schleift ihn zudem ein, bei
 *    den hier typischen Bezugshöhen ist er real null.
 * 2. 13./14. Bezug als sonstiger Bezug zum festen Satz — symmetrisch zum Gehaltspfad in
 *    nettoJahrAusBrutto(). Ohne das würde die Zusage gegenüber der Gehaltserhöhung systematisch
 *    schlechter gerechnet.
 */
function steuerRente(bruttoRenteJahr, sonstigeEinkuenfte, kvPct, bezuege) {
  const n = bezuege || 14;
  const kv = bruttoRenteJahr * (kvPct || 0) / 100;
  const basis = Math.max(0, bruttoRenteJahr - kv);
  const sonst = Math.max(0, sonstigeEinkuenfte);
  const laufend = basis * 12 / n;
  const sz = basis - laufend;
  const lstLaufend = Math.max(0, calcLohnsteuer(sonst + laufend) - calcLohnsteuer(sonst));
  const lstSz = Math.max(0, sz - SZ_FREIBETRAG) * SZ_SATZ;
  const lst = lstLaufend + lstSz;
  return { kv, lst, lstLaufend, lstSz, netto: basis - lst, abgaben: kv + lst };
}

/* ══════════ 4. LOHNNEBENKOSTEN ══════════ */

/**
 * Lohnnebenkostensatz in Prozent des Bruttobezugs.
 * Die Dienstgeber-Sozialversicherung entfällt oberhalb der Höchstbeitragsgrundlage,
 * DB / DZ / KommSt / MVK bleiben. Bei wesentlich beteiligten Geschäftsführern gibt es
 * keine ASVG-Dienstgeberbeiträge, DB / DZ / KommSt fallen jedoch sehr wohl an.
 */
/**
 * Beitragsunabhängiger Teil: DB, DZ, Kommunalsteuer — und die Mitarbeitervorsorgekasse
 * nur für echte Dienstnehmer. Der wesentlich beteiligte Geschäftsführer fällt nicht unter
 * das BMSVG, sondern trägt die Selbständigenvorsorge über die SVS selbst; sie gehört
 * deshalb nicht in die Arbeitgeberkosten. DB, DZ und KommSt fallen bei ihm sehr wohl an.
 */
function lnkFixSatz(opts) {
  const o = opts || {};
  const dz = o.dz != null ? o.dz : LNK.dz;
  return LNK.db + dz + LNK.kommst + (o.wesentlich ? 0 : LNK.mvk);
}

function lnkSatz(bruttoMonat, opts) {
  const o = opts || {};
  if (o.wesentlich) return lnkFixSatz(o);
  const anteilUnterHbgl = bruttoMonat > 0 ? Math.min(bruttoMonat, HBGL) / bruttoMonat : 1;
  return lnkFixSatz(o) + (LNK.dgSv + LNK.sonstige) * anteilUnterHbgl;
}

/**
 * Bruttobezug, der aus einem gegebenen Unternehmensaufwand finanzierbar ist.
 * Iterativ, weil der Lohnnebenkostensatz vom Bruttobezug abhängt (HBGL-Deckelung).
 * @param aufwandJahr    Gesamtaufwand des Unternehmens pro Jahr
 * @param basisBruttoMonat bestehender Monatsbruttobezug (für die HBGL-Lage)
 */
function bruttoAusAufwand(aufwandJahr, basisBruttoMonat, opts) {
  if (!(aufwandJahr > 0)) return 0;
  let brutto = aufwandJahr / 1.3;
  for (let i = 0; i < 80; i++) {
    const monatGesamt = basisBruttoMonat + brutto / 14;
    // Grenzbetrachtung: nur der Teil des Zuwachses unterhalb der HBGL trägt DG-SV.
    const svAlt = Math.min(basisBruttoMonat, HBGL);
    const svNeu = Math.min(monatGesamt, HBGL);
    const svAnteil = brutto > 0 ? (svNeu - svAlt) * 14 / brutto : 0;
    const o = opts || {};
    // Gleiche Quelle wie lnkSatz(), nur mit dem marginalen statt dem durchschnittlichen
    // SV-Anteil — der Zuwachs liegt ja unter Umständen ganz oder teilweise über der HBGL.
    const satz = lnkFixSatz(o) + (o.wesentlich ? 0 : (LNK.dgSv + LNK.sonstige) * svAnteil);
    const neu = aufwandJahr / (1 + satz / 100);
    if (Math.abs(neu - brutto) < 0.01) return neu;
    brutto = neu;
  }
  return brutto;
}

/** Netto nach Körperschaftsteuer und KESt (Gewinnausschüttung). */
function nettoAusAusschuettung(aufwandJahr, koestPct, kestPct) {
  return aufwandJahr * (1 - (koestPct != null ? koestPct : KOEST) / 100) * (1 - (kestPct != null ? kestPct : KEST_STD) / 100);
}

/* ══════════ 5. BIOMETRIE & KOMMUTATIONSZAHLEN ══════════ */

/** Überlebensordnung l[x] aus den Sterbewahrscheinlichkeiten q[x]. */
function buildLifeTable(qx) {
  const l = new Array(qx.length + 1);
  l[0] = 100000;
  for (let x = 0; x < qx.length; x++) l[x + 1] = l[x] * (1 - qx[x]);
  return l;
}

/** Kommutationszahlen D[x] = l[x]·v^x und N[x] = Σ D[k] für k ≥ x. */
function buildCommutation(l, zinsPct) {
  const v = 1 / (1 + zinsPct / 100);
  const n = l.length;
  const D = new Array(n), N = new Array(n);
  for (let x = 0; x < n; x++) D[x] = l[x] * Math.pow(v, x);
  N[n - 1] = D[n - 1];
  for (let x = n - 2; x >= 0; x--) N[x] = N[x + 1] + D[x];
  return { D, N, v };
}

/** Rentenbarwertfaktor, monatlich vorschüssig: ä_x = N/D − 11/24. */
function annuityDue12(comm, x) {
  if (!comm.D[x] || comm.D[x] <= 0) return 0;
  return Math.max(0, comm.N[x] / comm.D[x] - 11 / 24);
}

/** Überlebenswahrscheinlichkeit von Alter x bis x+t. */
function survival(l, x, t) {
  if (x + t >= l.length || !l[x]) return 0;
  return l[x + t] / l[x];
}

function getQx(geschlecht) {
  const q = geschlecht === 'w' ? QX_W : QX_M;
  return q && q.length ? q : null;
}

/* ══════════ 6. § 14 TEILWERTVERFAHREN ══════════ */

/**
 * Rückstellungsverlauf nach dem Teilwertverfahren (§ 14 Abs. 7 EStG).
 * Der Aufwand wird als gleichbleibender Jahresbetrag von der Zusageerteilung
 * bis zum Pensionsantritt verteilt.
 *
 *   JB      = Leistungsbarwert(x) / Anwartschafts-Rentenbarwert(x..y)
 *   TW(x+t) = Leistungsbarwert(x+t) − JB · (N[x+t]−N[y]) / D[x+t]
 *
 * @param comm      Kommutationszahlen zum Rechnungszins (6 % nach § 14)
 * @param xZusage   Alter bei Erteilung der Zusage
 * @param yPension  Pensionsalter
 * @param leistung  zugesagte Jahrespension (istRente) bzw. Kapital
 * @param istRente  true = Rentenzusage, false = Kapitalzusage
 * @returns { jb, tw: number[] }  tw[t] = Teilwert nach t Jahren, t = 0..n
 */
function teilwertSerie(comm, xZusage, yPension, leistung, istRente) {
  const n = Math.max(0, yPension - xZusage);
  const aeY = istRente ? annuityDue12(comm, yPension) : 1;
  const nenner = comm.N[xZusage] - comm.N[yPension];
  const jb = nenner > 0 ? leistung * comm.D[yPension] * aeY / nenner : 0;
  const tw = [];
  for (let t = 0; t <= n; t++) {
    const a = xZusage + t;
    if (!comm.D[a] || comm.D[a] <= 0) { tw.push(0); continue; }
    const leistungsBW = leistung * (comm.D[yPension] / comm.D[a]) * aeY;
    const kuenftigeJB = jb * (comm.N[a] - comm.N[yPension]) / comm.D[a];
    tw.push(Math.max(0, leistungsBW - kuenftigeJB));
  }
  return { jb, tw, leistungsBarwertEnde: leistung * aeY };
}

/**
 * Deckungserfordernis nach § 14 Abs. 5 EStG: 50 % der Rückstellung des
 * VORANGEGANGENEN Wirtschaftsjahres, gedeckt durch Rückkaufswert der
 * Rückdeckungsversicherung bzw. Wertpapiere. Fehlbetrag → 30 % Gewinnzuschlag.
 */
function deckungspruefung(twVorjahr, aktivwertRdv, wertpapiere) {
  const soll = Math.max(0, twVorjahr) * PZ_DECKUNG / 100;
  const ist = Math.max(0, aktivwertRdv || 0) + Math.max(0, wertpapiere || 0);
  const fehl = Math.max(0, soll - ist);
  return { soll, ist, fehlbetrag: fehl, strafzuschlag: fehl * PZ_STRAF / 100, gedeckt: fehl <= 0.005 };
}

/* ══════════ 7. PRODUKTADAPTER (RÜCKDECKUNGSVERSICHERUNG) ══════════ */

/**
 * Wert aus einer hinterlegten Modellrechnung, skaliert auf die tatsächliche Prämie.
 * Format identisch zu config.bav.zush_tabellen. Gibt null zurück, solange keine
 * Produktdaten hinterlegt sind — dann zeigt der Rechner "Produktdaten ausständig".
 */
function rdvLookup(tabelle, szenario, jahr, praemieMonat) {
  if (!PZ_RDV) return null;
  const t = (PZ_RDV[tabelle] || {})[szenario];
  if (!t) return null;
  const basis = PZ_RDV._basis_beitrag_monatlich_eur || 1;
  const scale = praemieMonat / basis;
  if (jahr <= 0) return 0;
  const keys = Object.keys(t).map(Number).sort((a, b) => a - b);
  if (!keys.length) return null;
  if (t[jahr] !== undefined) return t[jahr] * scale;
  let lo = keys[0], hi = keys[keys.length - 1];
  for (const k of keys) if (k <= jahr) lo = k;
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i] >= jahr) hi = keys[i];
  if (jahr > hi) {
    const last = keys.length - 1;
    let a = last - 1, b = last;
    if (last >= 2 && t[keys[b]] < t[keys[a]]) { a = last - 2; b = last - 1; }
    const slope = (t[keys[b]] - t[keys[a]]) / (keys[b] - keys[a]);
    const ex = t[keys[last]] + slope * (jahr - keys[last]);
    return Math.max(ex, t[keys[last]]) * scale;
  }
  if (lo === hi) return t[lo] * scale;
  return (t[lo] + (jahr - lo) / (hi - lo) * (t[hi] - t[lo])) * scale;
}

function hatProduktdaten() { return !!(PZ_RDV && PZ_RDV.veranlagungswert); }

/* ══════════ 8. VERGLEICHSPFADE ══════════ */

/** Endwert eines Privatdepots: monatliche Einzahlung, KESt auf den Gewinn am Ende. */
function depotEndwert(nettoProJahr, jahre, renditePct, kestPct) {
  if (!(nettoProJahr > 0) || !(jahre > 0)) return { endwert: 0, eingezahlt: 0, kest: 0 };
  const rm = Math.pow(1 + renditePct / 100, 1 / 12) - 1;
  const m = nettoProJahr / 12;
  let k = 0;
  for (let i = 0; i < Math.round(jahre * 12); i++) k = k * (1 + rm) + m;
  const ein = nettoProJahr * jahre;
  const gewinn = Math.max(0, k - ein);
  const kest = gewinn * kestPct / 100;
  return { endwert: k - kest, eingezahlt: ein, brutto: k, kest };
}

/**
 * Endwertfaktor einer monatlichen Einzahlung von 1 pro Jahr über n Jahre.
 * Basis für die Kongruenzrechnung (ohne KESt — die Rückdeckung ist steuerfrei).
 */
function endwertFaktor(jahre, renditePct) {
  if (!(jahre > 0)) return 0;
  const rm = Math.pow(1 + renditePct / 100, 1 / 12) - 1;
  let k = 0;
  for (let i = 0; i < Math.round(jahre * 12); i++) k = k * (1 + rm) + 1 / 12;
  return k;
}

/**
 * Kongruente Jahresprämie: der Betrag, der bei angenommener Verzinsung genau das
 * Kapital aufbaut, das zur Erfüllung der Zusage nötig ist.
 * Das ist KEINE Produktaussage, sondern folgt der vom Nutzer gesetzten Renditeannahme.
 * @param zielKapital  benötigtes Kapital bei Pensionsantritt
 */
function kongruentePraemie(zielKapital, jahre, renditePct) {
  const f = endwertFaktor(jahre, renditePct);
  return f > 0 ? zielKapital / f : 0;
}

/**
 * Barwert einer lebenslangen Jahresrente bei Pensionsantritt.
 *
 * Verwendet bewusst denselben Faktor annuityDue12() wie die Kapitalabfindung. Eine eigene
 * Jahressummation würde den rohen Faktor N/D liefern, also ohne die Korrektur −11/24 für
 * unterjährige Zahlung — die Rente käme dadurch schon vor Steuern rund 4 % höher heraus als
 * die Kapitalabfindung derselben Zusage. Die Auszahlungsform darf den Bruttowert der
 * Verpflichtung aber nicht verändern; der Unterschied zwischen den Modi muss allein aus der
 * Besteuerung stammen.
 */
function rentenBarwert(comm, yPension, jahresrente) {
  return jahresrente * annuityDue12(comm, yPension);
}

/* ══════════ 9. IRR / SYSTEMRENDITE ══════════ */

/**
 * Interner Zinsfuß für jährliche Einzahlungen und einen Endwert.
 * Bisektion, analog zum Vorgehen in shared.js.
 */
function irrAnnuitaet(einzahlungProJahr, jahre, endwert) {
  if (!(einzahlungProJahr > 0) || !(jahre > 0) || !(endwert > 0)) return null;
  const fv = r => {
    if (Math.abs(r) < 1e-9) return einzahlungProJahr * jahre;
    const rm = Math.pow(1 + r, 1 / 12) - 1;
    const m = einzahlungProJahr / 12;
    let k = 0;
    for (let i = 0; i < Math.round(jahre * 12); i++) k = k * (1 + rm) + m;
    return k;
  };
  let lo = -0.95, hi = 1.5;
  if (fv(lo) > endwert) return null;
  if (fv(hi) < endwert) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (fv(mid) < endwert) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2 * 100;
}

/* ══════════ 10. ZULÄSSIGKEIT (Rechtsform × Rolle) ══════════ */

/**
 * Zuordnungsmatrix aus der Präsentation (Folie 23).
 * moeglich = false → Pensionszusage für diese Konstellation nicht zulässig.
 */
const ROLLEN = {
  gmbh: [
    { k: 'an', n: 'Arbeitnehmer / Prokurist', moeglich: true, wesentlich: false },
    { k: 'gf25', n: 'Gesellschafter-GF bis 25 % Beteiligung', moeglich: true, wesentlich: false },
    { k: 'gf_gs', n: 'Gesellschafter-GF über 25 % Beteiligung', moeglich: true, wesentlich: true },
    { k: 'gs_ohne', n: 'Gesellschafter ohne Tätigkeit', moeglich: false, wesentlich: true }
  ],
  ag: [
    { k: 'an', n: 'Arbeitnehmer inkl. Vorstandsmitglieder', moeglich: true, wesentlich: false },
    { k: 'aktionaer', n: 'Aktionär', moeglich: false, wesentlich: true }
  ],
  eu: [
    { k: 'an', n: 'Arbeitnehmer', moeglich: true, wesentlich: false },
    { k: 'unternehmer', n: 'Unternehmer selbst', moeglich: false, wesentlich: true }
  ],
  og: [
    { k: 'an', n: 'Arbeitnehmer', moeglich: true, wesentlich: false },
    { k: 'gesellschafter', n: 'Gesellschafter', moeglich: false, wesentlich: true }
  ],
  kg: [
    { k: 'an', n: 'Arbeitnehmer', moeglich: true, wesentlich: false },
    { k: 'komplementaer', n: 'Komplementär', moeglich: false, wesentlich: true },
    { k: 'kommanditist', n: 'Kommanditist', moeglich: false, wesentlich: true }
  ],
  gmbhcokg: [
    { k: 'an', n: 'Arbeitnehmer', moeglich: true, wesentlich: false },
    // Der Geschäftsführer der Komplementär-GmbH ist bei dieser Rechtsform der
    // praktisch häufigste zulässige Fall — er ist Organ der GmbH, nicht Gesellschafter der KG.
    { k: 'gf_kompl_gmbh', n: 'Geschäftsführer der Komplementär-GmbH', moeglich: true, wesentlich: true },
    { k: 'komplementaer', n: 'Komplementär (die GmbH selbst)', moeglich: false, wesentlich: true },
    { k: 'kommanditist', n: 'Kommanditist', moeglich: false, wesentlich: true }
  ],
  gen: [
    { k: 'an', n: 'Arbeitnehmer inkl. Vorstandsmitglieder', moeglich: true, wesentlich: false },
    { k: 'genossenschafter', n: 'Genossenschafter', moeglich: false, wesentlich: true }
  ]
};

function getRolle(rechtsform, rolleKey) {
  const list = ROLLEN[rechtsform] || ROLLEN.gmbh;
  return list.find(r => r.k === rolleKey) || list[0];
}

/**
 * Darf die Zusage überhaupt durch Kapital abgefunden werden?
 *
 * Für Arbeitnehmer gilt das Betriebspensionsgesetz. § 5 BPG untersagt die Abfindung von
 * Anwartschaften und Leistungen; zulässig ist sie nur, wenn der Barwert die Kleinbetrags-
 * grenze nicht übersteigt. Der wesentlich beteiligte Gesellschafter-Geschäftsführer ist
 * kein Arbeitnehmer im Sinn des BPG — nur deshalb steht ihm die Abfindung und damit der
 * Hälftesteuersatz offen.
 */
function abfindungZulaessig(wesentlich) {
  return { zulaessig: !!wesentlich, grund: wesentlich ? null : 'bpg' };
}

/**
 * Prüft die Voraussetzungen für den Hälftesteuersatz nach § 37 Abs. 1 iVm Abs. 5 EStG.
 * Quelle: BAV_GmbH_Pensionszusage.pdf, Seite 6 (marCKus bAV-Consulting).
 * @returns { checks: [{ok,text}], erfuellt: boolean }
 */
function pruefeHaelftesteuersatz(p) {
  const checks = [
    {
      ok: p.wesentlich && p.beteiligung > PZ_HST.minBeteiligung,
      text: `Wesentliche Beteiligung von mehr als ${fP(PZ_HST.minBeteiligung, 0)} — dadurch selbständig nach § 22 Z 2 EStG. Aktuell ${fP(p.beteiligung, 0)}.`
    },
    {
      // Die Sieben-Jahres-Frist bezieht sich auf die selbständige Erwerbstätigkeit,
      // NICHT auf die Laufzeit der Zusage.
      ok: (p.jahreSelbstaendig || 0) >= PZ_HST.minLaufzeit,
      text: `Mindestens ${PZ_HST.minLaufzeit} Jahre selbständiger Unternehmer — aktuell ${(p.jahreSelbstaendig || 0).toFixed(0)} Jahre bei Pensionsantritt.`
    },
    {
      ok: p.modus === 'kapital',
      text: 'Kapitalabfindung als Auszahlungsform gewählt — die Option muss bereits vor Beendigung der Tätigkeit in der Zusage geregelt sein, die Forderung muss VOR Beendigung entstehen.'
    },
    {
      ok: p.pensionsalter >= PZ_HST.minAlter,
      text: `Einstellung der Erwerbstätigkeit und vollendetes ${PZ_HST.minAlter}. Lebensjahr — alternativ Erwerbsunfähigkeit oder Tod. Aktuell Pensionsantritt mit ${p.pensionsalter}.`
    }
  ];
  return { checks, erfuellt: checks.every(c => c.ok) };
}

/* ══════════════════════════════════════════════════════════════════════════
   11. DOM / RENDERING
   Ab hier wird auf das Dokument zugegriffen. Die Tests laden nur den Teil
   darueber; dieser Abschnitt bleibt im Testkontext inaktiv (kein Aufruf).
   ══════════════════════════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);
const vv = id => { const e = $(id); return e ? (parseFloat(e.value) || 0) : 0; };
const sv_ = (id, t) => { const e = $(id); if (e) e.textContent = t; };
const show = (id, on) => { const e = $(id); if (e) e.classList.toggle('hidden', !on); };

let MODUS = 'kapital';
// Bezüge pro Jahr der Firmenpension. 12 ist der Regelfall und passt zum Rentenbarwert-
// faktor annuityDue12(), der mit der Korrektur −11/24 zwölf monatliche Raten unterstellt.
let BEZUEGE = 12;
let lineChartInst = null;
const chartVis = { rst: true, deck: true, alt: true, ein: true };
const LC = { rst: 'rgb(56,217,163)', deck: 'rgb(251,191,36)', alt: 'rgb(167,139,250)', ein: '#555860' };
const LL = { rst: 'Rückstellung § 14', deck: 'Deckungserfordernis', alt: 'Alternative (Depot)', ein: 'Prämie kumuliert' };

/* ── Chart-Helfer (Muster aus bav-rechner.html) ── */
function tc() {
  const d = isDark();
  return {
    grid: d ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.28)',
    ticks: d ? '#666B78' : '#777777',
    tt: d ? '#F0EDE8' : '#1A1A1A', ts: '#969696',
    ac: d ? '#38D9A3' : '#00764A'
  };
}
function externalTooltip({ chart, tooltip }) {
  const el = $('chart-tip'); if (!el) return;
  if (!tooltip.opacity) { el.style.display = 'none'; return; }
  const t = tc();
  let html = `<div class="ctt" style="color:${t.tt}">${tooltip.title?.[0] || ''}</div>`;
  (tooltip.body || []).forEach((b, i) => {
    const col = tooltip.labelColors?.[i]?.backgroundColor || '#888';
    html += `<div class="cti" style="color:${t.ts}"><span class="ctd" style="background:${col}"></span>${(b.lines?.[0] || '').trim()}</div>`;
  });
  el.innerHTML = html; el.style.display = 'block';
  const r = chart.canvas.getBoundingClientRect();
  let x = r.left + tooltip.caretX + 14, y = r.top + tooltip.caretY - el.offsetHeight / 2;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (x + w > window.innerWidth - 8) x = r.left + tooltip.caretX - w - 14;
  if (x < 8) x = 8; if (y < 8) y = 8;
  if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
  el.style.left = x + 'px'; el.style.top = y + 'px';
}
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart) {
    if (!chart.tooltip._active?.length) return;
    const { ctx, chartArea: { top, bottom } } = chart;
    const x = chart.tooltip._active[0].element.x;
    ctx.save(); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom);
    ctx.lineWidth = 1; ctx.strokeStyle = isDark() ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.12)';
    ctx.setLineDash([4, 3]); ctx.stroke(); ctx.restore();
  }
};
function buildLegend() {
  const el = $('chart-legend'); if (!el) return;
  el.innerHTML = '';
  Object.keys(LL).forEach((k, idx) => {
    const btn = document.createElement('span');
    btn.className = 'li ' + (chartVis[k] ? 'on' : 'off');
    btn.innerHTML = `<span class="ld" style="background:${LC[k]}"></span>${LL[k]}`;
    btn.onclick = () => {
      chartVis[k] = !chartVis[k];
      btn.className = 'li ' + (chartVis[k] ? 'on' : 'off');
      if (lineChartInst) { lineChartInst.data.datasets[idx].hidden = !chartVis[k]; lineChartInst.update('none'); }
    };
    el.appendChild(btn);
  });
}

/* ── UI-Interaktion ── */
function toggleSection(ct) {
  ct.classList.toggle('open');
  const cb = ct.nextElementSibling;
  if (cb && cb.classList.contains('cb')) cb.classList.toggle('open');
  setTimeout(sendHeight, 50);
}
function toggleTable(key) {
  $(key + '-head').classList.toggle('open');
  $(key + '-wrap').classList.toggle('collapsed');
  setTimeout(sendHeight, 50);
}
function openModal(id) { $(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { $(id).classList.remove('open'); document.body.style.overflow = ''; }
function openInfoModal() { fillInfoModal(); openModal('info_overlay'); }
function openHstModal() { openModal('hst_overlay'); }
function setModus(m) {
  // Kapitalabfindung ist für Arbeitnehmer nach § 5 BPG gesperrt.
  if (m === 'kapital' && $('btn_kapital').classList.contains('locked')) {
    openModal('bpg_overlay');
    return;
  }
  MODUS = m;
  ['kapital', 'rente', 'pk'].forEach(k => $('btn_' + k).classList.toggle('active', k === m));
  sv_('modus_hint', {
    kapital: 'Kapitalabfindung — nur hier greift der Hälftesteuersatz.',
    rente: 'Firmenpension durch die verpflichtete Gesellschaft — voller Tarif als Pensionseinkünfte.',
    pk: 'Übertragung in eine Pensionskasse bzw. Betriebliche Kollektivversicherung — der Hälftesteuersatz entfällt dadurch.'
  }[m]);
  calculate();
}
function setBezuege(n) {
  BEZUEGE = n;
  $('btn_bez12').classList.toggle('active', n === 12);
  $('btn_bez14').classList.toggle('active', n === 14);
  sv_('bez_hint', n === 12
    ? 'Zwölf Monatsraten – der Regelfall bei einer Firmenpension.'
    : 'Vierzehn Bezüge: 13. und 14. gelten als sonstige Bezüge und werden mit ' + fP(SZ_SATZ * 100, 0) + ' besteuert.');
  calculate();
}
function onRechtsformChange() { buildRollenSelect(); calculate(); }
function setKongruentePraemie(monat) {
  $('praemie').value = Math.round(monat);
  calculate();
}

/**
 * Startwert der zugesagten Pension aus der Prämie ableiten, damit der Rechner
 * in einem in sich stimmigen Zustand öffnet statt sofort eine Kongruenzwarnung
 * zu zeigen. Nur beim Laden — danach sind beide Felder frei wählbar.
 */
function setStartZusage() {
  const geb = new Date($('gebdat').value || '1980-01-01');
  const alter = Math.max(18, Math.floor((new Date() - geb) / 31557600000));
  // Untergrenze 55, nicht 60 — sonst wäre die Altersvoraussetzung des Hälftesteuersatzes
  // durch den Clamp selbst erfüllt und der Check im Modal eine Tautologie.
  const pensionsalter = clamp(Math.round(vv('pension')), 55, 70);
  const jahre = Math.max(1, pensionsalter - alter);
  const ae = annuityDue12(buildCommutation(buildLifeTable(getQx($('geschlecht').value)), vv('abf_zins')), pensionsalter);
  if (!(ae > 0)) return;
  const kapital = endwertFaktor(jahre, vv('depot_rendite')) * vv('praemie') * 12;
  $('zusage_pension').value = Math.round(kapital / ae / 14 / 50) * 50;
}
function onZusageArtChange() {
  const art = $('zusageart').value;
  $('zusage_leistung_wrap').style.display = art === 'leistung' ? '' : 'none';
  sv_('zusageart_hint', art === 'leistung'
    ? 'Fixe Altersleistung — arbeitnehmerfreundlich. Achtung: Rückstellung und Vergleich bewerten hier nur die Altersleistung. Zusagen für Berufsunfähigkeit und Ableben sind zusätzlich zu kalkulieren und erhöhen die Rückstellung.'
    : 'Definierte Beiträge fließen in ein Pensionsmodell — arbeitgeberfreundlich. Braucht hinterlegte Produktdaten.');
  calculate();
}
function buildRollenSelect() {
  const rf = $('rechtsform').value;
  const sel = $('rolle');
  const prev = sel.value;
  sel.innerHTML = '';
  (ROLLEN[rf] || ROLLEN.gmbh).forEach(r => {
    const o = document.createElement('option');
    o.value = r.k; o.textContent = r.n;
    sel.appendChild(o);
  });
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  const wes = getRolle(rf, sel.value).wesentlich;
  const mitAnteilen = rf === 'gmbh' || rf === 'ag' || rf === 'gmbhcokg';
  $('btlg_wrap').style.display = mitAnteilen && wes ? '' : 'none';
}

/* ── Info-Modal befüllen ── */
function fillInfoModal() {
  const t = $('info-tax-table');
  if (t) {
    let h = '', prev = 0;
    for (const s of TAX_BRACKETS) {
      h += `<tr><td>${fE(prev)} – ${s.bis >= 1000000 ? '1.000.000 €' : fE(s.bis)}</td><td>${fP(s.satz * 100, 0)}</td></tr>`;
      prev = s.bis;
    }
    h += `<tr><td>über 1.000.000 €</td><td>${fP(SPITZEN_SATZ * 100, 0)}</td></tr>`;
    t.innerHTML = h;
  }
  const ln = $('info-lnk-table');
  if (ln) {
    ln.innerHTML =
      `<tr><td>Dienstgeber-Sozialversicherung</td><td>${fP(LNK.dgSv, 2)}</td></tr>` +
      `<tr><td>sonstige Kleinabgaben</td><td>${fP(LNK.sonstige, 2)}</td></tr>` +
      `<tr><td>Dienstgeberbeitrag (DB)</td><td>${fP(LNK.db, 2)}</td></tr>` +
      `<tr><td>Zuschlag (DZ)</td><td>${fP(vv('dz'), 2)}</td></tr>` +
      `<tr><td>Kommunalsteuer</td><td>${fP(LNK.kommst, 2)}</td></tr>` +
      `<tr><td>Mitarbeitervorsorgekasse</td><td>${fP(LNK.mvk, 2)}</td></tr>`;
  }
  sv_('info-sterbetafel', STERBETAFEL_META.quelle + ' — ' + STERBETAFEL_META.hinweis);
}

/* ── Hälftesteuersatz-Modal befüllen ── */
function fillHstModal(pruef) {
  const el = $('hst-checks'); if (!el) return;
  el.innerHTML = pruef.checks.map(c =>
    `<div class="chk"><span class="chk-ic ${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✕'}</span><span class="chk-tx">${c.text}</span></div>`
  ).join('');
  sv_('hst-summary', pruef.erfuellt
    ? 'Alle vier Voraussetzungen sind erfüllt — die Kapitalabfindung kann mit dem Hälftesteuersatz besteuert werden.'
    : 'Mindestens eine Voraussetzung ist nicht erfüllt. Der Rechner verwendet deshalb den vollen Tarif.');
}

/* ══════════ HAUPTBERECHNUNG ══════════ */
function calculate() {
  if (!QX_M) return;

  /* --- Eingaben --- */
  const geb = new Date($('gebdat').value || '1980-01-01');
  const heute = new Date();
  const alter = Math.max(18, Math.floor((heute - geb) / 31557600000));
  // Untergrenze 55, nicht 60 — sonst wäre die Altersvoraussetzung des Hälftesteuersatzes
  // durch den Clamp selbst erfüllt und der Check im Modal eine Tautologie.
  const pensionsalter = clamp(Math.round(vv('pension')), 55, 70);
  const geschlecht = $('geschlecht').value;
  const einkommen = vv('einkommen');
  const rf = $('rechtsform').value;
  const rolle = getRolle(rf, $('rolle').value);
  const beteiligung = rolle.wesentlich ? vv('beteiligung') : 0;
  const wesentlich = rolle.wesentlich && beteiligung > PZ_HST.minBeteiligung;
  const dz = vv('dz');
  const zusageDat = $('zusagedat').value ? new Date($('zusagedat').value) : heute;
  const zusageAlter = clamp(Math.floor((zusageDat - geb) / 31557600000), 18, pensionsalter - 1);
  const laufzeit = Math.max(1, pensionsalter - zusageAlter);
  const restLaufzeit = Math.max(1, pensionsalter - alter);
  const praemieM = vv('praemie');
  const aufwandJahr = praemieM * 12;
  const zusagePensionM = vv('zusage_pension');
  const zusagePensionJahr = zusagePensionM * BEZUEGE;
  const sonstEink = vv('sonst_eink');
  const abfZins = vv('abf_zins');
  const depotRendite = vv('depot_rendite');
  const kest = vv('kest');
  const klassik = vv('klassik');

  /* --- Auto-Info --- */
  const svM = calcSV(einkommen).total;
  const grenz = getGrenzsteuersatz(Math.max(0, (einkommen - svM) * 12));
  sv_('ai-alter', alter + ' Jahre');
  sv_('ai-laufzeit', laufzeit + ' Jahre');
  sv_('ai-grenz', fP(grenz, 0));

  /* --- Berechnungsblatt: Ausgangsdaten --- */
  RB = [];
  rbSec('Ausgangsdaten');
  rbRow('Geburtsdatum', '', new Date($('gebdat').value).toLocaleDateString('de-AT'));
  rbRow('Alter heute', '', alter + ' Jahre');
  rbRow('Geschlecht', 'bestimmt die Sterbetafel', geschlecht === 'w' ? 'weiblich' : 'männlich');
  rbRow('Pensionsantritt', '', pensionsalter + ' Jahre');
  rbRow('Laufende Bezüge', '14 × ' + fE(einkommen), fE(einkommen * 14) + ' p.a.');
  rbRow('Grenzsteuersatz Aktivzeit', 'auf ' + fE(Math.max(0, (einkommen - svM) * 12)) + ' Bemessung', fP(grenz, 0));
  rbRow('Rechtsform / Rolle', rf.toUpperCase(), rolle.n);
  if (rolle.wesentlich) rbRow('Beteiligung', '', fP(beteiligung, 0));
  rbRow('Zusage erteilt am', '', zusageDat.toLocaleDateString('de-AT'));
  rbRow('Alter bei Zusageerteilung', '', zusageAlter + ' Jahre');
  rbRow('Laufzeit der Zusage', pensionsalter + ' − ' + zusageAlter, laufzeit + ' Jahre');
  rbRow('Restlaufzeit ab heute', pensionsalter + ' − ' + alter, restLaufzeit + ' Jahre');

  /* --- Zulässigkeit (Folie 23) --- */
  if (!rolle.moeglich) {
    $('note-zul').innerHTML = `<b>Pensionszusage hier nicht möglich</b>Für die Rolle „${rolle.n}“ in dieser Rechtsform ist eine direkte Leistungszusage nicht zulässig — diese Person ist nicht Dienstnehmer im steuerlichen Sinn. Möglich sind hier Pensionskasse oder Betriebliche Kollektivversicherung; für Arbeitnehmer desselben Unternehmens ist die Pensionszusage sehr wohl zulässig.`;
    show('note-zul', true);
    ['hero', 'cmp-body'].forEach(id => { const e = $(id); if (e) e.style.opacity = '.35'; });
    sv_('hero-val', '—'); sv_('hero-label', 'Konstellation nicht zulässig');
    setTimeout(sendHeight, 60);
    return;
  }
  show('note-zul', false);
  ['hero', 'cmp-body'].forEach(id => { const e = $(id); if (e) e.style.opacity = ''; });

  /* --- Abfindungsverbot § 5 BPG für Arbeitnehmer --- */
  const abf = abfindungZulaessig(wesentlich);
  $('btn_kapital').classList.toggle('locked', !abf.zulaessig);
  $('selbst_wrap').style.display = wesentlich ? '' : 'none';
  show('note-bpg', !abf.zulaessig);
  if (!abf.zulaessig) {
    $('note-bpg').innerHTML =
      `<b>Kapitalabfindung ist hier nicht möglich</b>` +
      `Für Arbeitnehmer gilt das Betriebspensionsgesetz. § 5 BPG untersagt die Abfindung von Anwartschaften und laufenden Leistungen — zulässig ist sie nur, wenn der Barwert die Kleinbetragsgrenze nicht übersteigt. ` +
      `Damit entfällt für diese Rolle auch der Hälftesteuersatz, denn der setzt eine Kapitalabfindung voraus. ` +
      `Der wesentlich beteiligte Gesellschafter-Geschäftsführer ist kein Arbeitnehmer im Sinn des BPG — nur ihm steht dieser Weg offen. ` +
      `<a href="#" onclick="openModal('bpg_overlay');return false;" style="color:var(--ac)">Was das bedeutet</a>`;
    if (MODUS === 'kapital') {
      // Nicht still weiterrechnen — auf die zulässige Form umstellen.
      MODUS = 'rente';
      ['kapital', 'rente', 'pk'].forEach(k => $('btn_' + k).classList.toggle('active', k === MODUS));
      sv_('modus_hint', 'Firmenpension — für Arbeitnehmer die zulässige Auszahlungsform.');
    }
  }

  /* --- Hälftesteuersatz --- */
  const jahreSelbstaendig = wesentlich ? vv('selbst_jahre') : 0;
  const pruef = pruefeHaelftesteuersatz({ wesentlich, beteiligung, jahreSelbstaendig, modus: MODUS, pensionsalter });
  const hstAktiv = pruef.erfuellt && MODUS === 'kapital';
  fillHstModal(pruef);
  sv_('ai-hst', hstAktiv ? 'ja' : 'nein');
  const hstEl = $('ai-hst');
  if (hstEl) { hstEl.style.cursor = 'pointer'; hstEl.onclick = openHstModal; hstEl.style.textDecoration = 'underline dotted'; }

  /* --- Berechnungsblatt: Prüfungen --- */
  rbSec('Rechtliche Prüfungen');
  rbCheck(rolle.moeglich, 'Pensionszusage für diese Rechtsform und Rolle zulässig');
  rbCheck(abf.zulaessig, 'Kapitalabfindung zulässig (§ 5 BPG — Abfindungsverbot für Arbeitnehmer)');
  rbNote('Voraussetzungen des Hälftesteuersatzes nach § 37 Abs. 1 iVm Abs. 5 EStG:');
  pruef.checks.forEach(c => rbCheck(c.ok, '· ' + c.text));
  rbRow('Hälftesteuersatz anwendbar', pruef.erfuellt && MODUS === 'kapital' ? 'alle Voraussetzungen erfüllt' : 'mindestens eine Voraussetzung offen',
    hstAktiv ? 'ja' : 'nein', hstAktiv ? 'ok' : 'no');
  if (hstAktiv) rbNote('Der ermäßigte Steuersatz steht nur über Antrag an die Finanz zu. Die Forderung muss vor Beendigung der Tätigkeit entstehen.');

  /* --- Biometrie --- */
  const qx = getQx(geschlecht);
  const l = buildLifeTable(qx);
  const comm14 = buildCommutation(l, PZ_ZINS);
  const commAbf = buildCommutation(l, abfZins);
  const aeAbf = annuityDue12(commAbf, pensionsalter);

  rbSec('Biometrische Grundlagen');
  rbRow('Sterbetafel', STERBETAFEL_META.quelle || '—', 'Näherung');
  rbRow('Rentenbarwertfaktor ä bei Alter ' + pensionsalter, 'N/D − 11/24 bei ' + fP(abfZins), aeAbf.toFixed(4).replace('.', ','));
  rbNote('Monatlich vorschüssig. Derselbe Faktor gilt für Kapitalabfindung und Rentenbarwert, damit die Auszahlungsform den Bruttowert der Verpflichtung nicht verändert.');

  /* --- Pfad 1: Pensionszusage --- */
  rbSec('Weg 1 — Pensionszusage');
  rbRow('Unternehmensaufwand', '12 × ' + fE(praemieM), fE(aufwandJahr) + ' p.a.');
  rbNote('Fließt ungekürzt in die Rückdeckung — keine Lohnnebenkosten, keine Körperschaftsteuer, keine Lohnsteuer in der Ansparphase.');
  rbRow('Zugesagte Firmenpension', BEZUEGE + ' × ' + fE(zusagePensionM), fE(zusagePensionJahr) + ' p.a.');

  let bruttoZusage = 0, steuerZusage = 0, nettoZusage = 0, zusageDetail = '';
  if (MODUS === 'kapital') {
    bruttoZusage = zusagePensionJahr * aeAbf;
    const s = steuerKapitalabfindung(bruttoZusage, sonstEink, hstAktiv);
    steuerZusage = s.steuer; nettoZusage = bruttoZusage - steuerZusage;
    rbRow('Kapitalabfindung brutto', fE(zusagePensionJahr) + ' × ' + aeAbf.toFixed(4).replace('.', ','), fE(bruttoZusage));
    rbNote('Besteuerung der Abfindung — Schritt für Schritt:');
    rbRow('· Sonstige Einkünfte im Auszahlungsjahr', 'z. B. gesetzliche Pension', fE(sonstEink));
    rbRow('· Gesamteinkommen', fE(bruttoZusage) + ' + ' + fE(sonstEink), fE(s.gesamt));
    rbRow('· Einkommensteuer darauf', 'Tarif nach § 33 EStG', fE(s.estGesamt));
    rbRow('· Durchschnittssteuersatz', fE(s.estGesamt) + ' ÷ ' + fE(s.gesamt), fP(s.dss * 100, 2));
    if (hstAktiv) {
      rbRow('· davon die Hälfte', fP(s.dss * 100, 2) + ' ÷ 2', fP(s.dss * 50, 2));
      rbRow('· Ermäßigung nach § 37', fE(bruttoZusage) + ' × ' + fP(s.dss * 50, 2), '− ' + fE(s.entlastung), 'neg');
      rbRow('· Einkommensteuer nach Ermäßigung', fE(s.estGesamt) + ' − ' + fE(s.entlastung), fE(s.steuerGesamt));
    }
    rbRow('· abzüglich Steuer ohne die Abfindung', 'ESt auf ' + fE(sonstEink) + ' allein', '− ' + fE(s.estSonst), 'neg');
    rbRow('Steuer, die auf die Abfindung entfällt', fE(s.steuerGesamt) + ' − ' + fE(s.estSonst), '− ' + fE(steuerZusage), 'neg');
    rbRow('Netto in der Hand', fE(bruttoZusage) + ' − ' + fE(steuerZusage), fE(nettoZusage), 'sum');
    rbNote(hstAktiv
      ? 'Die Ermäßigung nach § 37 senkt die Steuer, nicht das Kapital. Ohne sie wären ' + fE(s.estGesamt - s.estSonst) + ' auf die Abfindung fällig statt ' + fE(steuerZusage) + ' — ein Unterschied von ' + fE(s.entlastung) + '.'
      : 'Ohne Hälftesteuersatz unterliegt die Abfindung zur Gänze dem progressiven Tarif.');
    // "Gesamtbelastung" statt "effektiver Steuersatz": die ausgewiesene Steuer enthält auch
    // die Progressionswirkung, die die Abfindung auf die sonstigen Einkünfte auslöst. Sie ist
    // deshalb höher als der halbe Durchschnittssteuersatz und darf nicht so genannt werden.
    zusageDetail = hstAktiv
      ? `Kapitalabfindung mit Hälftesteuersatz — halber Durchschnittssteuersatz ${fP(s.dss * 50)}, Gesamtbelastung der Abfindung ${fP(s.effektiv * 100)}.`
      : `Kapitalabfindung zum vollen Tarif — Gesamtbelastung der Abfindung ${fP(s.effektiv * 100)}.`;
  } else {
    const pkAbschlag = MODUS === 'pk' ? (1 - (PZ_PK.verwaltung + PZ_PK.veranlagung) / 100) : 1;
    const brutR = zusagePensionJahr * pkAbschlag;
    const r = steuerRente(brutR, sonstEink, PZ_RENTE_KV, BEZUEGE);
    bruttoZusage = rentenBarwert(commAbf, pensionsalter, brutR);
    nettoZusage = rentenBarwert(commAbf, pensionsalter, r.netto);
    steuerZusage = bruttoZusage - nettoZusage;
    if (MODUS === 'pk') rbRow('Abschlag Pensionskasse', fP(PZ_PK.verwaltung + PZ_PK.veranlagung, 2) + ' Kosten', fE(zusagePensionJahr - brutR), 'neg');
    rbRow('Jahresrente brutto', '', fE(brutR));
    rbRow('Krankenversicherungsbeitrag', fP(PZ_RENTE_KV, 2), '− ' + fE(r.kv), 'neg');
    rbRow('Lohnsteuer laufend', '12/' + BEZUEGE + ' marginal über ' + fE(sonstEink) + ' sonstigen Einkünften', '− ' + fE(r.lstLaufend), 'neg');
    if (BEZUEGE > 12) rbRow('Lohnsteuer 13./14. Bezug', fP(SZ_SATZ * 100, 0) + ' über Freibetrag ' + fE(SZ_FREIBETRAG), '− ' + fE(r.lstSz), 'neg');
    rbRow('Jahresrente netto', '', fE(r.netto));
    rbRow('Barwert brutto', fE(brutR) + ' × ' + aeAbf.toFixed(4).replace('.', ','), fE(bruttoZusage));
    rbRow('Netto-Barwert bei Pensionsantritt', fE(r.netto) + ' × ' + aeAbf.toFixed(4).replace('.', ','), fE(nettoZusage), 'sum');
    zusageDetail = (MODUS === 'pk' ? 'Übertragung in die Pensionskasse' : 'Firmenpension') +
      ` — ${fE(r.netto / BEZUEGE)} netto pro Bezug, kein Hälftesteuersatz, Gesamtbelastung ${fP(r.abgaben / brutR * 100)}. ` +
      `Barwert mit ${fP(abfZins)} kapitalisiert — identischer Faktor wie bei der Kapitalabfindung.`;
  }

  /* Ohne weitere Alterseinkünfte werden Rentenleistungen unrealistisch niedrig besteuert.
     Betrifft auch die Pensionskassen-Spalte, die immer als Rente besteuert wird. */
  const sonstFehlt = sonstEink <= 0;
  show('note-sonst', sonstFehlt);
  if (sonstFehlt) {
    // Rot, nicht gelb: In diesem Zustand kehrt sich die Reihenfolge der Auszahlungsformen um.
    $('note-sonst').className = 'pz-note err';
    $('note-sonst').innerHTML =
      `<b>Ohne gesetzliche Pension kippt der Vergleich der Auszahlungsformen</b>` +
      `Die sonstigen Einkünfte im Auszahlungsjahr stehen auf 0. Firmenpension und Pensionskasse werden dadurch besteuert, als wären sie das einzige Einkommen, und bleiben großteils in den unteren Tarifstufen. ` +
      `Dadurch erscheint die Rente günstiger als die Kapitalabfindung — obwohl bei ihr der volle Tarif greift und nicht der Hälftesteuersatz. ` +
      `<b style="display:inline">Trage die erwartete gesetzliche Jahrespension ein</b>, dann dreht sich das Bild um und die Kapitalabfindung liegt vorn.`;
  }

  /* --- Pfad 2: Alternative --- */
  let vglArt = $('vergleich').value;
  if (vglArt === 'auto') vglArt = wesentlich ? 'ausschuettung' : 'gehalt';
  let nettoAltJahr = 0, altZwischen = 0, altLabel = '';
  if (vglArt === 'ausschuettung') {
    altZwischen = aufwandJahr * (1 - KOEST / 100);
    nettoAltJahr = nettoAusAusschuettung(aufwandJahr, KOEST, kest);
    altLabel = 'Gewinnausschüttung';
  } else {
    altZwischen = bruttoAusAufwand(aufwandJahr, einkommen, { wesentlich, dz });
    nettoAltJahr = nettoZuwachsAusBrutto(altZwischen, einkommen);
    altLabel = 'Gehaltserhöhung';
  }
  const depotAlt = depotEndwert(nettoAltJahr, restLaufzeit, depotRendite, kest);
  const nettoAlt = depotAlt.endwert;

  /* --- Berechnungsblatt: Alternative --- */
  rbSec('Weg 2 — ' + altLabel);
  rbRow('Unternehmensaufwand', 'gleicher Betrag wie bei der Zusage', fE(aufwandJahr) + ' p.a.');
  if (vglArt === 'ausschuettung') {
    rbRow('Körperschaftsteuer', fP(KOEST, 0) + ' auf den Gewinn', '− ' + fE(aufwandJahr - altZwischen), 'neg');
    rbRow('Ausschüttung brutto', '', fE(altZwischen));
    rbRow('Kapitalertragsteuer', fP(kest, 1), '− ' + fE(altZwischen - nettoAltJahr), 'neg');
    rbNote('Gesamtbelastung ' + fP((1 - (1 - KOEST / 100) * (1 - kest / 100)) * 100, 3) + ' — Körperschaftsteuer und KESt wirken nacheinander.');
  } else {
    const satzLnk = aufwandJahr > 0 && altZwischen > 0 ? (aufwandJahr / altZwischen - 1) * 100 : 0;
    rbRow('Lohnnebenkosten', fP(satzLnk, 2) + ' auf den Bruttobezug', '− ' + fE(aufwandJahr - altZwischen), 'neg');
    rbNote('Dienstgeber-Sozialversicherung nur bis zur Höchstbeitragsgrundlage von ' + fE(HBGL) + ' im Monat; darüber bleiben Dienstgeberbeitrag, Zuschlag, Kommunalsteuer' + (wesentlich ? '' : ' und Mitarbeitervorsorgekasse') + '.');
    rbRow('Bruttobezug', fE(aufwandJahr) + ' ÷ ' + (1 + satzLnk / 100).toFixed(4), fE(altZwischen));
    rbRow('Sozialversicherung und Lohnsteuer', 'marginal auf ' + fE(einkommen) + ' bestehenden Monatsbezug', '− ' + fE(altZwischen - nettoAltJahr), 'neg');
  }
  rbRow('Beim Begünstigten netto', '', fE(nettoAltJahr) + ' p.a.', 'sum');

  rbSec('Weg 2 — Veranlagung im Privatdepot');
  rbRow('Einzahlung', fE(nettoAltJahr) + ' × ' + restLaufzeit + ' Jahre', fE(depotAlt.eingezahlt));
  rbRow('Endwert vor Steuer', fP(depotRendite) + ' p.a., monatlich verzinst', fE(depotAlt.brutto));
  rbRow('Kapitalertragsteuer auf den Gewinn', fP(kest, 1) + ' auf ' + fE(depotAlt.brutto - depotAlt.eingezahlt), '− ' + fE(depotAlt.kest), 'neg');
  rbRow('Netto in der Hand', '', fE(nettoAlt), 'sum');
  /* Der Gehaltspfad rechnet mit ASVG-Sozialversicherung. Für den wesentlich beteiligten
     Geschäftsführer gilt aber GSVG/SVS — andere Sätze, andere Bemessung, kein
     Arbeitnehmerabsetzbetrag. Statt still falsch zu rechnen, wird das offengelegt. */
  const gehaltFuerWesentlich = vglArt === 'gehalt' && wesentlich;
  show('note-vgl', gehaltFuerWesentlich);
  if (gehaltFuerWesentlich) $('note-vgl').innerHTML =
    `<b>Gehaltsvergleich für wesentlich Beteiligte nur näherungsweise</b>Die Alternative „Gehaltserhöhung“ rechnet mit der Arbeitnehmer-Sozialversicherung nach ASVG. Als wesentlich beteiligter Geschäftsführer bist du nach GSVG bei der SVS pflichtversichert — andere Beitragssätze, andere Bemessungsgrundlage, kein Arbeitnehmerabsetzbetrag. Für diese Rolle ist die Gewinnausschüttung die realistische und korrekt gerechnete Alternative.`;

  sv_('vergleich_hint', $('vergleich').value === 'auto'
    ? `Automatisch gewählt: ${altLabel}${wesentlich ? ' — bei wesentlicher Beteiligung die realistische Alternative.' : '.'}`
    : '');

  /* --- Pfad 3: Pensionskasse als Durchführungsweg --- */
  const pkRendite = Math.max(0, depotRendite - PZ_PK.verwaltung - PZ_PK.veranlagung);
  const pkKapital = depotEndwert(aufwandJahr, restLaufzeit, pkRendite, 0).brutto;
  const pkRenteBrutto = aeAbf > 0 ? pkKapital / aeAbf : 0;
  const pkR = steuerRente(pkRenteBrutto, sonstEink, PZ_RENTE_KV, BEZUEGE);
  const nettoPk = rentenBarwert(commAbf, pensionsalter, pkR.netto);

  /* --- Vorteil + Wasserfall --- */
  const vorteil = nettoZusage - nettoAlt;
  const vorteilPct = nettoAlt > 0 ? vorteil / nettoAlt * 100 : 0;

  const dAlt = depotEndwert(nettoAltJahr, restLaufzeit, depotRendite, kest).endwert;
  const dVoll = depotEndwert(aufwandJahr, restLaufzeit, depotRendite, kest).endwert;
  const dVollBrutto = depotEndwert(aufwandJahr, restLaufzeit, depotRendite, 0).brutto;
  const s1 = dVoll - dAlt;                 // Einzahlungshebel
  const s2 = dVollBrutto - dVoll;          // Thesaurierung ohne KESt
  const s3 = bruttoZusage - dVollBrutto;   // Leistungs-/Produktdifferenz
  const s4 = nettoZusage - bruttoZusage;   // Auszahlungsbesteuerung
  renderWasserfall([
    { lb: 'Einzahlungshebel — voller Aufwand statt Netto arbeitet', v: s1, c: LC.rst },
    { lb: 'Thesaurierung ohne KESt in der Ansparphase', v: s2, c: LC.deck },
    { lb: 'Zugesagte Leistung gegenüber gleicher Veranlagung', v: s3, c: LC.alt },
    { lb: 'Steuer bei Auszahlung', v: s4, c: 'rgb(248,113,113)' }
  ], vorteil);

  /* --- Hero --- */
  sv_('hero-val', (vorteil >= 0 ? '+' : '') + fE(vorteil));
  $('hero-val').className = 'pz-big' + (vorteil < 0 ? ' neg' : '');
  sv_('hero-label', `Pensionszusage gegenüber ${altLabel}, nach ${restLaufzeit} Jahren`);
  sv_('hero-pill-tx', (vorteil >= 0 ? '+' : '') + fP(vorteilPct) + ' gegenüber der Alternative');
  $('hero-pill').className = 'pz-pill' + (vorteil < 0 ? ' neg' : '');
  sv_('hero-sub', zusageDetail);

  /* --- Renditen --- */
  const rSys = irrAnnuitaet(aufwandJahr, restLaufzeit, nettoZusage);
  const rVgl = irrAnnuitaet(aufwandJahr, restLaufzeit, nettoAlt);
  sv_('m-rsys', rSys != null ? fP(rSys, 2) + ' p.a.' : '—');
  sv_('m-rvgl', rVgl != null ? fP(rVgl, 2) + ' p.a.' : '—');
  sv_('m-rdiff', (rSys != null && rVgl != null) ? ((rSys - rVgl >= 0 ? '+' : '') + (rSys - rVgl).toFixed(2).replace('.', ',') + ' PP') : '—');
  sv_('rend-badge', `bezogen auf ${fE(aufwandJahr)} Unternehmensaufwand p.a.`);
  sv_('wf-note', `Alle vier Stufen summieren sich exakt auf den ausgewiesenen Vorteil von ${fE(vorteil)}. Die dritte Stufe zeigt, wie sich die zugesagte Leistung gegenüber einer Veranlagung des gleichen Betrags zu ${fP(depotRendite)} verhält — hier wird sichtbar, ob die Zusage durch die Prämie überhaupt gedeckt ist.`);

  /* --- Vergleichsgitter --- */
  sv_('cmp-alt-head', altLabel);
  sv_('cmp-badge', `${fE(aufwandJahr)} Aufwand p.a. über ${restLaufzeit} Jahre`);
  const rows = [
    ['Unternehmensaufwand p.a.', fE(aufwandJahr), fE(aufwandJahr), fE(aufwandJahr), false],
    [vglArt === 'ausschuettung' ? 'nach Körperschaftsteuer' : 'nach Lohnnebenkosten', fE(aufwandJahr), fE(altZwischen), fE(aufwandJahr), false],
    ['beim Begünstigten p.a.', fE(aufwandJahr), fE(nettoAltJahr), fE(aufwandJahr), false],
    ['Wert bei Pensionsantritt (brutto)', fE(bruttoZusage), fE(depotAlt.brutto || 0), fE(pkKapital), false],
    ['Steuer bei Auszahlung', fE(steuerZusage), fE(depotAlt.kest || 0), fE(pkKapital - nettoPk), false],
    ['Netto in der Hand', fE(nettoZusage), fE(nettoAlt), fE(nettoPk), true]
  ];
  $('cmp-body').innerHTML = rows.map(r =>
    `<tr class="${r[4] ? 'sum' : ''}"><td>${r[0]}</td><td class="${r[4] ? 'hi' : ''}">${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`
  ).join('');

  /* --- § 14 Rückstellung + Bilanz --- */
  const tw = teilwertSerie(comm14, zusageAlter, pensionsalter, zusagePensionJahr, true);
  const produkt = hatProduktdaten();
  show('note-produkt', !produkt);
  if (!produkt) {
    $('note-produkt').innerHTML = `<b>Produktdaten ausständig</b>Es ist noch keine Modellrechnung einer Pensionsrückdeckungsversicherung hinterlegt. Rückstellung, Besteuerung und Vergleich rechnen vollständig — nicht bezifferbar sind der Aktivwert der Rückdeckung, der Deckungsgrad nach § 14 Abs. 5 und die Produktrendite. Sobald eine Antrags-PDF mit Veranlagungs- und Rückkaufswerten je Jahr vorliegt, füllen sich diese Spalten automatisch.`;
  }

  let bil = '', unterdeckung = false;
  for (let t = 1; t <= tw.tw.length - 1; t++) {
    const rst = tw.tw[t], dot = rst - tw.tw[t - 1];
    const rkw = produkt ? rdvLookup('rueckkaufswert', $('rdv_tarif').value, t, praemieM) : null;
    const d = deckungspruefung(tw.tw[t - 1], rkw || 0, 0);
    if (produkt && !d.gedeckt) unterdeckung = true;
    const aktivD = produkt ? (rkw - (rdvLookup('rueckkaufswert', $('rdv_tarif').value, t - 1, praemieM) || 0)) : null;
    const erg = -(dot + aufwandJahr) + (aktivD != null ? aktivD : 0);
    bil += `<tr><td>${zusageAlter + t}</td><td>${fE(aufwandJahr)}</td><td>${fE(rst)}</td><td>${fE(dot)}</td>` +
      `<td>${produkt ? fE(rkw) : '<span style="color:var(--tm)">—</span>'}</td>` +
      `<td>${fE(d.soll)}</td>` +
      `<td>${produkt ? (d.gedeckt ? '<span style="color:#4ade80">gedeckt</span>' : `<span style="color:var(--r)">−${fE(d.fehlbetrag)}</span>`) : '<span style="color:var(--tm)">—</span>'}</td>` +
      `<td>${produkt ? fE(erg) : '<span style="color:var(--tm)">—</span>'}</td>` +
      `<td>${produkt ? fE(-erg * KOEST / 100) : '<span style="color:var(--tm)">—</span>'}</td></tr>`;
  }
  $('bil-body').innerHTML = bil;

  show('note-deckung', unterdeckung);
  if (unterdeckung) $('note-deckung').innerHTML = `<b>Unterdeckung nach § 14 Abs. 5 EStG</b>In mindestens einem Jahr deckt der Rückkaufswert der Rückdeckungsversicherung nicht ${fP(PZ_DECKUNG, 0)} der Vorjahresrückstellung. Auf den Fehlbetrag droht ein Gewinnzuschlag von ${fP(PZ_STRAF, 0)}. Prämie erhöhen oder zusätzliche Wertpapierdeckung vorsehen.`;

  /* --- Kongruenz: deckt die Prämie die Zusage? --- */
  const zielKapital = zusagePensionJahr * aeAbf;
  const praemieSoll = kongruentePraemie(zielKapital, restLaufzeit, depotRendite);
  const abw = aufwandJahr > 0 ? (aufwandJahr - praemieSoll) / praemieSoll * 100 : 0;
  const inkongruent = Math.abs(abw) > 10;
  show('note-kongruenz', inkongruent);
  if (inkongruent) {
    const zuViel = abw > 0;
    $('note-kongruenz').innerHTML =
      `<b>Prämie und Zusage passen nicht zusammen</b>` +
      `Bei ${fP(depotRendite)} angenommener Verzinsung wären rund <b>${fE(praemieSoll / 12)} pro Monat</b> nötig, um die zugesagte Pension von ${fE(zusagePensionM)} zu finanzieren — eingetragen sind ${fE(praemieM)}. ` +
      (zuViel
        ? `Die Zusage ist damit überfinanziert: Das Unternehmen wendet mehr auf, als die Verpflichtung wert ist, weshalb die Systemrendite unter der Produktrendite liegt. `
        : `Die Zusage ist damit unterfinanziert: Die Prämie baut das nötige Kapital nicht auf, es droht eine Deckungslücke. `) +
      `<a href="#" onclick="setKongruentePraemie(${praemieSoll / 12});return false;" style="color:var(--ac)">Prämie auf ${fE(praemieSoll / 12)} setzen</a>`;
  }

  /* --- Angemessenheit --- */
  const quote = einkommen > 0 ? zusagePensionM / einkommen * 100 : 0;
  const zuHoch = quote > PZ_ANGEM_MAX;
  show('note-angem', zuHoch);
  if (zuHoch) $('note-angem').innerHTML = `<b>Angemessenheit prüfen</b>Die zugesagte Firmenpension entspricht ${fP(quote, 0)} des laufenden Bezuges. Der Richtwert liegt bei ${fP(PZ_ANGEM_MAX, 0)}. Zusammen mit der gesetzlichen Pension darf es zu keiner Überversorgung gegenüber der Aktivzeit kommen — sonst droht die Kürzung der Rückstellung.`;

  /* --- Fremdvergleich --- */
  show('note-fv', rolle.wesentlich);
  if (rolle.wesentlich) $('note-fv').innerHTML = `<b>Fremdvergleich beachten</b>Bei Gesellschaftern und Familienmitgliedern prüft die Finanzverwaltung, ob die Zusage einem fremden Dritten in gleicher Weise erteilt worden wäre. <a href="#" onclick="openModal('fv_overlay');return false;" style="color:var(--ac)">Was dabei geprüft wird</a>`;

  /* --- Klassik-Hinweis --- */
  sv_('klassik_hint', klassik < PZ_KLASSIK_MIN
    ? `Unter dem empfohlenen Mindestanteil von ${fP(PZ_KLASSIK_MIN, 0)} — das Deckungserfordernis sollte wertmäßig gesichert sein.`
    : `Garantierter Deckungsstock. Mindestens ${fP(PZ_KLASSIK_MIN, 0)} — das Deckungserfordernis muss wertmäßig gesichert sein.`);

  /* --- Berechnungsblatt: Rückstellung, Ergebnis, Grundlagen --- */
  rbSec('Rückstellung nach § 14 EStG — Teilwertverfahren');
  rbRow('Rechnungszins', 'gesetzlich vorgegeben', fP(PZ_ZINS, 0));
  rbRow('Leistungsbarwert bei Pensionsantritt', fE(zusagePensionJahr) + ' × ä bei ' + fP(PZ_ZINS, 0), fE(tw.leistungsBarwertEnde));
  rbRow('Gleichbleibender Jahresbetrag', 'Leistungsbarwert ÷ Anwartschafts-Rentenbarwert', fE(tw.jb) + ' p.a.');
  rbRow('Rückstellung bei Zusageerteilung', 'Alter ' + zusageAlter, fE(tw.tw[0]));
  rbRow('Rückstellung bei Pensionsantritt', 'Alter ' + pensionsalter, fE(tw.tw[tw.tw.length - 1]));
  rbRow('Deckungserfordernis', fP(PZ_DECKUNG, 0) + ' der Vorjahresrückstellung', fE(tw.tw[tw.tw.length - 2] * PZ_DECKUNG / 100) + ' im Endjahr');
  rbNote('Bei Unterdeckung droht ein Gewinnzuschlag von ' + fP(PZ_STRAF, 0) + ' auf den Fehlbetrag. ' +
    (produkt ? '' : 'Der Aktivwert der Rückdeckung ist mangels Produktdaten nicht bezifferbar, der Deckungsgrad daher nicht geprüft.'));

  rbSec('Ergebnis');
  rbRow('Netto aus der Pensionszusage', '', fE(nettoZusage));
  rbRow('Netto aus ' + altLabel, '', fE(nettoAlt));
  rbRow('Vorteil absolut', fE(nettoZusage) + ' − ' + fE(nettoAlt), (vorteil >= 0 ? '+' : '') + fE(vorteil), 'sum');
  rbRow('Vorteil prozentuell', 'bezogen auf die Alternative', (vorteilPct >= 0 ? '+' : '') + fP(vorteilPct));
  rbNote('Zerlegung des Vorteils:');
  rbRow('· Einzahlungshebel', 'voller Aufwand statt Netto arbeitet', (s1 >= 0 ? '+' : '') + fE(s1), s1 < 0 ? 'neg' : '');
  rbRow('· Thesaurierung ohne KESt', 'steuerfreies Wachstum in der Rückdeckung', (s2 >= 0 ? '+' : '') + fE(s2), s2 < 0 ? 'neg' : '');
  rbRow('· Leistung gegenüber gleicher Veranlagung', 'Kongruenz von Prämie und Zusage', (s3 >= 0 ? '+' : '') + fE(s3), s3 < 0 ? 'neg' : '');
  rbRow('· Steuer bei Auszahlung', '', (s4 >= 0 ? '+' : '') + fE(s4), s4 < 0 ? 'neg' : '');
  rbRow('Summe der Stufen', 'Kontrollrechnung', (s1 + s2 + s3 + s4 >= 0 ? '+' : '') + fE(s1 + s2 + s3 + s4), 'sum');
  rbRow('Systemrendite', 'interner Zinsfuß auf den Unternehmensaufwand', rSys != null ? fP(rSys, 2) + ' p.a.' : '—');
  rbRow('Vergleichsrendite', 'derselbe Aufwand über die Alternative', rVgl != null ? fP(rVgl, 2) + ' p.a.' : '—');
  rbRow('Steuervorsprung', '', (rSys != null && rVgl != null) ? ((rSys - rVgl >= 0 ? '+' : '') + (rSys - rVgl).toFixed(2).replace('.', ',') + ' Prozentpunkte') : '—', 'sum');

  rbSec('Verwendete Parameter');
  rbRow('Lohnsteuertarif', 'Stufen nach § 33 EStG', TAX_BRACKETS.map(b => (b.satz * 100).toFixed(0) + ' %').join(' · '));
  rbRow('Höchstbeitragsgrundlage ASVG', '', fE(HBGL) + ' / Monat');
  rbRow('Körperschaftsteuer', '', fP(KOEST, 0));
  rbRow('Kapitalertragsteuer', '', fP(kest, 1));
  rbRow('Lohnnebenkosten', 'DB · DZ · KommSt' + (wesentlich ? '' : ' · MVK'), fP(lnkFixSatz({ dz, wesentlich }), 2) + ' + DG-SV bis HBGL');
  rbRow('Rechnungszins § 14', '', fP(PZ_ZINS, 0));
  rbRow('Abfindungszins', '', fP(abfZins));
  rbRow('Rendite Privatdepot', '', fP(depotRendite) + ' p.a.');
  rbNote('Unverbindliche Modellrechnung. Die Rückstellung beruht auf der allgemeinen Sterbetafel der Statistik Austria, nicht auf der für das Aktuarsgutachten maßgeblichen AVÖ 2018-P, und weicht davon ab. Angemessenheit, Fremdvergleich und die Voraussetzungen des Hälftesteuersatzes sind im Einzelfall mit dem Steuerberater abzuklären.');
  renderBerechnungsblatt();

  renderChart(tw, zusageAlter, nettoAltJahr, aufwandJahr, restLaufzeit, depotRendite, kest, alter);
  if (typeof window.__axionSendResult === 'function') {
    window.__axionSendResult({ rechner: 'pensionszusage', vorteil, vorteilPct, nettoZusage, nettoAlt, systemrendite: rSys });
  }
  setTimeout(sendHeight, 60);
}

/* ══════════ BERECHNUNGSBLATT ══════════
   Protokolliert jeden Rechenschritt mit Formel und Zwischenergebnis, damit die Zahlen
   gegenüber Kunde und Steuerberater nachvollziehbar sind. Wird bei jedem calculate()
   neu aufgebaut. */
let RB = [];
const rbSec = t => RB.push({ t: 'sec', a: t });
const rbRow = (label, formel, wert, cls) => RB.push({ t: 'row', a: label, b: formel || '', c: wert, cls: cls || '' });
const rbNote = t => RB.push({ t: 'note', a: t });
const rbCheck = (ok, t) => RB.push({ t: 'row', a: t, b: '', c: ok ? 'erfüllt' : 'nicht erfüllt', cls: ok ? 'ok' : 'no' });

function renderBerechnungsblatt() {
  const el = $('rb'); if (!el) return;
  el.innerHTML = RB.map(r => {
    if (r.t === 'sec') return `<div class="rb-sec">${r.a}</div>`;
    if (r.t === 'note') return `<div class="rb-note">${r.a}</div>`;
    const vcls = r.cls === 'ok' ? 'rb-ok' : r.cls === 'no' ? 'rb-no' : '';
    const rcls = r.cls === 'sum' ? ' sum' : r.cls === 'neg' ? ' neg' : '';
    return `<div class="rb-row${rcls}"><div class="rb-lb">${r.a}</div>` +
      `<div class="rb-fx">${r.b}</div><div class="rb-vl ${vcls}">${r.c}</div></div>`;
  }).join('');
}

function berechnungsblattAlsText() {
  const pad = (s, n) => String(s).padEnd(n);
  return RB.map(r => {
    if (r.t === 'sec') return `\n=== ${r.a.toUpperCase()} ===`;
    if (r.t === 'note') return `  ${r.a}`;
    return `  ${pad(r.a, 52)} ${pad(r.b, 30)} ${r.c}`;
  }).join('\n').replace(/ /g, ' ');
}

function druckeBerechnungsblatt() {
  $('rb-wrap').classList.remove('collapsed');
  $('rb-head').classList.add('open');
  setTimeout(() => window.print(), 120);
}

function kopiereBerechnungsblatt(btn) {
  const txt = berechnungsblattAlsText();
  const fertig = () => { const alt = btn.textContent; btn.textContent = 'Kopiert'; setTimeout(() => { btn.textContent = alt; }, 1600); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(fertig).catch(() => {});
  else {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); fertig(); } catch (e) { /* ignoriert */ }
    document.body.removeChild(ta);
  }
}

/* ── Wasserfall ── */
function renderWasserfall(stufen, total) {
  const el = $('wf'); if (!el) return;
  const max = Math.max(...stufen.map(s => Math.abs(s.v)), Math.abs(total), 1);
  el.innerHTML = stufen.map(s =>
    `<div class="wf-row"><div class="wf-lb">${s.lb}</div>` +
    `<div class="wf-tr"><div class="wf-fl" style="width:${Math.abs(s.v) / max * 100}%;background:${s.c}"></div></div>` +
    `<div class="wf-vl" style="color:${s.v < 0 ? 'var(--r)' : ''}">${s.v >= 0 ? '+' : ''}${fE(s.v)}</div></div>`
  ).join('') +
    `<div class="wf-row total"><div class="wf-lb">Gesamtvorteil</div><div class="wf-tr"></div><div class="wf-vl">${total >= 0 ? '+' : ''}${fE(total)}</div></div>`;
}

/* ── Chart ── */
function renderChart(tw, zusageAlter, nettoAltJahr, aufwandJahr, restLaufzeit, rendite, kest, alter) {
  const cv = $('lineChart'); if (!cv || typeof Chart === 'undefined') return;
  const labels = [], rst = [], deck = [], alt = [], ein = [];
  for (let t = 0; t < tw.tw.length; t++) {
    const a = zusageAlter + t;
    labels.push(a);
    rst.push(tw.tw[t]);
    deck.push(t > 0 ? tw.tw[t - 1] * PZ_DECKUNG / 100 : 0);
    const jahreSeitHeute = Math.max(0, a - alter);
    alt.push(depotEndwert(nettoAltJahr, jahreSeitHeute, rendite, kest).endwert);
    ein.push(aufwandJahr * t);
  }
  const t = tc();
  const ds = [
    { label: LL.rst, data: rst, borderColor: LC.rst, backgroundColor: LC.rst, hidden: !chartVis.rst },
    { label: LL.deck, data: deck, borderColor: LC.deck, backgroundColor: LC.deck, borderDash: [5, 4], hidden: !chartVis.deck },
    { label: LL.alt, data: alt, borderColor: LC.alt, backgroundColor: LC.alt, hidden: !chartVis.alt },
    { label: LL.ein, data: ein, borderColor: LC.ein, backgroundColor: LC.ein, borderDash: [3, 3], hidden: !chartVis.ein }
  ].map(d => ({ ...d, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .25, fill: false }));

  if (lineChartInst) lineChartInst.destroy();
  lineChartInst = new Chart(cv.getContext('2d'), {
    type: 'line', data: { labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false, external: externalTooltip,
          callbacks: { title: i => 'Alter ' + i[0].label, label: c => c.dataset.label + ': ' + fE(c.parsed.y) }
        }
      },
      scales: {
        x: { grid: { color: t.grid }, ticks: { color: t.ticks, maxTicksLimit: 10 } },
        y: { grid: { color: t.grid }, ticks: { color: t.ticks, callback: v => eurShort(v) } }
      }
    },
    plugins: [crosshairPlugin]
  });
}

/* ══════════ INIT ══════════ */
document.addEventListener('DOMContentLoaded', async () => {
  if (window.__PZ_BLOCKED) return;
  await loadConfig();
  applyPzConfig();

  const d = CONFIG?.rechner_defaults?.pensionszusage || {};
  if (d.pensionsantritt) $('pension').value = d.pensionsantritt;
  if (d.praemie_monatlich_eur) $('praemie').value = d.praemie_monatlich_eur;
  if (d.klassik_anteil_pct) $('klassik').value = d.klassik_anteil_pct;
  if (d.dz_pct != null) $('dz').value = d.dz_pct;
  if (d.depot_rendite_pct != null) $('depot_rendite').value = d.depot_rendite_pct;
  if (d.kest_privat_pct != null) $('kest').value = d.kest_privat_pct;
  $('klassik').min = PZ_KLASSIK_MIN;
  $('abf_zins').value = PZ_ZINS;
  $('zusagedat').value = new Date().toISOString().split('T')[0];

  buildRollenSelect();
  if (d.rolle) { $('rolle').value = d.rolle; buildRollenSelect(); }
  buildLegend();
  onZusageArtChange();
  setStartZusage();

  sv_('disclaimer', 'Unverbindliche Modellrechnung, kein Ersatz für Steuer- oder Rechtsberatung. ' +
    'Die Rückstellung wird nach dem Teilwertverfahren gemäß § 14 EStG mit ' + fP(PZ_ZINS, 0) + ' Rechnungszins ermittelt, ' +
    'jedoch auf Basis der allgemeinen Sterbetafel der Statistik Austria — nicht auf Basis der für das Aktuarsgutachten maßgeblichen AVÖ 2018-P. ' +
    'Die ausgewiesene Rückstellung weicht daher vom Gutachten ab. Angemessenheit, Fremdvergleich und die Voraussetzungen des Hälftesteuersatzes ' +
    'sind im Einzelfall mit dem Steuerberater abzuklären.');

  calculate();
  setTimeout(sendHeight, 200);
});
