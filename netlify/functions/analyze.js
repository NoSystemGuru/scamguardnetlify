// ✅ Fichier complet : netlify/functions/analyze.js
// Compatible Node.js (CommonJS) et Extension Chrome
// Inclut la gestion CORS complète + réponse JSON simulée IA

const fetch = require("node-fetch");

// Headers CORS — obligatoires pour que Chrome accepte la requête
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Content-Type": "application/json"
};

// Fonction principale
exports.handler = async (event) => {
  // 🔹 Étape 1 : Gérer les requêtes prévol CORS (OPTIONS)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "OK"
    };
  }

  try {
    // 🔹 Étape 2 : Lire le corps de la requête JSON
    const body = JSON.parse(event.body || "{}");
    const adData = body.data;

    // Vérification basique : y a-t-il des données ?
    if (!adData || !adData.title) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Aucune donnée reçue"
        })
      };
    }

    // 🔹 Étape 3 : Simulation d’une réponse IA (Claude)
    // (Remplacera plus tard par un appel réel à l'API Claude)
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

    // 🔹 Étape 4 : Réponse JSON OK
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        data: fake
      })
    };

  } catch (err) {
    // 🔹 Étape 5 : Gestion d’erreurs
    console.error("❌ Erreur analyze.js:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Erreur interne serveur"
      })
    };
  }
};
