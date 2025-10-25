// netlify/functions/analyze.js
// CommonJS + CORS + appel Claude + normalisation anti-NaN
const fetch = require("node-fetch");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Content-Type": "application/json"
};

// --- utilitaires de normalisation ---
function toPct(v, d = 0) {
  // "80%", "~60", "80 points" -> 80
  const n = typeof v === "string" ? v.replace(/[^\d.]/g, "") : v;
  const x = Number(n);
  if (!Number.isFinite(x)) return d;
  return Math.max(0, Math.min(100, Math.round(x)));
}
function normCriteria(c = {}) {
  // accepte variantes et force les 9 clés requises par la popup
  return {
    seller_rating:      toPct(c.seller_rating      ?? c.vendor_rating        ?? c.rating),
    account_age_months: toPct(c.account_age_months ?? c.account_age          ?? c.seller_age),
    positive_reviews:   toPct(c.positive_reviews   ?? c.reviews_positive     ?? c.positive_feedback),
    writing_quality:    toPct(c.writing_quality    ?? c.description_quality  ?? c.text_quality),
    photo_authenticity: toPct(c.photo_authenticity ?? c.photos_authenticity  ?? c.photos_quality),
    price_fairness:     toPct(c.price_fairness     ?? c.market_price_fairness?? c.price_coherence),
    payment_safety:     toPct(c.payment_safety     ?? c.payment_security),
    items_count:        toPct(c.items_count        ?? c.seller_items         ?? c.number_of_listings),
    location_precision: toPct(c.location_precision ?? c.location_detail      ?? c.location_quality),
  };
}
function normalizeAI(ai) {
  // tente d'isoler un JSON propre même si Claude renvoie des fences ```json
  let text = ai?.content?.[0]?.text || "";
  const fence = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/);
  if (fence) text = fence[1];
  let raw = {};
  try { raw = JSON.parse(text); } catch { raw = {}; }

  const criteria = normCriteria(raw.criteria || {});
  const risk = (raw.risk_level || "medium").toLowerCase();
  const decisionRaw = (raw.decision || "").toUpperCase();
  const decision = ["GO", "PRUDENCE", "NO_GO"].includes(decisionRaw)
    ? decisionRaw
    : (risk === "low" ? "GO" : risk === "medium" ? "PRUDENCE" : "NO_GO");

  // si l'IA oublie overall_score, on calcule une moyenne pondérée simple
  const overall = toPct(
    raw.overall_score,
    Math.round(
      0.18*criteria.seller_rating +
      0.12*criteria.account_age_months +
      0.10*criteria.positive_reviews +
      0.12*criteria.writing_quality +
      0.11*criteria.photo_authenticity +
      0.12*criteria.price_fairness +
      0.12*criteria.payment_safety +
      0.06*criteria.items_count +
      0.07*criteria.location_precision
    )
  );

  return {
    overall_score: overall,
    risk_level: ["low","medium","high"].includes(risk) ? risk : "medium",
    decision,
    criteria,
    explanations: typeof raw.explanations === "object" ? raw.explanations : {},
    red_flags: Array.isArray(raw.red_flags) ? raw.red_flags.map(String) : [],
    green_flags: Array.isArray(raw.green_flags) ? raw.green_flags.map(String) : [],
    recommendation: raw.recommendation || "Analyse complétée."
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "OK" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const ad = body.data;

    i
