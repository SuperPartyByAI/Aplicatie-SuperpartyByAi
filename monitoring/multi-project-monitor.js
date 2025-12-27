/**
 * MULTI-PROJECT MONITOR
 * Monitorizează TOATE proiectele Railway
 * 1 monitor pentru 4+ proiecte
 */

const PerfectMonitor = require('./perfect-monitor');

class MultiProjectMonitor {
  constructor() {
    // Detectează automat toate proiectele din env vars
    this.projects = this.detectProjects();
    
    // Creează un monitor pentru fiecare proiect
    this.monitors = {};
    
    this.projects.forEach(project => {
      console.log(`🚀 Initializing monitor for: ${project.name}`);
      
      // Setează env vars pentru acest proiect
      process.env.BACKEND_URL = project.backendUrl;
      process.env.BACKEND_SERVICE_ID = project.backendServiceId;
      process.env.COQUI_API_URL = project.coquiUrl || project.backendUrl;
      process.env.COQUI_SERVICE_ID = project.coquiServiceId || project.backendServiceId;
      
      // Creează monitor
      this.monitors[project.name] = new PerfectMonitor();
    });
    
    console.log(`\n✅ Multi-Project Monitor initialized`);
    console.log(`   Monitoring ${this.projects.length} projects`);
  }
  
  /**
   * Detectează toate proiectele din env vars
   */
  detectProjects() {
    const projects = [];
    
    // Caută pattern: BACKEND_URL_1, BACKEND_URL_2, etc.
    let i = 1;
    while (process.env[`BACKEND_URL_${i}`]) {
      projects.push({
        name: process.env[`PROJECT_NAME_${i}`] || `Project ${i}`,
        backendUrl: process.env[`BACKEND_URL_${i}`],
        backendServiceId: process.env[`BACKEND_SERVICE_ID_${i}`],
        coquiUrl: process.env[`COQUI_URL_${i}`],
        coquiServiceId: process.env[`COQUI_SERVICE_ID_${i}`]
      });
      i++;
    }
    
    // Dacă nu găsește pattern-ul, folosește variabilele simple
    if (projects.length === 0 && process.env.BACKEND_URL) {
      projects.push({
        name: process.env.PROJECT_NAME || 'Main Project',
        backendUrl: process.env.BACKEND_URL,
        backendServiceId: process.env.BACKEND_SERVICE_ID,
        coquiUrl: process.env.COQUI_API_URL,
        coquiServiceId: process.env.COQUI_SERVICE_ID
      });
    }
    
    return projects;
  }
  
  /**
   * Start monitoring all projects
   */
  start() {
    console.log('\n🚀 Starting Multi-Project Monitoring...\n');
    
    Object.values(this.monitors).forEach(monitor => {
      monitor.start();
    });
    
    // Status report pentru toate proiectele
    setInterval(() => this.printAllStatus(), 5 * 60 * 1000); // La 5 min
  }
  
  /**
   * Print status for all projects
   */
  printAllStatus() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 MULTI-PROJECT STATUS');
    console.log('='.repeat(70));
    
    this.projects.forEach((project, index) => {
      const monitor = this.monitors[project.name];
      const stats = monitor.getStats();
      
      console.log(`\n🚀 ${project.name}`);
      console.log(`   URL: ${project.backendUrl}`);
      
      Object.entries(stats.services).forEach(([name, data]) => {
        console.log(`   ${name}: ${data.uptime}% uptime`);
      });
    });
    
    console.log('\n' + '='.repeat(70) + '\n');
  }
  
  /**
   * Get stats for all projects
   */
  getAllStats() {
    const allStats = {};
    
    this.projects.forEach(project => {
      const monitor = this.monitors[project.name];
      allStats[project.name] = monitor.getStats();
    });
    
    return allStats;
  }
}

// Start monitoring
if (require.main === module) {
  const monitor = new MultiProjectMonitor();
  monitor.start();
  
  // Add HTTP server for health checks
  const http = require('http');
  const port = process.env.PORT || 3000;
  
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        service: 'Multi-Project Monitor',
        projects: monitor.projects.length,
        uptime: process.uptime()
      }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  
  server.listen(port, () => {
    console.log(`✅ Health check server listening on port ${port}`);
  });
}

module.exports = MultiProjectMonitor;
