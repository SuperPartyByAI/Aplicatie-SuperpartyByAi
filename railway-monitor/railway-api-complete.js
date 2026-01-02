/**
 * v7.0 - Configurează Railway COMPLET prin API
 * Fără intervenție umană
 */

const https = require('https');

const RAILWAY_TOKEN = 'b74c098c-1777-4601-b4c5-1f9298377cd9';

const VARIABLES = {
  OPENAI_API_KEY:
    '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',
  TWILIO_ACCOUNT_SID: 'AC17c88873d670aab4aa4a50fae230d2df',
  TWILIO_AUTH_TOKEN: '5c6670d39a1dbf46d47ecdaa244b91d9',
  TWILIO_PHONE_NUMBER: '+12182204425',
  BACKEND_URL: 'https://web-production-f0714.up.railway.app',
  COQUI_API_URL: 'https://web-production-00dca9.up.railway.app',
  NODE_ENV: 'production',
  PORT: '5001',
};

async function railwayGraphQL(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });

    const req = https.request(
      {
        hostname: 'backboard.railway.app',
        path: '/graphql/v2',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RAILWAY_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function configureRailway() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 v7.0 - Configurare Railway prin API');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    // 1. Get all projects
    console.log('🔍 Căutare proiecte...');
    const projectsQuery = `
      query {
        projects {
          edges {
            node {
              id
              name
              services {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;

    const projectsResult = await railwayGraphQL(projectsQuery);

    if (projectsResult.errors) {
      console.log('❌ Eroare Railway API:', projectsResult.errors[0].message);
      console.log('');
      console.log('Token-ul nu are permisiuni suficiente.');
      console.log('Trebuie să folosești Railway Dashboard manual.');
      console.log('');
      console.log('Urmează pașii din: OPTION-2-EXACT-STEPS.md');
      return false;
    }

    console.log('✅ Acces Railway API');

    // Find the service
    let targetService = null;
    for (const project of projectsResult.data.projects.edges) {
      for (const service of project.node.services.edges) {
        console.log(`   Găsit: ${service.node.name} (${service.node.id})`);
        // Look for the service we want
        if (service.node.id === '1931479e-da65-4d3a-8c5b-77c4b8fb3e31') {
          targetService = {
            id: service.node.id,
            projectId: project.node.id,
            name: service.node.name,
          };
        }
      }
    }

    if (!targetService) {
      console.log('❌ Nu am găsit serviciul');
      return false;
    }

    console.log(`✅ Serviciu găsit: ${targetService.name}`);
    console.log('');

    // 2. Get environment ID
    console.log('🔍 Găsire environment...');
    const envQuery = `
      query {
        project(id: "${targetService.projectId}") {
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `;

    const envResult = await railwayGraphQL(envQuery);
    const environmentId = envResult.data.project.environments.edges[0].node.id;
    console.log(`✅ Environment: ${environmentId}`);
    console.log('');

    // 3. Add variables
    console.log('🔐 Adăugare variabile...');
    for (const [key, value] of Object.entries(VARIABLES)) {
      console.log(`   ➕ ${key}...`);

      const varMutation = `
        mutation {
          variableUpsert(input: {
            projectId: "${targetService.projectId}"
            environmentId: "${environmentId}"
            serviceId: "${targetService.id}"
            name: "${key}"
            value: "${value}"
          })
        }
      `;

      const varResult = await railwayGraphQL(varMutation);

      if (varResult.errors) {
        console.log(`   ⚠️  Eroare: ${varResult.errors[0].message}`);
      } else {
        console.log(`   ✅ Adăugat`);
      }
    }
    console.log('');

    // 4. Update service source
    console.log('🔗 Conectare la GitHub repo...');
    const updateMutation = `
      mutation {
        serviceConnect(input: {
          serviceId: "${targetService.id}"
          repo: "SuperPartyByAI/superparty-ai-backend"
          branch: "main"
        }) {
          id
        }
      }
    `;

    const updateResult = await railwayGraphQL(updateMutation);

    if (updateResult.errors) {
      console.log(`⚠️  Nu pot conecta repo: ${updateResult.errors[0].message}`);
      console.log('   Probabil trebuie conectat manual prima dată');
    } else {
      console.log('✅ Repo conectat!');
    }
    console.log('');

    // 5. Trigger redeploy
    console.log('🚀 Trigger redeploy...');
    const redeployMutation = `
      mutation {
        serviceInstanceRedeploy(serviceId: "${targetService.id}")
      }
    `;

    const redeployResult = await railwayGraphQL(redeployMutation);

    if (redeployResult.errors) {
      console.log(`⚠️  ${redeployResult.errors[0].message}`);
    } else {
      console.log('✅ Redeploy declanșat!');
    }
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ RAILWAY CONFIGURAT!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('⏳ Așteaptă 2-3 minute pentru deploy...');
    console.log('');
    console.log('Apoi sună la: +1 (218) 220-4425');
    console.log('Voce: Kasya (Coqui XTTS)');
    console.log('');

    return true;
  } catch (error) {
    console.error('❌ Eroare:', error.message);
    return false;
  }
}

if (require.main === module) {
  configureRailway().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { configureRailway };
