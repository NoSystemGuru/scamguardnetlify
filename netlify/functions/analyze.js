// netlify/functions/analyze.js
const fetch = require("node-fetch");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "OK" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const ad = body.data;
    const apiKey = process.env.CLAUDE_API_KEY;

    if (!ad || !ad.title) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: "Aucune donnée reçue" })
      };
    }

    // 🧠 Prompt IA personnalisé avec directives pour CHAQUE critère
    const prompt = `
Tu es un détecteur d'arnaques spécialisé dans les annonces Leboncoin.
Analyse l'annonce suivante selon les critères ci-dessous.
Rends ton résultat au format JSON pur, sans texte avant ni après.

Annonce :
Titre : ${ad.title}
Prix : ${ad.price}
Localisation : ${ad.location}
Description : ${ad.description || "Non fournie"}
Note vendeur : ${ad.seller?.rating || "Inconnue"}
Ancienneté du compte : ${ad.seller?.sinceText || "Non précisée"}
Nombre d'annonces : ${ad.seller?.itemsCount || "Inconnu"}

🎯 Critères à évaluer (entre 0 et 100 %) :
1️⃣ Ancienneté du compte vendeur :
  - 100 % si le compte a >2 ans
  - 80 % si entre 1 an et 2 ans
  - 60 % si entre 6 mois et 1 an
  - 30 % si <6 mois
  - 0 % si inconnu ou compte tout récent

2️⃣ Note vendeur :
  - 100 % si ≥4,5/5
  - 80 % si entre 3,5 et 4,4
  - 50 % si entre 2,5 et 3,4
  - 20 % si <2,5 ou aucune note

3️⃣ Avis positifs :
  - 100 % si >15 évaluations positives
  - 70 % si 5 à 15
  - 40 % si <5
  - 10 % si aucune

4️⃣ Qualité de rédaction :
  - 100 % si texte structuré, clair, sans fautes, sans exagération
  - 60 % si texte court mais cohérent
  - 30 % si texte peu informatif
  - 0 % si incohérent ou copié-collé

5️⃣ Authenticité des photos :
  - 100 % si photos originales cohérentes
  - 50 % si qualité moyenne ou doute
  - 0 % si photos de stock ou fausses

6️⃣ Prix vs marché :
  - 100 % si cohérent ±10 % du prix moyen
  - 50 % si ±30 %
  - 10 % si très inférieur (trop beau pour être vrai)

7️⃣ Sécurité du paiement :
  - 90 % si mention "Paiement sécurisé Leboncoin"
  - 90 % si remise en main propre
  - 90 % si mention virement
  - 20 % si mention wero, crypto, western union, mandat, cash
  - 10 % si mention chèque

8️⃣ Nombre d’annonces :
  - 100 % si 1–10
  - 80 % si 10–50
  - 30 % si 3-5 (prudence avec le revendeur)
  - 10 % si >3 (revendeur suspect)
  - 0 % si =0 (revendeur très suspect. Extrême prudence)

9️⃣ Localisation :
  - 100 % si précise (ville + quartier)
  - 60 % si vague (seulement région)
  - 20 % si "non précisée"

Fais ensuite un score global (moyenne pondérée) et détermine :
  - "risk_level": "low" | "medium" | "high"
  - "recommendation": message clair avec conseils
  - "decision": "GO" | "PRUDENCE" | "NO GO"

Renvoie uniquement du JSON comme ceci :
{
  "overall_score": 78,
  "risk_level": "medium",
  "criteria": { "seller_rating": 80, "account_age": 90, "photo_authenticity": 70, ... },
  "recommendation": "Le vendeur semble fiable mais vérifiez la remise en main propre.",
  "decision": "PRUDENCE"
}
`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    const rawText = data.content?.[0]?.text?.trim() || "{}";
    const result = JSON.parse(rawText);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: result })
    };

  } catch (err) {
    console.error("❌ Erreur analyze:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
