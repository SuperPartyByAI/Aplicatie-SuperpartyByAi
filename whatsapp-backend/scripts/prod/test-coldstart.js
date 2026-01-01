const axios = require('axios');

async function testColdstart(baseUrl, accountId, token) {
  try {
    // Restart socket
    await axios.post(
      `${baseUrl}/api/admin/sockets/restart`,
      { accountId },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    // Wait for reconnect (max 60s)
    const startTime = Date.now();
    while ((Date.now() - startTime) / 1000 < 60) {
      const response = await axios.get(`${baseUrl}/api/whatsapp/accounts`);
      const account = response.data.accounts.find(a => a.id === accountId);

      if (account && (account.status === 'connected' || account.status === 'qr_ready')) {
        return {
          pass: true,
          reconnectTime: (Date.now() - startTime) / 1000,
          finalStatus: account.status,
        };
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return { pass: false, reason: 'timeout_60s' };
  } catch (error) {
    return { pass: false, reason: error.message };
  }
}

module.exports = { testColdstart };
