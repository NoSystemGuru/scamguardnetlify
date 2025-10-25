import fetch from "node-fetch";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
};

const simpleScore = (a) => {
  let score = 50;
  if (a.price) score += 5;
  if ((a.description || "").length > 120) score += 10;
  if ((a.description || "").toLowerCase().includes("western union")) score -= 30;
  if ((a.description || "").toLowerCase().includes("crypto")) score -= 20;
  if (a.location && !/non précisée/i.test(a.location)) score += 5;
  if (a.image) score += 5;
  return Math.max(5, Math.min(95, score));
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "OK" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const annonce = body.data || {};

    if (!annonce || !annonce.title) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Aucune donnée reçue" }) };
    }

    const apiKey = process.env.CLAUDE_API_KEY;

    // Si pas de clé Claude -> scoring simple
    if (!apiKey) {
      const score = simpleScore(annonce);
      const risk_level = score >= 75 ? "low" : score >= 50 ? "medium" : "high";
      const data = {
        title: annonce.title,
        overall_score: score,
        risk_level,
        red_flags: score < 60 ? ["Description courte ou imprécise", "Demander une remise en main propre"] : [],
        green_flags: score >= 60 ? ["Prix/description cohérents", "Localisation présente"] : [],
        recommendation:
          risk_level === "low"
            ? "Annonce plutôt fiable. Restez vigilant et privilégiez une remise en main propre."
            : risk_level === "medium"
            ? "Risque modéré. Demandez plus d’infos et vérifiez le produit en personne."
            : "Risque élevé. Évitez les paiements à distance et signalez l’annonce si nécessaire.",
        image_url: annonce.image || "",
        price: annonce.price || "",
        location: annonce.location || "",
      };
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    // Appel Claude (si clé dispo)
    const prompt = `
Analyse l'annonce ci-dessous et renvoie STRICTEMENT un JSON:
{
  "title": "...",
  "overall_score": number 0-100,
  "risk_level": "low"|"medium"|"high",
  "red_flags": [string],
  "green_flags": [string],
  "recommendation": "..."
}
Annonce:
Titre: ${annonce.title}
Prix: ${annonce.price}
Description: ${annonce.description}
Localisation: ${annonce.location}
    `.trim();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const ai = await response.json();
    const text = ai?.content?.[0]?.text || "{}";
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = {}; }

    // Si Claude ne renvoie pas de score -> fallback
    if (typeof parsed.overall_score !== "number") {
      parsed.overall_score = simpleScore(annonce);
      parsed.risk_level = parsed.overall_score >= 75 ? "low" : parsed.overall_score >= 50 ? "medium" : "high";
    }
    parsed.title ||= annonce.title;
    parsed.price ||= annonce.price;
    parsed.location ||= annonce.location;
    parsed.image_url ||= annonce.image;

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: parsed }) };
  } catch (err) {
    console.error("❌ analyze error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
