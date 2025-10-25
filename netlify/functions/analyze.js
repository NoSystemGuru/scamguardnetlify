// netlify/functions/analyze.js
// OpenAI Structured Outputs (JSON Schema strict) + CORS — 100% IA, sans fallback

const fetch = require("node-fetch");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Content-Type": "application/json"
};

// -------- Schéma JSON strict attendu par l'UI --------
const schema = {
  name: "ScamGuardSchema",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      overall_score: { type: "number", minimum: 0, maximum: 100 },
      risk_level:    { type: "string", enum: ["low", "medium", "high"] },
      decision:      { type: "string", enum: ["GO", "PRUDENCE", "NO_GO"] },
      criteria: {
        type: "object",
        additionalProperties: false,
        properties: {
          seller_rating:      { type: "number", minimum: 0, maximum: 100 },
          account_age_months: { type: "number", minimum: 0, maximum: 100 },
          positive_reviews:   { type: "number", minimum: 0, maximum: 100 },
          writing_quality:    { type: "number", minimum: 0, maximum: 100 },
          photo_authenticity: { type: "number", minimum: 0, maximum: 100 },
          price_fairness:     { type: "number", minimum: 0, maximum: 100 },
          payment_safety:     { type: "number", minimum: 0, maximum: 100 },
          items_count:        { type: "number", minimum: 0, maximum: 100 },
          location_precision: { type: "number", minimum: 0, maximum: 100 }
        },
        required: [
          "seller_rating","account_age_months","positive_reviews","writing_quality",
          "photo_authenticity","price_fairness","payment_safety","items_count","location_precision"
        ]
      },
      explanations: { type: "object", additionalProperties: { type: "string" } },
      red_flags:    { type: "array", items: { type: "string" } },
      green_flags:  { type: "array", items: { type: "string" } },
      recommendation: { type: "string" }
    },
    required: [
      "overall_score","risk_level","decision","criteria",
      "explanations","red_flags","green_flags","recommendation"
    ]
  },
  strict: true
};

// -------- Prompt avec tes règles EXACTES --------
function buildPrompt(ad) {
  return `
Tu es un auditeur d'annonces Leboncoin.
Analyse l'annonce et produis STRICTEMENT un objet conforme au JSON Schema fourni par le serveur.
Ne renvoie AUCUN texte hors JSON (le serveur impose un schema strict).

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

RÈGLES (notes 0–100 à appliquer à la lettre) :

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
- 100 si 1–10 ; 80 si 10–50 ; 30 si 3–5 ; 10 si >3 ; 0 si 0.
(En cas de conflit de règles, prends la plus défavorable.)

9) Localisation (location_precision)
- 100 ville+quartier/code postal ; 60 région vague ; 20 non précisée.

Calcule "overall_score" en cohérence avec ces critères.
Choisis "risk_level" (low/medium/high) et "decision" (GO/PRUDENCE/NO_GO) en conséquence.
  `.trim();
}

// -------- Extraction “structured outputs” OpenAI --------
function extractOpenAIJSON(respJson) {
  // Responses API : chercher un item content contenant du JSON
  // Cas 1: content[0].type === "output_text" -> text JSON
  // Cas 2: content[0].type === "json_schema" -> content[0].json
  const out = respJson?.output || respJson?.response || [];
  const first = Array.isArray(out) ? out[0] : null;
  const content = first?.content || [];

  for (const c of content) {
    if (c.type === "json") return c.json;
    if (c.type === "output_text" && typeof c.text === "string") {
      try { return JSON.parse(c.text); } catch {}
    }
    if (c.type === "json_schema" && c.json) return c.json;
    if (typeof c.text === "string") {
      try { return JSON.parse(c.text); } catch {}
    }
  }
  // fallback conservateur : essaie au plus haut niveau
  if (typeof respJson === "object") {
    const txt = respJson?.output_text || respJson?.content || null;
    if (typeof txt === "string") { try { return JSON.parse(txt); } catch {} }
  }
  throw new Error("Réponse OpenAI non parsable (JSON absent).");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "OK" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const ad = body.data;
    if (!ad || !ad.title) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success:false, error:"Aucune donnée reçue" }) };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ success:false, error:"OPENAI_API_KEY manquante" }) };
    }

    const prompt = buildPrompt(ad);

    // 👉 Responses API + Structured Outputs (JSON Schema strict)
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-2024-07-18", // bon rapport qualité/prix
        temperature: 0.2,
        max_output_tokens: 900,
        response_format: {
          type: "json_schema",
          json_schema: schema,
          strict: true
        },
        input: prompt
      })
    });

    const j = await res.json();
    if (!res.ok) {
      // remonte l’erreur OpenAI pour debug
      return { statusCode: 502, headers: cors, body: JSON.stringify({ success:false, error: j?.error?.message || "Erreur OpenAI" }) };
    }

    const data = extractOpenAIJSON(j);

    // Re-sécurité légère: clamp des plages 0..100
    const clamp = (x) => Math.max(0, Math.min(100, Math.round(Number(x)||0)));
    if (data && data.criteria) {
      for (const k of Object.keys(data.criteria)) data.criteria[k] = clamp(data.criteria[k]);
    }
    data.overall_score = clamp(data.overall_score);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ success:true, data }) };
  } catch (err) {
    console.error("❌ analyze (OpenAI) error:", err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success:false, error: err.message }) };
  }
};
