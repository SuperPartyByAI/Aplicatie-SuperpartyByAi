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
    minInstances: 1,
  });

  // Initialize dashboard
  const dashboard = new MultiProjectDashboard({
    port: 3001,
    updateInterval: 60000, // 1 min
  });

  // Add projects
  console.log('📦 Adding projects...');

  // Add SuperParty main app
  if (process.env.SUPERPARTY_PROJECT_ID) {
    await monitor.addProject({
      id: process.env.SUPERPARTY_PROJECT_ID,
      name: 'SuperParty',
    });
    await dashboard.addProject(process.env.SUPERPARTY_PROJECT_ID, 'SuperParty');
  }

  // Add voice service
  if (process.env.VOICE_PROJECT_ID) {
    await monitor.addProject({
      id: process.env.VOICE_PROJECT_ID,
      name: 'Voice Service',
    });
    await dashboard.addProject(process.env.VOICE_PROJECT_ID, 'Voice Service');
  }

  // Add monitoring service
  if (process.env.MONITORING_PROJECT_ID) {
    await monitor.addProject({
      id: process.env.MONITORING_PROJECT_ID,
      name: 'Monitoring',
    });
    await dashboard.addProject(process.env.MONITORING_PROJECT_ID, 'Monitoring');
  }

  console.log('');
  console.log('✅ Projects added');
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
    console.log(
      `📊 Dashboard: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-service.railway.app'}`
    );
    console.log(
      `📊 API: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-service.railway.app'}/api/overview`
    );
  } else {
    console.log(`📊 Dashboard: http://localhost:${port}`);
    console.log(`📊 API: http://localhost:${port}/api/overview`);
  }

  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
}

// Handle errors
process.on('unhandledRejection', error => {
  console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught exception:', error);
});

// Start
start().catch(error => {
  console.error('❌ Failed to start:', error);
  process.exit(1);
});
