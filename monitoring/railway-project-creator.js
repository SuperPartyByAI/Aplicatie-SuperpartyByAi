/**
 * RAILWAY PROJECT CREATOR
 * Automatically creates Railway projects when needed
 */

const fetch = require('node-fetch');

class RailwayProjectCreator {
  constructor() {
    this.apiToken = process.env.RAILWAY_TOKEN;
    this.apiUrl = 'https://backboard.railway.app/graphql/v2';
    
    this.stats = {
      created: 0,
      failed: 0,
      templates: {}
    };
    
    // Project templates
    this.templates = {
      'nodejs-api': {
        name: 'Node.js API',
        description: 'Express.js REST API',
        runtime: 'nodejs',
        buildCommand: 'npm install',
        startCommand: 'npm start',
        envVars: {
          NODE_ENV: 'production',
          PORT: '8080'
        }
      },
      'python-api': {
        name: 'Python API',
        description: 'Flask/FastAPI service',
        runtime: 'python',
        buildCommand: 'pip install -r requirements.txt',
        startCommand: 'python app.py',
        envVars: {
          PYTHONUNBUFFERED: '1',
          PORT: '5000'
        }
      },
      'monitoring': {
        name: 'Monitoring Service',
        description: 'Health monitoring and auto-repair',
        runtime: 'nodejs',
        buildCommand: 'npm install',
        startCommand: 'npm start',
        envVars: {
          NODE_ENV: 'production',
          RAILWAY_TOKEN: process.env.RAILWAY_TOKEN
        }
      },
      'database': {
        name: 'Database Service',
        description: 'PostgreSQL database',
        runtime: 'postgresql',
        plugin: 'postgresql'
      },
      'redis': {
        name: 'Redis Cache',
        description: 'Redis caching layer',
        runtime: 'redis',
        plugin: 'redis'
      }
    };
    
    console.log('🏗️ Railway Project Creator initialized');
  }
  
  /**
   * Create a new Railway project
   */
  async createProject(params) {
    console.log(`\n🏗️ Creating Railway project: ${params.name}`);
    
    try {
      // Get template
      const template = this.templates[params.type] || this.templates['nodejs-api'];
      
      // Create project via Railway API
      const project = await this.createRailwayProject({
        name: params.name,
        description: params.reason || template.description
      });
      
      if (!project.success) {
        throw new Error(project.error);
      }
      
      console.log(`✅ Project created: ${project.id}`);
      
      // Create service in project
      const service = await this.createService(project.id, {
        name: params.name,
        template: template
      });
      
      if (!service.success) {
        throw new Error(service.error);
      }
      
      console.log(`✅ Service created: ${service.id}`);
      
      // Set environment variables
      if (template.envVars) {
        await this.setEnvironmentVariables(project.id, service.id, template.envVars);
      }
      
      // Deploy if repo provided
      if (params.repo) {
        await this.connectRepo(project.id, service.id, params.repo);
        await this.triggerDeploy(service.id);
      }
      
      this.stats.created++;
      
      return {
        success: true,
        projectId: project.id,
        serviceId: service.id,
        url: service.url,
        message: `Project ${params.name} created successfully`
      };
      
    } catch (error) {
      console.error(`❌ Failed to create project:`, error.message);
      this.stats.failed++;
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Create Railway project via GraphQL API
   */
  async createRailwayProject(params) {
    const mutation = `
      mutation CreateProject($name: String!, $description: String) {
        projectCreate(input: {
          name: $name
          description: $description
        }) {
          id
          name
        }
      }
    `;
    
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: mutation,
          variables: params
        })
      });
      
      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }
      
      return {
        success: true,
        id: data.data.projectCreate.id,
        name: data.data.projectCreate.name
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Create service in project
   */
  async createService(projectId, params) {
    const mutation = `
      mutation CreateService($projectId: String!, $name: String!) {
        serviceCreate(input: {
          projectId: $projectId
          name: $name
        }) {
          id
          name
        }
      }
    `;
    
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            projectId: projectId,
            name: params.name
          }
        })
      });
      
      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }
      
      return {
        success: true,
        id: data.data.serviceCreate.id,
        name: data.data.serviceCreate.name,
        url: `https://${data.data.serviceCreate.id}.up.railway.app`
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Set environment variables
   */
  async setEnvironmentVariables(projectId, serviceId, envVars) {
    console.log(`🔧 Setting ${Object.keys(envVars).length} environment variables...`);
    
    for (const [key, value] of Object.entries(envVars)) {
      await this.setEnvVar(projectId, serviceId, key, value);
    }
    
    console.log('✅ Environment variables set');
  }
  
  /**
   * Set single environment variable
   */
  async setEnvVar(projectId, serviceId, key, value) {
    const mutation = `
      mutation SetEnvVar($projectId: String!, $serviceId: String!, $key: String!, $value: String!) {
        variableUpsert(input: {
          projectId: $projectId
          serviceId: $serviceId
          name: $key
          value: $value
        }) {
          id
        }
      }
    `;
    
    try {
      await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            projectId,
            serviceId,
            key,
            value
          }
        })
      });
      
    } catch (error) {
      console.error(`❌ Failed to set ${key}:`, error.message);
    }
  }
  
  /**
   * Connect GitHub repo
   */
  async connectRepo(projectId, serviceId, repoUrl) {
    console.log(`🔗 Connecting repo: ${repoUrl}`);
    
    // Extract owner and repo from URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error('Invalid GitHub URL');
    }
    
    const [, owner, repo] = match;
    
    const mutation = `
      mutation ConnectRepo($serviceId: String!, $repo: String!, $branch: String) {
        serviceConnect(input: {
          serviceId: $serviceId
          repo: $repo
          branch: $branch
        }) {
          id
        }
      }
    `;
    
    try {
      await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            serviceId,
            repo: `${owner}/${repo}`,
            branch: 'main'
          }
        })
      });
      
      console.log('✅ Repo connected');
      
    } catch (error) {
      console.error('❌ Failed to connect repo:', error.message);
    }
  }
  
  /**
   * Trigger deployment
   */
  async triggerDeploy(serviceId) {
    console.log('🚀 Triggering deployment...');
    
    const mutation = `
      mutation TriggerDeploy($serviceId: String!) {
        serviceDeploy(serviceId: $serviceId) {
          id
        }
      }
    `;
    
    try {
      await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: mutation,
          variables: { serviceId }
        })
      });
      
      console.log('✅ Deployment triggered');
      
    } catch (error) {
      console.error('❌ Failed to trigger deploy:', error.message);
    }
  }
  
  /**
   * Get stats
   */
  getStats() {
    return this.stats;
  }
}

module.exports = RailwayProjectCreator;
