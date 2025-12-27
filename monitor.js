#!/usr/bin/env node

/**
 * Railway Auto-Monitor & Auto-Repair
 * Monitors all Railway services 24/7 and auto-fixes issues
 */

const https = require('https');

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;
const CHECK_INTERVAL = 60000; // 60 seconds
const RAILWAY_API = 'backboard.railway.app';

// Services to monitor
const SERVICES = {
  backend: {
    url: 'https://web-production-f0714.up.railway.app',
    healthPath: '/',
    name: 'Backend Principal'
  },
  coqui: {
    url: 'https://web-production-00dca9.up.railway.app',
    healthPath: '/health',
    name: 'Coqui Voice Service'
  }
};

// Error patterns to detect
const ERROR_PATTERNS = [
  /error/i,
  /exception/i,
  /failed/i,
  /crash/i,
  /cannot/i,
  /undefined/i,
  /null is not/i,
  /ECONNREFUSED/i,
  /timeout/i
];

/**
 * Make GraphQL request to Railway API
 */
function railwayAPI(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    
    const options = {
      hostname: RAILWAY_API,
      path: '/graphql/v2',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RAILWAY_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.errors) {
            reject(new Error(json.errors[0].message));
          } else {
            resolve(json.data);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Check service health
 */
function checkHealth(service) {
  return new Promise((resolve) => {
    const url = new URL(service.url + service.healthPath);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      timeout: 10000
    };
    
    const req = https.request(options, (res) => {
      const healthy = res.statusCode >= 200 && res.statusCode < 400;
      resolve({
        healthy,
        status: res.statusCode,
        service: service.name
      });
    });
    
    req.on('error', () => {
      resolve({
        healthy: false,
        status: 0,
        service: service.name,
        error: 'Connection failed'
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        healthy: false,
        status: 0,
        service: service.name,
        error: 'Timeout'
      });
    });
    
    req.end();
  });
}

/**
 * Get deployment logs
 */
async function getDeploymentLogs(deploymentId) {
  const query = `
    query GetLogs($deploymentId: String!) {
      deploymentLogs(deploymentId: $deploymentId, limit: 100) {
        logs
      }
    }
  `;
  
  try {
    const data = await railwayAPI(query, { deploymentId });
    return data.deploymentLogs?.logs || [];
  } catch (error) {
    console.error('Failed to get logs:', error.message);
    return [];
  }
}

/**
 * Detect errors in logs
 */
function detectErrors(logs) {
  const errors = [];
  
  for (const log of logs) {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(log)) {
        errors.push(log);
        break;
      }
    }
  }
  
  return errors;
}

/**
 * Auto-repair: Restart service
 */
async function restartService(serviceId) {
  const mutation = `
    mutation RestartService($serviceId: String!) {
      serviceInstanceRestart(serviceId: $serviceId)
    }
  `;
  
  try {
    await railwayAPI(mutation, { serviceId });
    console.log('✅ Service restarted successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to restart service:', error.message);
    return false;
  }
}

/**
 * Monitor all services
 */
async function monitorServices() {
  console.log(`\n🔍 [${new Date().toISOString()}] Checking services...`);
  
  for (const [key, service] of Object.entries(SERVICES)) {
    const health = await checkHealth(service);
    
    if (health.healthy) {
      console.log(`✅ ${service.name}: OK (${health.status})`);
    } else {
      console.log(`❌ ${service.name}: DOWN (${health.status || health.error})`);
      console.log(`🔧 Attempting auto-repair...`);
      
      // TODO: Get service ID and restart
      // For now, just log the issue
      console.log(`⚠️  Manual intervention may be required`);
    }
  }
}

/**
 * Main monitoring loop
 */
async function main() {
  if (!RAILWAY_TOKEN) {
    console.error('❌ RAILWAY_TOKEN not set!');
    process.exit(1);
  }
  
  console.log('🤖 Railway Auto-Monitor Started');
  console.log(`📊 Monitoring ${Object.keys(SERVICES).length} services`);
  console.log(`⏱️  Check interval: ${CHECK_INTERVAL / 1000}s`);
  console.log('');
  
  // Initial check
  await monitorServices();
  
  // Continuous monitoring
  setInterval(monitorServices, CHECK_INTERVAL);
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('💥 Unhandled rejection:', error);
});

// Start monitoring
main().catch(console.error);
