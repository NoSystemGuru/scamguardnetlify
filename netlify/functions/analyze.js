// netlify/functions/analyze.js
// Appel 1x Claude pour produire TOUTES les jauges + explications
// Nécessite: env CLAUDE_API_KEY
import fetch from "node-fetch";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
};

const MODEL = "claude-3-5-sonnet-20240620"; // ou "claude-3-haiku-20240307" si budget serré

// Extraction JSON sûre depuis une réponse texte
function safeParseJSON(text) {
  try { return JSON.parse(text); } catch {}
  // tente de récupérer un bloc ```json ... ```
  const m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  // tente de découper du premier { au dernier }
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  return null;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "OK" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const a = body.data || {};
    if (!a || !a.title) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Aucune donnée reçue" }) };
    }
    if (!process.env.CLAUDE_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "CLAUDE_API_KEY manquante" }) };
    }

    // Contexte compact et structuré envoyé à l’IA
    const payload = {
      title: a.title || "",
      price: a.price || "",
      location: a.location || "",
      description: (a.description || "").slice(0, 4000), // limite sécurité
      url: a.url || "",
      seller: {
        rating: a.seller?.rating ?? null,
        sinceMonths: a.seller?.sinceMonths ?? null,
        positive: a.seller?.positive ?? null,
        totalReviews: a.seller?.totalReviews ?? null,
        itemsCount: a.seller?.itemsCount ?? null,
      },
      images: (a.images || []).slice(0, 10).map(x => ({ src: x.src, w: x.w || null, h: x.h || null }))
    };

    const schema = {
      type: "object",
      required: ["overall_score", "risk_level", "criteria", "red_flags", "green_flags", "recommendation", "decision"],
      properties: {
        overall_score: { type: "number", minimum: 0, maximum: 100 },
        risk_level: { type: "string", enum: ["low", "medium", "high"] },
        decision: { type: "string", enum: ["GO", "PRUDENCE", "NO_GO"] },
        criteria: {
          type: "object",
          required: [
            "seller_rating","account_age_months","positive_reviews",
            "writing_quality","photo_authenticity","price_fairness",
            "payment_safety","items_count","location_precision"
          ],
          properties: {
            seller_rating:      { type: "number", minimum:0, maximum:100, description:"Note vendeur" },
            account_age_months: { type: "number", minimum:0, maximum:100, description:"Ancienneté" },
            positive_reviews:   { type: "number", minimum:0, maximum:100 },
            writing_quality:    { type: "number", minimum:0, maximum:100 },
            photo_authenticity: { type: "number", minimum:0, maximum:100 },
            price_fairness:     { type: "number", minimum:0, maximum:100 },
            payment_safety:     { type: "number", minimum:0, maximum:100 },
            items_count:        { type: "number", minimum:0, maximum:100 },
            location_precision: { type: "number", minimum:0, maximum:100 }
          }
        },
        explanations: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        red_flags:   { type: "array", items: { type: "string" } },
        green_flags: { type: "array", items: { type: "string" } },
        recommendation: { type: "string" }
      }
    };

    const prompt = `
Tu es un auditeur d'annonces Leboncoin. À partir UNIQUEMENT des données fournies, produis un JSON STRICT qui suit ce schéma :

${JSON.stringify(schema, null, 2)}

Règles :
- Les 9 critères de "criteria" sont des POURCENTAGES (0–100). Ne mets pas de texte, seulement des nombres.
- "overall_score" est un pourcentage 0–100 calculé de façon cohérente à partir des critères (pondérations libres mais raisonnables).
- "risk_level": "low" | "medium" | "high".
- "decision": "GO" | "PRUDENCE" | "NO_GO".
- "explanations" contient 1–2 phrases courtes par critère (clef = nom du critère).
- "red_flags" et "green_flags" sont des puces courtes, factuelles, justifiées par les données.
- Si une info est absente, ne l'invente pas : baisse le score de confiance correspondant et explique-le.
- NE RENVOIE QUE LE JSON, sans préface ni commentaire.

Données:
${JSON.stringify(payload, null, 2)}
`.trim();

    // --------- Appel Claude ----------
    const claude = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        temperature: 0.2,
        messages: [{ role]()
