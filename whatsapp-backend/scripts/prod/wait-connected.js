const axios = require('axios');

async function waitConnected(baseUrl, maxSeconds) {
  const startTime = Date.now();
  
  while ((Date.now() - startTime) / 1000 < maxSeconds) {
    try {
      const response = await axios.get(`${baseUrl}/api/whatsapp/accounts`);
      const accounts = response.data.accounts || [];
      
      const connected = accounts.find(a => a.status === 'connected');
      if (connected) {
        return connected.id;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(`Poll error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  return null;
}

module.exports = { waitConnected };
