exports.handler = async (event, context) => {
  const { data } = JSON.parse(event.body || '{}');
  
  // data contient déjà: title, price, description, location
  // Plus besoin de scraper !
  
  // Juste analyser avec Claude
  const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY
  });
  
  // ... reste du code d'analyse
};
