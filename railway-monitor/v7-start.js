/**
 * v7.0 SINGULARITY - START SCRIPT
 * 
 * Pornește toate componentele v7.0:
 * - Self-replication
 * - Multi-project management
 * - Advanced learning
 * - Intelligent auto-repair
 */

const SingularityMonitor = require('./v7-singularity');
const MultiProjectDashboard = require('./multi-project-dashboard');

async function start() {
  console.log('');
  console.log('============================================================');
  console.log('🧠 v7.0 SINGULARITY MONITOR');
  console.log('============================================================');
  console.log('');
  console.log('Features:');
  console.log('  🧬 Self-replication (auto-scaling)');
  console.log('  🌍 Multi-project management');
  console.log('  🎓 Advanced learning system');
  console.log('  🔧 Intelligent auto-repair');
  console.log('');
  console.log('Target: <5s downtime/month, 95% prevention');
  console.log('');
  console.log('============================================================');
  console.log('');

  // Initialize monitor
  const monitor = new SingularityMonitor({
    healthCheckInterval: 5000, // 5s
    scaleUpThreshold: 80,
    scaleDownThreshold: 30,
    maxInstances: 5,
    minInstances: 1
  });

  // Initialize dashboard
  const dashboard = new MultiProjectDashboard({
    port: 3001,
    updateInterval: 60000 // 1 min
  });

  // Add projects
  console.log('📦 Adding projects...');
  
  let projectsAdded = 0;
  
  // Auto-detect projects from env vars (v5.0 compatibility)
  let i = 1;
  while (process.env[`BACKEND_URL_${i}`]) {
    const projectName = process.env[`PROJECT_NAME_${i}`] || `Project ${i}`;
    const projectUrl = process.env[`BACKEND_URL_${i}`];
    const serviceId = process.env[`BACKEND_SERVICE_ID_${i}`];
    
    if (projectUrl && serviceId) {
      console.log(`  📦 Adding ${projectName}...`);
      
      const services = [{
        id: serviceId,
        name: projectName,
        url: projectUrl
      }];
      
      await monitor.addProject({
        id: serviceId,
        name: projectName,
        services: services
      });
      
      await dashboard.addProject(serviceId, projectName, services);
      projectsAdded++;
    }
    i++;
  }
  
  // Add SuperParty main app (v7.0 style)
  if (process.env.SUPERPARTY_PROJECT_ID && !projectsAdded) {
    await monitor.addProject({
      id: process.env.SUPERPARTY_PROJECT_ID,
      name: 'SuperParty'
    });
    await dashboard.addProject(process.env.SUPERPARTY_PROJECT_ID, 'SuperParty');
    projectsAdded++;
  }

  // Add voice service
  if (process.env.VOICE_PROJECT_ID && !projectsAdded) {
    await monitor.addProject({
      id: process.env.VOICE_PROJECT_ID,
      name: 'Voice Service'
    });
    await dashboard.addProject(process.env.VOICE_PROJECT_ID, 'Voice Service');
    projectsAdded++;
  }

  // Add monitoring service (SELF-MONITORING)
  if (process.env.RAILWAY_SERVICE_ID) {
    const selfUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${process.env.PORT || 3001}`;
    
    console.log(`  🔄 Adding self-monitoring...`);
    
    const selfServices = [{
      id: process.env.RAILWAY_SERVICE_ID,
      name: 'v7.0 Monitor',
      url: selfUrl
    }];
    
    await monitor.addProject({
      id: process.env.RAILWAY_SERVICE_ID,
      name: 'v7.0 Monitor (Self)',
      services: selfServices
    });
    
    await dashboard.addProject(process.env.RAILWAY_SERVICE_ID, 'v7.0 Monitor (Self)', selfServices);
    projectsAdded++;
  }

  console.log('');
  console.log(`✅ ${projectsAdded} project(s) added`);
  console.log('');

  // Start dashboard
  console.log('🚀 Starting dashboard...');
  await dashboard.start();
  console.log('');

  // Start monitor
  console.log('🚀 Starting monitor...');
  await monitor.start();
  console.log('');

  console.log('============================================================');
  console.log('✅ v7.0 SINGULARITY RUNNING');
  console.log('============================================================');
  console.log('');
  
  const port = process.env.PORT || 3001;
  const isRailway = process.env.RAILWAY_ENVIRONMENT;
  
  if (isRailway) {
    console.log(`📊 Dashboard: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-service.railway.app'}`);
    console.log(`📊 API: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-service.railway.app'}/api/overview`);
  } else {
    console.log(`📊 Dashboard: http://localhost:${port}`);
    console.log(`📊 API: http://localhost:${port}/api/overview`);
  }
  
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
  
  // Auto-deploy Voice AI after 5 seconds
  setTimeout(async () => {
    console.log('');
    console.log('🎤 v7.0: Auto-deploying Voice AI...');
    console.log('');
    
    try {
      const VoiceDeployer = require('./auto-deploy-voice-complete');
      await VoiceDeployer.deploy();
    } catch (error) {
      console.log('⚠️  Voice AI deploy skipped:', error.message);
    }
  }, 5000);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

// Start
start().catch(error => {
  console.error('❌ Failed to start:', error);
  process.exit(1);
});
