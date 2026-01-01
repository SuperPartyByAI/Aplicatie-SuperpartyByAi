/**
 * Railway API Integration
 * Handles restart, redeploy, and rollback operations
 */

const fetch = require('node-fetch');

class RailwayAPI {
  constructor(token) {
    this.token = token;
    this.apiUrl = 'https://backboard.railway.app/graphql';

    if (!this.token) {
      console.warn('⚠️ Railway token not provided - auto-repair will be simulated');
    }
  }

  /**
   * Execute GraphQL query
   */
  async query(query, variables = {}) {
    if (!this.token) {
      throw new Error('Railway token not configured');
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Railway API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }

  /**
   * Get service by ID or name
   */
  async getService(serviceId) {
    const query = `
      query service($id: String!) {
        service(id: $id) {
          id
          name
          deployments(first: 10) {
            edges {
              node {
                id
                status
                createdAt
              }
            }
          }
        }
      }
    `;

    const data = await this.query(query, { id: serviceId });
    return data.service;
  }

  /**
   * Restart service (soft restart)
   */
  async restartService(serviceId) {
    console.log(`🔄 [Railway] Restarting service ${serviceId}...`);

    const mutation = `
      mutation serviceInstanceRestart($serviceId: String!) {
        serviceInstanceRestart(serviceId: $serviceId)
      }
    `;

    try {
      await this.query(mutation, { serviceId });
      console.log(`✅ [Railway] Restart command sent`);
      return true;
    } catch (error) {
      console.error(`❌ [Railway] Restart failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Redeploy service (full redeploy from source)
   */
  async redeployService(serviceId) {
    console.log(`🚀 [Railway] Redeploying service ${serviceId}...`);

    const mutation = `
      mutation serviceRedeploy($serviceId: String!) {
        serviceRedeploy(serviceId: $serviceId) {
          id
          status
        }
      }
    `;

    try {
      const data = await this.query(mutation, { serviceId });
      console.log(`✅ [Railway] Redeploy initiated: ${data.serviceRedeploy.id}`);
      return true;
    } catch (error) {
      console.error(`❌ [Railway] Redeploy failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Rollback to previous deployment
   */
  async rollbackService(serviceId) {
    console.log(`⏮️ [Railway] Rolling back service ${serviceId}...`);

    try {
      // Get service deployments
      const service = await this.getService(serviceId);
      const deployments = service.deployments.edges.map(e => e.node);

      // Find last successful deployment
      const lastSuccess = deployments.find(d => d.status === 'SUCCESS');

      if (!lastSuccess) {
        throw new Error('No successful deployment found to rollback to');
      }

      console.log(`  Rolling back to deployment: ${lastSuccess.id}`);

      // Trigger rollback by redeploying that specific deployment
      const mutation = `
        mutation deploymentRollback($deploymentId: String!) {
          deploymentRollback(deploymentId: $deploymentId) {
            id
            status
          }
        }
      `;

      await this.query(mutation, { deploymentId: lastSuccess.id });
      console.log(`✅ [Railway] Rollback initiated`);
      return true;
    } catch (error) {
      console.error(`❌ [Railway] Rollback failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId) {
    const query = `
      query deployment($id: String!) {
        deployment(id: $id) {
          id
          status
          createdAt
        }
      }
    `;

    const data = await this.query(query, { id: deploymentId });
    return data.deployment;
  }

  /**
   * Wait for deployment to complete
   */
  async waitForDeployment(deploymentId, timeout = 120000) {
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5s

    while (Date.now() - startTime < timeout) {
      try {
        const deployment = await this.getDeploymentStatus(deploymentId);

        if (deployment.status === 'SUCCESS') {
          return true;
        }

        if (deployment.status === 'FAILED' || deployment.status === 'CRASHED') {
          return false;
        }

        // Still deploying, wait and check again
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        console.error(`Error checking deployment status: ${error.message}`);
      }
    }

    // Timeout
    return false;
  }
}

module.exports = RailwayAPI;
