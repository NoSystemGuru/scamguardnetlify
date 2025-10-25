const axios = require('axios');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { url } = JSON.parse(event.body);

    if (!url || !url.includes('leboncoin.fr')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL Leboncoin invalide' })
      };
    }

    console.log('📡 Scraping:', url);

    // Scraping avec headers améliorés
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': 'https://www.leboncoin.fr/',
        'Connection': 'keep-alive'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);

    const adData = {
      url,
      title: $('h1[data-qa-id="adview_title"]').first().text().trim() || 'Titre non trouvé',
      price: $('[data-qa-id="adview_price"]').first().text().trim() || 'Prix non disponible',
      description: $('[data-qa-id="adview_description_container"]').text().trim().substring(0, 500) || 'Description non disponible',
      location: $('[data-qa-id="adview_location_informations"]').text().trim() || 'Localisation non disponible',
      image_url: $('[data-qa-id="adview_image_container"] img').first().attr('src') || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400'
    };

    console.log('✅ Données extraites:', adData.title);

    // Analyse avec Claude
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY
    });

    const prompt = `Tu es un expert en détection d'arnaques. Analyse cette annonce Leboncoin:

- Titre: ${adData.title}
- Prix: ${adData.price}
- Description: ${adData.description}
- Localisation: ${adData.location}

Fournis un JSON avec: overall_score (0-100), risk_level ("low"/"medium"/"high"), red_flags (array), green_flags (array), recommendation (string), et 9 scores détaillés.`;

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
    } catch (parseError) {
      analysis = {
        overall_score: 50,
        risk_level: 'medium',
        red_flags: ['Analyse incomplète'],
        green_flags: ['Vérification manuelle recommandée'],
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Erreur',
        details: error.message
      })
    };
  }
};
