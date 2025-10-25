const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { url } = JSON.parse(event.body || '{}');

    if (!url || !url.includes('leboncoin.fr')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL Leboncoin invalide' })
      };
    }

    // Extraire l'ID de l'annonce depuis l'URL
    const adIdMatch = url.match(/\/(\d+)$/);
    if (!adIdMatch) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ID annonce introuvable dans l\'URL' })
      };
    }

    const adId = adIdMatch[1];
    console.log('📡 Récupération via API Leboncoin, ID:', adId);

    // 🔥 UTILISER L'API INTERNE LEBONCOIN (non bloquée)
    const apiUrl = `https://api.leboncoin.fr/api/ads/${adId}`;
    
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'api_key': 'ba0c2dad52b3ec'
      },
      timeout: 15000
    });

    const data = response.data;

    // Extraire les données de l'API
    const adData = {
      url,
      title: data.subject || 'Titre non disponible',
      price: data.price ? `${data.price[0]} €` : 'Prix non disponible',
      description: data.body || 'Description non disponible',
      location: data.location?.city || 'Localisation non disponible',
      image_url: data.images?.[0]?.urls?.large || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400',
      published_date: data.first_publication_date || 'Date inconnue',
      views: data.view_count || 0,
      seller_name: data.owner?.name || 'Vendeur inconnu'
    };

    console.log('✅ Données extraites via API:', adData.title);

    // Analyse avec Claude
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY
    });

    const prompt = `Analyse cette annonce Leboncoin:
Titre: ${adData.title}
Prix: ${adData.price}
Description: ${adData.description}
Localisation: ${adData.location}

Fournis un JSON avec: overall_score (0-100), risk_level ("low"/"medium"/"high"), red_flags (array), green_flags (array), recommendation (string), et les 9 scores détaillés (profile_score, price_score, content_score, photos_score, location_score, payment_score, communication_score, timing_score, items_count_score).`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const analysisText = message.content[0].text;
    let analysis;
    
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
    } catch (e) {
      analysis = {
        overall_score: 50,
        risk_level: 'medium',
        red_flags: ['Analyse incomplète'],
        green_flags: ['Vérification manuelle'],
        recommendation: 'Vérifiez manuellement'
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: { ...adData, ...analysis }
      })
    };

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    
    // Message d'erreur plus détaillé
    let errorMsg = error.message;
    if (error.response?.status === 403) {
      errorMsg = 'L\'API Leboncoin a bloqué la requête. Utilisez ScrapingBee (gratuit 1000/mois).';
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Erreur',
        details: errorMsg
      })
    };
  }
};
