/**
 * START AUTONOMOUS MONITOR
 * Entry point for self-managing AI system
 */

const AutonomousMonitor = require('./autonomous-monitor');
const http = require('http');

console.log('🤖 AUTONOMOUS MONITOR - Self-Managing AI System');
console.log('='.repeat(70));

// Create monitor
const monitor = new AutonomousMonitor();

// Start monitoring
monitor.start();

// HTTP server for health checks and stats
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'Autonomous Monitor',
      uptime: process.uptime(),
      stats: monitor.getAutonomousStats()
    }));
  } else if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(monitor.getAutonomousStats(), null, 2));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(port, () => {
  console.log(`\n✅ HTTP server listening on port ${port}`);
  console.log(`   Health: http://localhost:${port}/health`);
  console.log(`   Stats: http://localhost:${port}/stats`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
