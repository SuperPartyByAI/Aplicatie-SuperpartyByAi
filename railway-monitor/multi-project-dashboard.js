/**
 * MULTI-PROJECT DASHBOARD
 * Centralized management for all projects
 */

const express = require('express');
const RailwayAPI = require('./railway-api');

class MultiProjectDashboard {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 3001,
      updateInterval: config.updateInterval || 60000, // 1 min
      ...config
    };

    this.railway = new RailwayAPI(process.env.RAILWAY_TOKEN);
    this.projects = new Map();
    this.app = express();
    
    this.setupRoutes();
    
    console.log('📊 Multi-Project Dashboard initialized');
  }

  /**
   * Add project to dashboard
   */
  async addProject(projectId, name, servicesData = null) {
    console.log(`📦 Adding project to dashboard: ${name || projectId}`);
    
    try {
      let services = [];
      
      // Try to get services from Railway API
      if (!servicesData) {
        try {
          const projectData = await this.railway.projects.get(projectId);
          services = await this.railway.projects.getServices(projectId);
          name = name || projectData.name;
        } catch (error) {
          console.log(`⚠️ Could not fetch from Railway API: ${error.message}`);
          // Continue with empty services
        }
      } else {
        services = servicesData;
      }

      const project = {
        id: projectId,
        name: name || projectId,
        services: services.map(s => ({
          id: s.id,
          name: s.name,
          url: s.url,
          status: 'unknown',
          metrics: {
            uptime: 100,
            responseTime: 0,
            requests: 0,
            errors: 0,
            cpu: 0,
            memory: 0
          },
          lastCheck: null
        })),
        metrics: {
          totalUptime: 100,
          totalRequests: 0,
          totalErrors: 0,
          avgResponseTime: 0,
          totalCost: 0
        },
        status: 'healthy',
        addedAt: Date.now()
      };

      this.projects.set(projectId, project);
      
      console.log(`✅ Project added to dashboard: ${project.name} (${project.services.length} services)`);
      
      // Start monitoring (don't await to avoid blocking)
      this.updateProjectMetrics(projectId).catch(err => {
        console.log(`⚠️ Could not update metrics: ${err.message}`);
      });
      
      return project;
      
    } catch (error) {
      console.error(`❌ Failed to add project to dashboard:`, error.message);
      // Don't throw - just log and continue
      return null;
    }
  }

  /**
   * Remove project from dashboard
   */
  removeProject(projectId) {
    const project = this.projects.get(projectId);
    if (project) {
      this.projects.delete(projectId);
      console.log(`✅ Project removed: ${project.name}`);
      return true;
    }
    return false;
  }

  /**
   * Update metrics for a project
   */
  async updateProjectMetrics(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return;

    let totalUptime = 0;
    let totalRequests = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;
    let healthyServices = 0;

    // Update each service
    for (const service of project.services) {
      try {
        // Health check
        const health = await this.checkServiceHealth(service);
        service.status = health.healthy ? 'healthy' : 'unhealthy';
        service.metrics.responseTime = health.responseTime;
        service.lastCheck = Date.now();

        if (health.healthy) {
          healthyServices++;
        }

        // Get metrics from Railway
        try {
          const metrics = await this.railway.services.getMetrics(service.id);
          service.metrics.cpu = metrics.cpu || 0;
          service.metrics.memory = metrics.memory || 0;
          service.metrics.requests = metrics.requests || 0;
          service.metrics.errors = metrics.errors || 0;
        } catch (error) {
          // Ignore metrics errors
        }

        // Aggregate
        totalRequests += service.metrics.requests;
        totalErrors += service.metrics.errors;
        totalResponseTime += service.metrics.responseTime;

      } catch (error) {
        console.error(`❌ Error updating service ${service.name}:`, error.message);
        service.status = 'error';
      }
    }

    // Calculate project metrics
    project.metrics.totalUptime = (healthyServices / project.services.length) * 100;
    project.metrics.totalRequests = totalRequests;
    project.metrics.totalErrors = totalErrors;
    project.metrics.avgResponseTime = totalResponseTime / project.services.length;
    
    // Update project status
    if (healthyServices === project.services.length) {
      project.status = 'healthy';
    } else if (healthyServices === 0) {
      project.status = 'down';
    } else {
      project.status = 'degraded';
    }
  }

  /**
   * Check service health
   */
  async checkServiceHealth(service) {
    if (!service.url) {
      return { healthy: false, responseTime: 0, reason: 'No URL' };
    }

    try {
      const start = Date.now();
      const response = await fetch(service.url, {
        timeout: 10000,
        headers: { 'User-Agent': 'MultiProject-Dashboard/1.0' }
      });
      const responseTime = Date.now() - start;

      return {
        healthy: response.ok,
        responseTime,
        status: response.status,
        reason: response.ok ? 'ok' : `HTTP ${response.status}`
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: 0,
        reason: error.message
      };
    }
  }

  /**
   * Get overview of all projects
   */
  getOverview() {
    const overview = {
      totalProjects: this.projects.size,
      totalServices: 0,
      healthyProjects: 0,
      degradedProjects: 0,
      downProjects: 0,
      totalUptime: 0,
      totalCost: 0,
      projects: []
    };

    for (const [id, project] of this.projects) {
      overview.totalServices += project.services.length;
      overview.totalUptime += project.metrics.totalUptime;
      overview.totalCost += project.metrics.totalCost;

      if (project.status === 'healthy') overview.healthyProjects++;
      else if (project.status === 'degraded') overview.degradedProjects++;
      else if (project.status === 'down') overview.downProjects++;

      overview.projects.push({
        id: project.id,
        name: project.name,
        services: project.services.length,
        status: project.status,
        uptime: project.metrics.totalUptime,
        responseTime: project.metrics.avgResponseTime,
        requests: project.metrics.totalRequests,
        errors: project.metrics.totalErrors,
        cost: project.metrics.totalCost
      });
    }

    if (this.projects.size > 0) {
      overview.totalUptime = overview.totalUptime / this.projects.size;
    }

    return overview;
  }

  /**
   * Get detailed project info
   */
  getProject(projectId) {
    return this.projects.get(projectId);
  }

  /**
   * Setup Express routes
   */
  setupRoutes() {
    this.app.use(express.json());

    // Overview
    this.app.get('/api/overview', (req, res) => {
      res.json(this.getOverview());
    });

    // List projects
    this.app.get('/api/projects', (req, res) => {
      const projects = Array.from(this.projects.values()).map(p => ({
        id: p.id,
        name: p.name,
        services: p.services.length,
        status: p.status,
        uptime: p.metrics.totalUptime,
        addedAt: p.addedAt
      }));
      res.json(projects);
    });

    // Get project details
    this.app.get('/api/projects/:id', (req, res) => {
      const project = this.getProject(req.params.id);
      if (project) {
        res.json(project);
      } else {
        res.status(404).json({ error: 'Project not found' });
      }
    });

    // Add project
    this.app.post('/api/projects', async (req, res) => {
      try {
        const { projectId, name } = req.body;
        const project = await this.addProject(projectId, name);
        res.json(project);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Remove project
    this.app.delete('/api/projects/:id', (req, res) => {
      const removed = this.removeProject(req.params.id);
      if (removed) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Project not found' });
      }
    });

    // Health endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', projects: this.projects.size });
    });

    // Serve simple HTML dashboard
    this.app.get('/', (req, res) => {
      res.send(this.generateHTML());
    });
  }

  /**
   * Generate simple HTML dashboard
   */
  generateHTML() {
    const overview = this.getOverview();
    
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Multi-Project Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 32px; margin-bottom: 30px; color: #fff; }
    .overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .card { background: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155; }
    .card h3 { font-size: 14px; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .card .value { font-size: 36px; font-weight: 700; color: #fff; }
    .card .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
    .projects { display: grid; gap: 20px; }
    .project { background: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155; }
    .project-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .project-name { font-size: 20px; font-weight: 600; color: #fff; }
    .status { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .status.healthy { background: #10b981; color: #fff; }
    .status.degraded { background: #f59e0b; color: #fff; }
    .status.down { background: #ef4444; color: #fff; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
    .metric { }
    .metric-label { font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
    .metric-value { font-size: 24px; font-weight: 600; color: #fff; }
    .refresh { position: fixed; bottom: 30px; right: 30px; background: #3b82f6; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); }
    .refresh:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧠 Multi-Project Dashboard</h1>
    
    <div class="overview">
      <div class="card">
        <h3>Total Projects</h3>
        <div class="value">${overview.totalProjects}</div>
        <div class="subtitle">${overview.totalServices} services</div>
      </div>
      <div class="card">
        <h3>Average Uptime</h3>
        <div class="value">${overview.totalUptime.toFixed(1)}%</div>
        <div class="subtitle">${overview.healthyProjects} healthy</div>
      </div>
      <div class="card">
        <h3>Total Cost</h3>
        <div class="value">$${overview.totalCost.toFixed(0)}</div>
        <div class="subtitle">per month</div>
      </div>
      <div class="card">
        <h3>Status</h3>
        <div class="value">${overview.healthyProjects}/${overview.totalProjects}</div>
        <div class="subtitle">projects healthy</div>
      </div>
    </div>
    
    <div class="projects">
      ${overview.projects.map(p => `
        <div class="project">
          <div class="project-header">
            <div class="project-name">${p.name}</div>
            <span class="status ${p.status}">${p.status}</span>
          </div>
          <div class="metrics">
            <div class="metric">
              <div class="metric-label">Services</div>
              <div class="metric-value">${p.services}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Uptime</div>
              <div class="metric-value">${p.uptime.toFixed(1)}%</div>
            </div>
            <div class="metric">
              <div class="metric-label">Response</div>
              <div class="metric-value">${p.responseTime.toFixed(0)}ms</div>
            </div>
            <div class="metric">
              <div class="metric-label">Requests</div>
              <div class="metric-value">${p.requests.toLocaleString()}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Errors</div>
              <div class="metric-value">${p.errors}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Cost</div>
              <div class="metric-value">$${p.cost.toFixed(0)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>
  
  <button class="refresh" onclick="location.reload()">Refresh</button>
  
  <script>
    // Auto-refresh every 60 seconds
    setTimeout(() => location.reload(), 60000);
  </script>
</body>
</html>
    `;
  }

  /**
   * Start dashboard server
   */
  async start() {
    // Start periodic updates
    setInterval(async () => {
      for (const [projectId] of this.projects) {
        await this.updateProjectMetrics(projectId);
      }
    }, this.config.updateInterval);

    // Start Express server
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        console.log(`✅ Dashboard running at http://localhost:${this.config.port}`);
        resolve();
      });
    });
  }
}

module.exports = MultiProjectDashboard;
