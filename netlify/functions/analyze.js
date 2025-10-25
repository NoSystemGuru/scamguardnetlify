// netlify/functions/analyze.js
// CommonJS + CORS + appel Claude + normalisation anti-NaN

const fetch = require("node-fetch");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Content-Type": "application/json"
};

// ---------- Helpers de normalisation ----------
function toPct(v, d = 0) {
  const n = typeof v === "string" ? v.replace(/[^\d.]/g, "") : v;
  const x = Number(n);
  if (!Number.isFinite(x)) return d;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function normCriteria(c = {}) {
  return {
    seller_rating:      toPct(c.seller_rating      ?? c.vendor_rating        ?? c.rating),
    account_age_months: toPct(c.account_age_months ?? c.account_age          ?? c.seller_age),
    positive_reviews:   toPct(c.positive_reviews   ?? c.reviews_positive     ?? c.positive_feedback),
    writing_quality:    toPct(c.writing_quality    ?? c.description_quality  ?? c.text_quality),
    photo_authenticity: toPct(c.photo_authenticity ?? c.photos_authenticity  ?? c.photos_quality),
    price_fairness:     toPct(c.price_fairness     ?? c.market_price_fairness?? c.price_coherence),
    payment_safety:     toPct(c.payment_safety     ?? c.payment_security),
    items_count:        toPct(c.items_count        ?? c.seller_items         ?? c.number_of_listings),
    location_precision: toPct(c.location_precision ?? c.location_detail      ?? c.location_quality)
  };
}

function normalizeAI(ai) {
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

// ---------- Handler Netlify ----------
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "OK" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const ad = body.data;

    if (!ad || !ad.title) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success:false, error:"Aucune donnée reçue" }) };
    }
    if (!process.env.CLAUDE_API_KEY) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success:false, error:"CLAUDE_API_KEY manquante" }) };
    }

    // ---------- PROMPT : tes règles ----------
    const prompt = `
Tu es un détecteur d'arnaques spécialisé Leboncoin.
Analyse l'annonce ci-dessous et renvoie UNIQUEMENT un JSON respectant ce SCHÉMA :

{
  "overall_score": 0-100,
  "risk_level": "low" | "medium" | "high",
  "decision": "GO" | "PRUDENCE" | "NO_GO",
  "criteria": {
    "seller_rating": 0-100,
    "account_age_months": 0-100,
    "positive_reviews": 0-100,
    "writing_quality": 0-100,
    "photo_authenticity": 0-100,
    "price_fairness": 0-100,
    "payment_safety": 0-100,
    "items_count": 0-100,
    "location_precision": 0-100
  },
  "explanations": { "<critère>": "phrase courte" },
  "red_flags": [string],
  "green_flags": [string],
  "recommendation": string
}

Données:
${JSON.stringify({
  title: ad.title,
  price: ad.price,
  location: ad.location,
  description: (ad.description || "").slice(0, 4000),
  url: ad.url,
  seller: {
    rating: ad.seller?.rating ?? null,
    sinceText: ad.seller?.sinceText ?? null,
    itemsCount: ad.seller?.itemsCount ?? null
  },
  images: (ad.images || []).slice(0, 10)
}, null, 2)}

RÈGLES (0–100 %) :

1) Ancienneté du compte (account_age_months)
- 100 si > 24 mois ; 80 si 12–24 ; 60 si 6–12 ; 30 si < 6 ; 0 si inconnu.

2) Note vendeur (seller_rating)
- 100 si ≥ 4.5/5 ; 80 si 3.5–4.4 ; 50 si 2.5–3.4 ; 20 si < 2.5 ou aucune note.

3) Avis positifs (positive_reviews)
- 100 si > 15 ; 70 si 5–15 ; 40 si < 5 ; 10 si aucun.

4) Qualité rédaction (writing_quality)
- 100 détaillé/structuré ; 60 court mais cohérent ; 30 très bref ; 0 incohérent/suspect.

5) Authenticité photos (photo_authenticity)
- 100 originales crédibles ; 50 moyen/doute ; 0 stock/volées.

6) Prix vs marché (price_fairness)
- 100 si ±10% ; 50 si ±30% ; 10 si très sous-évalué.

7) Sécurité paiement (payment_safety)
- 90 si "Paiement sécurisé Leboncoin"
- 90 si remise en main propre
- 90 si virement bancaire
- 20 si Wero/crypto/WesternUnion/mandat/cash
- 10 si chèque

8) Nb annonces vendeur (items_count)
- 100 si 1–10 ; 80 si 10–50 ; 30 si 3–5 (prudence) ; 10 si >3 (suspect) ; 0 si 0.
(En cas de conflit, applique la règle la plus défavorable.)

9) Localisation (location_precision)
- 100 ville+quartier/code postal ; 60 région vague ; 20 non précisée.

EXIGENCES :
- NOMBRES purs (pas "80%").
- Respect strict des clés du schéma.
- overall_score cohérent avec les critères.
- risk_level + decision en conséquence.
`.trim();

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1100,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const ai = await res.json();
    const data = normalizeAI(ai);

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, data }) };

  } catch (err) {
    console.error("❌ analyze error:", err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
