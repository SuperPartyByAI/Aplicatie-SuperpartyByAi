const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp Backend API',
      version: '1.0.0',
      description: 'WhatsApp integration API using Baileys',
      contact: {
        name: 'SuperParty',
      },
    },
    servers: [
      {
        url: process.env.BAILEYS_BASE_URL || 'http://37.27.34.179:8080',
        description: 'Production server (Hetzner)',
      },
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        Account: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Account ID',
            },
            name: {
              type: 'string',
              description: 'Account name',
            },
            phone: {
              type: 'string',
              description: 'Phone number',
            },
            status: {
              type: 'string',
              enum: ['qr_ready', 'connected', 'disconnected'],
              description: 'Connection status',
            },
            qrCode: {
              type: 'string',
              description: 'QR code data URL',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
  },
  apis: ['./server.js'],
};

module.exports = swaggerJsdoc(options);
