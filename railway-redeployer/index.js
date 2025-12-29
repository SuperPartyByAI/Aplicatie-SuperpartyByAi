/**
 * RAILWAY REDEPLOYER - In-platform fallback
 * Triggers redeploy via Railway GraphQL API
 * No UI/CLI needed - runs as separate Railway service
 */

const fetch = require('node-fetch');

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;
const TARGET_SERVICE_ID = process.env.TARGET_SERVICE_ID;
const TARGET_ENVIRONMENT_ID = process.env.TARGET_ENVIRONMENT_ID;
const HEALTH_URL = process.env.HEALTH_URL || 'https://whats-upp-production.up.railway.app/health';
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS) || 300000; // 5 minutes
const MISMATCH_THRESHOLD_MS = parseInt(process.env.MISMATCH_THRESHOLD_MS) || 600000; // 10 minutes

if (!RAILWAY_TOKEN || !TARGET_SERVICE_ID || !TARGET_ENVIRONMENT_ID) {
  console.error('❌ Missing required env vars:');
  console.error('   RAILWAY_TOKEN');
  console.error('   TARGET_SERVICE_ID');
  console.error('   TARGET_ENVIRONMENT_ID');
  process.exit(1);
}

console.log('🚀 Railway Redeployer started');
console.log(`   Target service: ${TARGET_SERVICE_ID}`);
console.log(`   Target environment: ${TARGET_ENVIRONMENT_ID}`);
console.log(`   Health URL: ${HEALTH_URL}`);
console.log(`   Check interval: ${CHECK_INTERVAL_MS}ms`);
console.log(`   Mismatch threshold: ${MISMATCH_THRESHOLD_MS}ms`);

let lastMismatchDetected = null;
let redeployInProgress = false;

async function checkHealth() {
  try {
    const response = await fetch(HEALTH_URL);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Failed to fetch health:', error.message);
    return null;
  }
}

async function getLatestDeployment() {
  const query = `
    query {
      deployments(input: {
        serviceId: "${TARGET_SERVICE_ID}"
        environmentId: "${TARGET_ENVIRONMENT_ID}"
      }) {
        edges {
          node {
            id
            status
            createdAt
            meta
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAILWAY_TOKEN}`
      },
      body: JSON.stringify({ query })
    });

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ GraphQL errors:', result.errors);
      return null;
    }

    const deployments = result.data?.deployments?.edges || [];
    return deployments[0]?.node || null;
  } catch (error) {
    console.error('❌ Failed to get deployments:', error.message);
    return null;
  }
}

async function triggerRedeploy() {
  const mutation = `
    mutation {
      deploymentRedeploy(id: "${TARGET_SERVICE_ID}") {
        id
        status
      }
    }
  `;

  try {
    console.log('🔄 Triggering redeploy...');
    
    const response = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAILWAY_TOKEN}`
      },
      body: JSON.stringify({ query: mutation })
    });

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ Redeploy failed:', result.errors);
      return false;
    }

    console.log('✅ Redeploy triggered:', result.data);
    return true;
  } catch (error) {
    console.error('❌ Failed to trigger redeploy:', error.message);
    return false;
  }
}

async function checkAndRedeploy() {
  if (redeployInProgress) {
    console.log('⏳ Redeploy already in progress, skipping check');
    return;
  }

  const health = await checkHealth();
  
  if (!health) {
    console.log('⚠️  Health check failed, skipping');
    return;
  }

  const deployedCommit = health.commit;
  const uptime = health.uptime;
  
  console.log(`📊 Status: commit=${deployedCommit}, uptime=${uptime}s`);

  // For now, we don't have expectedCommit in health
  // So we check if uptime is very high (> 2 hours) as a proxy for stuck deploy
  const uptimeMs = uptime * 1000;
  
  if (uptimeMs > 7200000) { // 2 hours
    console.log('⚠️  Service uptime > 2 hours, may need redeploy');
    
    if (!lastMismatchDetected) {
      lastMismatchDetected = Date.now();
      console.log('🔍 Mismatch detected, starting timer');
      return;
    }

    const mismatchAge = Date.now() - lastMismatchDetected;
    
    if (mismatchAge > MISMATCH_THRESHOLD_MS) {
      console.log(`🚨 Mismatch age ${mismatchAge}ms > threshold ${MISMATCH_THRESHOLD_MS}ms`);
      console.log('🔄 Triggering automatic redeploy...');
      
      redeployInProgress = true;
      const success = await triggerRedeploy();
      
      if (success) {
        console.log('✅ Redeploy triggered successfully');
        lastMismatchDetected = null;
        
        // Wait 2 minutes before checking again
        setTimeout(() => {
          redeployInProgress = false;
        }, 120000);
      } else {
        console.log('❌ Redeploy failed');
        redeployInProgress = false;
      }
    } else {
      console.log(`⏳ Mismatch age ${mismatchAge}ms < threshold, waiting...`);
    }
  } else {
    // Reset mismatch tracking if uptime is reasonable
    if (lastMismatchDetected) {
      console.log('✅ Service restarted, resetting mismatch tracking');
      lastMismatchDetected = null;
    }
  }
}

// Run check immediately
checkAndRedeploy();

// Then run on interval
setInterval(checkAndRedeploy, CHECK_INTERVAL_MS);

// Keep process alive
process.on('SIGTERM', () => {
  console.log('👋 Shutting down gracefully');
  process.exit(0);
});
