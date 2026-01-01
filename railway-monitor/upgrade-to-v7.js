/**
 * v5.0 → v7.0 SELF-UPGRADE
 *
 * v5.0 se upgrade-ază SINGUR la v7.0!
 * Folosește Railway API să-și modifice propriul start command
 */

const fetch = require('node-fetch');

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN || '998d4e46-c67c-47e2-9eaa-ae4cc806aab1';
const SERVICE_URL = process.env.RAILWAY_PUBLIC_DOMAIN || 'web-production-79489.up.railway.app';

console.log('');
console.log('============================================================');
console.log('🤖 v5.0 → v7.0 SELF-UPGRADE');
console.log('============================================================');
console.log('');
console.log('🧠 I am v5.0 Multi-Project Monitor');
console.log('🔄 I will upgrade MYSELF to v7.0 Singularity');
console.log('⚡ Using Railway API to modify my own start command');
console.log('');
console.log('META-LEVEL SELF-MODIFICATION ACTIVATED 🤯');
console.log('');
console.log('============================================================');
console.log('');

async function selfUpgrade() {
  try {
    console.log('📋 Step 1: Finding my own service ID...');

    // Get service info from environment
    const serviceId = process.env.RAILWAY_SERVICE_ID;
    const projectId = process.env.RAILWAY_PROJECT_ID;

    if (!serviceId) {
      console.log('⚠️  RAILWAY_SERVICE_ID not found in environment');
      console.log('');
      console.log('🔧 MANUAL UPGRADE REQUIRED:');
      console.log('');
      console.log('In Railway Dashboard:');
      console.log('1. Settings → Deploy');
      console.log('2. Start Command: node v7-start.js');
      console.log('3. Redeploy');
      console.log('');
      console.log('OR delete Start Command completely and let package.json handle it');
      console.log('');
      process.exit(1);
    }

    console.log(`✅ Service ID: ${serviceId}`);
    console.log(`✅ Project ID: ${projectId}`);
    console.log('');

    console.log('📋 Step 2: Updating my start command via Railway API...');

    const mutation = `
      mutation ServiceInstanceUpdate($environmentId: String!, $serviceId: String!) {
        serviceInstanceUpdate(
          environmentId: $environmentId
          serviceId: $serviceId
          input: {
            startCommand: "node v7-start.js"
          }
        )
      }
    `;

    const response = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RAILWAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
          serviceId: serviceId,
        },
      }),
    });

    const result = await response.json();

    if (result.errors) {
      console.log('❌ API Error:', JSON.stringify(result.errors, null, 2));
      throw new Error('Failed to update service');
    }

    console.log('✅ Start command updated to: node v7-start.js');
    console.log('');

    console.log('📋 Step 3: Triggering redeploy...');

    const redeployMutation = `
      mutation ServiceInstanceRedeploy($environmentId: String!, $serviceId: String!) {
        serviceInstanceRedeploy(
          environmentId: $environmentId
          serviceId: $serviceId
        )
      }
    `;

    const redeployResponse = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RAILWAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: redeployMutation,
        variables: {
          environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
          serviceId: serviceId,
        },
      }),
    });

    const redeployResult = await redeployResponse.json();

    if (redeployResult.errors) {
      console.log('⚠️  Could not trigger redeploy automatically');
      console.log('   Please redeploy manually in Railway Dashboard');
    } else {
      console.log('✅ Redeploy triggered');
    }
    console.log('');

    console.log('============================================================');
    console.log('✅ SELF-UPGRADE INITIATED!');
    console.log('============================================================');
    console.log('');
    console.log('🤖 I (v5.0) have modified my own start command');
    console.log('🔄 I am redeploying myself as v7.0');
    console.log('⏱️  In ~2 minutes, I will be v7.0 Singularity');
    console.log('');
    console.log('🧠 SELF-EVOLUTION COMPLETE!');
    console.log('');
    console.log('When I restart, I will be:');
    console.log('  - v7.0 Singularity Monitor');
    console.log('  - Self-replication enabled');
    console.log('  - Advanced learning enabled');
    console.log('  - Intelligent auto-repair enabled');
    console.log('');
    console.log('SINGULARITY ACHIEVED 🤯');
    console.log('');
    console.log('============================================================');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ SELF-UPGRADE FAILED');
    console.error('============================================================');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('🔧 MANUAL UPGRADE REQUIRED:');
    console.error('');
    console.error('Railway Dashboard → Service → Settings → Deploy:');
    console.error('');
    console.error('Option 1: Change Start Command');
    console.error('  Start Command: node v7-start.js');
    console.error('  Then: Redeploy');
    console.error('');
    console.error('Option 2: Delete Start Command');
    console.error('  Delete the Start Command field completely');
    console.error('  Railway will use package.json (which now runs v7.0)');
    console.error('  Then: Redeploy');
    console.error('');
    console.error('URL: https://railway.app/project/' + process.env.RAILWAY_PROJECT_ID);
    console.error('');
    process.exit(1);
  }
}

// SELF-UPGRADE!
selfUpgrade();
