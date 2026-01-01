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
        url: 'https://aplicatie-superpartybyai-production-d067.up.railway.app',
        description: 'Production server',
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
