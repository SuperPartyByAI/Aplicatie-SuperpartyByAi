/**
 * AUTOMATIC RAILWAY DEPLOYMENT SCRIPT
 * Creates v7.0 Singularity service automatically
 */

const fetch = require('node-fetch');

const RAILWAY_TOKEN = '998d4e46-c67c-47e2-9eaa-ae4cc806aab1';
const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

async function railwayQuery(query, variables = {}) {
  const response = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RAILWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await response.json();

  if (data.errors) {
    throw new Error(JSON.stringify(data.errors, null, 2));
  }

  return data.data;
}

async function deployV7() {
  console.log('');
  console.log('============================================================');
  console.log('🚀 DEPLOYING v7.0 SINGULARITY TO RAILWAY');
  console.log('============================================================');
  console.log('');

  try {
    // Step 1: Get user info
    console.log('📋 Step 1: Getting user info...');
    const meQuery = `query { me { id email name } }`;
    const me = await railwayQuery(meQuery);
    console.log(`✅ Logged in as: ${me.me.email}`);
    console.log('');

    // Step 2: List projects
    console.log('📋 Step 2: Finding SuperParty project...');
    const projectsQuery = `query { projects { edges { node { id name } } } }`;
    const projects = await railwayQuery(projectsQuery);

    console.log('Available projects:');
    projects.projects.edges.forEach((edge, i) => {
      console.log(`  ${i + 1}. ${edge.node.name} (${edge.node.id})`);
    });
    console.log('');

    // Find SuperParty project or use first one
    let projectId = projects.projects.edges[0]?.node.id;
    const superpartyProject = projects.projects.edges.find(
      e =>
        e.node.name.toLowerCase().includes('superparty') ||
        e.node.name.toLowerCase().includes('aplicatie')
    );

    if (superpartyProject) {
      projectId = superpartyProject.node.id;
      console.log(`✅ Found SuperParty project: ${superpartyProject.node.name}`);
    } else {
      console.log(`⚠️  Using first project: ${projects.projects.edges[0]?.node.name}`);
    }
    console.log('');

    // Step 3: Create service
    console.log('📋 Step 3: Creating v7.0 Singularity service...');
    const createServiceMutation = `
      mutation ServiceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
        }
      }
    `;

    const serviceInput = {
      projectId: projectId,
      name: 'v7-singularity-monitor',
      source: {
        repo: 'SuperPartyByAI/Aplicatie-SuperpartyByAi',
        branch: 'main',
      },
    };

    const service = await railwayQuery(createServiceMutation, { input: serviceInput });
    const serviceId = service.serviceCreate.id;

    console.log(`✅ Service created: ${service.serviceCreate.name}`);
    console.log(`   ID: ${serviceId}`);
    console.log('');

    // Step 4: Configure service
    console.log('📋 Step 4: Configuring service...');

    // Set root directory
    const updateServiceMutation = `
      mutation ServiceUpdate($id: String!, $input: ServiceUpdateInput!) {
        serviceUpdate(id: $id, input: $input)
      }
    `;

    await railwayQuery(updateServiceMutation, {
      id: serviceId,
      input: {
        rootDirectory: 'monitoring',
        startCommand: 'npm start',
      },
    });

    console.log('✅ Root directory set: monitoring');
    console.log('✅ Start command set: npm start');
    console.log('');

    // Step 5: Add environment variables
    console.log('📋 Step 5: Adding environment variables...');

    const variables = [
      { key: 'RAILWAY_TOKEN', value: RAILWAY_TOKEN },
      { key: 'PORT', value: '3001' },
      { key: 'NODE_ENV', value: 'production' },
    ];

    const upsertVariableMutation = `
      mutation VariableUpsert($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }
    `;

    for (const variable of variables) {
      await railwayQuery(upsertVariableMutation, {
        input: {
          projectId: projectId,
          environmentId: null, // Production environment
          serviceId: serviceId,
          name: variable.key,
          value: variable.value,
        },
      });
      console.log(
        `✅ ${variable.key} = ${variable.key === 'RAILWAY_TOKEN' ? '***' : variable.value}`
      );
    }
    console.log('');

    // Step 6: Trigger deployment
    console.log('📋 Step 6: Triggering deployment...');
    const deployMutation = `
      mutation ServiceInstanceRedeploy($serviceId: String!) {
        serviceInstanceRedeploy(serviceId: $serviceId)
      }
    `;

    await railwayQuery(deployMutation, { serviceId });
    console.log('✅ Deployment triggered');
    console.log('');

    // Step 7: Generate domain
    console.log('📋 Step 7: Generating public domain...');
    const domainMutation = `
      mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          id
          domain
        }
      }
    `;

    try {
      const domain = await railwayQuery(domainMutation, {
        input: {
          serviceId: serviceId,
        },
      });

      console.log(`✅ Domain generated: https://${domain.serviceDomainCreate.domain}`);
      console.log('');

      // Final summary
      console.log('============================================================');
      console.log('✅ v7.0 SINGULARITY DEPLOYED SUCCESSFULLY!');
      console.log('============================================================');
      console.log('');
      console.log('📊 Dashboard: https://' + domain.serviceDomainCreate.domain);
      console.log('📊 API: https://' + domain.serviceDomainCreate.domain + '/api/overview');
      console.log('📊 Health: https://' + domain.serviceDomainCreate.domain + '/health');
      console.log('');
      console.log('⏳ Deployment in progress...');
      console.log('   Check Railway dashboard for logs');
      console.log('   Service will be ready in ~2-3 minutes');
      console.log('');
      console.log('🎯 Next steps:');
      console.log('   1. Wait for deployment to complete');
      console.log('   2. Open dashboard URL in browser');
      console.log('   3. Add projects via API or variables');
      console.log('');
      console.log('============================================================');
      console.log('');
    } catch (error) {
      console.log('⚠️  Could not generate domain automatically');
      console.log('   Generate it manually: Railway → Service → Settings → Networking');
      console.log('');
    }
  } catch (error) {
    console.error('');
    console.error('❌ DEPLOYMENT FAILED');
    console.error('============================================================');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Possible issues:');
    console.error('  - Invalid RAILWAY_TOKEN');
    console.error('  - No projects found');
    console.error('  - API permissions issue');
    console.error('');
    console.error('Try:');
    console.error('  1. Verify RAILWAY_TOKEN is correct');
    console.error('  2. Check Railway dashboard');
    console.error('  3. Deploy manually following DEPLOY-V7-RAILWAY-SIMPLU.md');
    console.error('');
    process.exit(1);
  }
}

// Run deployment
deployV7();
