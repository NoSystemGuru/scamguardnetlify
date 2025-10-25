// netlify/functions/analyze.js
// ✅ version CommonJS compatible Netlify Functions (Node 18)

const fetch = require("node-fetch"); // require au lieu de import

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const adData = body.data;

    if (!adData || !adData.title) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, error: "Aucune donnée reçue" })
      };
    }

    // 🧪 Simulation de réponse IA (pour test local / extension)
    // → remplace plus tard par ton appel Claude
    const fake = {
      overall_score: 82,
      risk_level: "medium",
      criteria: {
        seller_rating: 80,
        account_age_months: 70,
        positive_reviews: 90,
        writing_quality: 85,
        photo_authenticity: 75,
        price_fairness: 60,
        payment_safety: 70,
        items_count: 65,
        location_precision: 80
      },
      explanations: {
        writing_quality: "Texte naturel sans répétition suspecte",
        price_fairness: "Prix légèrement sous la moyenne du marché"
      },
      recommendation: "Vérifiez la remise en main propre avant d’acheter.",
      decision: "PRUDENCE"
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS, POST",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ success: true, data: fake })
    };

  } catch (err) {
    console.error("Erreur analyze:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: false, error: "Erreur interne serveur" })
    };
  }
};
