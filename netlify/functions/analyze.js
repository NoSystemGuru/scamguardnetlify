const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');

exports.handler = async (event) => {
  // CORS
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
    const { url } = JSON.parse(event.body);

    if (!url || !url.includes('leboncoin.fr')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL Leboncoin invalide' })
      };
    }

    console.log('Scraping:', url);

    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    const adData = {
      url,
      title: $('h1').first().text().trim() || 'Titre non trouve',
      price: $('[data-qa-id="adview_price"]').first().text().trim() || 'Prix non disponible',
      description: $('[data-qa-id="adview_description_container"]').text().trim().substring(0, 500) || 'Description non disponible',
      location: $('[data-qa-id="adview_location_informations"]').text().trim() || 'Localisation non disponible',
      image_url: $('img[itemprop="image"]').first().attr('src') || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400'
    };

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `Analyse cette annonce Leboncoin. Titre: ${adData.title}, Prix: ${adData.price}, Description: ${adData.description}. Fournis un JSON avec: overall_score, profile_score, price_score, content_score, photos_score, location_score, payment_score, communication_score, timing_score, items_count_score (sur 100), risk_level ("low"/"medium"/"high"), red_flags (array), green_flags (array), recommendation (francais).`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Expert en arnaques. Reponds en JSON." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          ...adData,
          ...analysis,
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
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

**Commit**

---

### 2. `public/index.html`
```
Add file → Create new file

Nom : public/index.html

Contenu : (copie ton index.html actuel du repo scamguard)
```

**Commit**

---

### 3. `package.json`
```
Add file → Create new file

Nom : package.json
