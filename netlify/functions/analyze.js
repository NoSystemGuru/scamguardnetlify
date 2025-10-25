// netlify/functions/analyze.js
import fetch from "node-fetch"; // ⚠️ obligatoire si ton code appelle l’API Claude

export const handler = async (event) => {
  // Autoriser CORS pour ton extension Chrome
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS, POST",
  };

  // Répondre à la requête OPTIONS (pré-vol CORS)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "OK" };
  }

  try {
    const { data } = JSON.parse(event.body || "{}");

    if (!data) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: "Aucune donnée reçue" }),
      };
    }

    if (!process.env.CLAUDE_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: "CLAUDE_API_KEY manquante dans les variables d’environnement",
        }),
      };
    }

    // Exemple d'appel à Claude (remplace selon ton usage)
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `Analyse cette annonce:\n\nTitre: ${data.title}\nPrix: ${data.price}\nDescription: ${data.description}`,
          },
        ],
      }),
    });

    const aiResult = await response.json();

    // Exemple de structuration de la réponse
    const result = {
      success: true,
      data: {
        overall_score: 85,
        risk_level: "low",
        recommendation: "L’annonce semble fiable, mais restez vigilant.",
        red_flags: ["Aucun signal suspect détecté"],
        green_flags: ["Description cohérente", "Prix réaliste"],
        ai_raw: aiResult,
      },
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("Erreur Netlify:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
