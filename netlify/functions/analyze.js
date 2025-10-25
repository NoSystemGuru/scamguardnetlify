// netlify/functions/analyze.js

import fetch from 'node-fetch';

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const annonce = body.data || {};

    // --- Vérifications de base ---
    if (!annonce || !annonce.title) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Aucune donnée annonce reçue.',
        }),
      };
    }

    // --- Si clé API Claude dispo ---
    const apiKey = process.env.CLAUDE_API_KEY;
    if (apiKey) {
      try {
        const prompt = `
          Tu es un détecteur d'arnaques Leboncoin.
          Analyse l'annonce suivante et renvoie un JSON structuré :
          {
            "title": "...",
            "overall_score": nombre,
            "risk_level": "high|medium|low",
            "red_flags": [ ... ],
            "green_flags": [ ... ],
            "recommendation": "..."
          }

          Annonce :
          Titre: ${annonce.title}
          Prix: ${annonce.price}
          Description: ${annonce.description}
          Localisation: ${annonce.location}
        `;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 400,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        const aiData = await response.json();
        const aiText = aiData.content?.[0]?.text || '{}';
        const parsed = JSON.parse(aiText);

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            data: parsed,
          }),
        };
      } catch (e) {
        console.error('Erreur appel Claude:', e);
        // continue vers mode demo
      }
    }

    // --- Mode fallback / démo ---
    const fake = {
      title: annonce.title,
      overall_score: 72,
      risk_level: 'medium',
      red_flags: ['Compte récent', 'Peu de détails dans la description'],
      green_flags: ['Prix cohérent', 'Photos correctes'],
      recommendation: "Annonce correcte mais restez vigilant avant paiement.",
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: fake,
      }),
    };
  } catch (error) {
    console.error('❌ Erreur analyze.js :', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Erreur interne du serveur.',
      }),
    };
  }
};
