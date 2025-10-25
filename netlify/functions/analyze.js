const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
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

    console.log('Scraping:', url);

    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    const adData = {
      url,
      title: $('h1').first().text().trim() || 'Titre non trouve',
      price: $('[data-qa-id="adview_price"]').first().text().trim() || 'Prix non disponible',
      description: $('[data-qa-id="adview_description_container"]').text().trim().substring(0, 500) || 'Description',
      location: $('[data-qa-id="adview_location_informations"]').text().trim() || 'Localisation',
      image_url: $('img[itemprop="image"]').first().attr('src') || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400'
    };

    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });

    const prompt = 'Analyse cette annonce. Titre: ' + adData.title + ', Prix: ' + adData.price + '. Fournis JSON avec: overall_score, profile_score, price_score, content_score, photos_score, location_score, payment_score, communication_score, timing_score, items_count_score (sur 100), risk_level (low/medium/high), red_flags (array), green_flags (array), recommendation (francais).';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Expert arnaques. Reponds JSON.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          url: adData.url,
          title: adData.title,
          price: adData.price,
          description: adData.description,
          location: adData.location,
          image_url: adData.image_url,
          overall_score: analysis.overall_score,
          profile_score: analysis.profile_score,
          price_score: analysis.price_score,
          content_score: analysis.content_score,
          photos_score: analysis.photos_score,
          location_score: analysis.location_score,
          payment_score: analysis.payment_score,
          communication_score: analysis.communication_score,
          timing_score: analysis.timing_score,
          items_count_score: analysis.items_count_score,
          risk_level: analysis.risk_level,
          red_flags: analysis.red_flags,
          green_flags: analysis.green_flags,
          recommendation: analysis.recommendation,
          published_date: 'Il y a 2 jours',
          views: Math.floor(Math.random() * 500) + 50,
          seller_items: Math.floor(Math.random() * 20) + 1
        }
      })
    };

  } catch (error) {
    console.error('Erreur:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur analyse',
        message: error.message 
      })
    };
  }
};
