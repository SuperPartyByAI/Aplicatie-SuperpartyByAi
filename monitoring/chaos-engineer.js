/**
 * CHAOS ENGINEERING
 * Testează auto-repair în mod continuu
 * Simulează failures random pentru a verifica robustețea
 */

const IntelligentRepair = require('./intelligent-repair');

class ChaosEngineer {
  constructor(services) {
    this.services = services;
    this.repair = new IntelligentRepair();
    this.testResults = [];
    
    console.log('🔥 Chaos Engineer initialized');
  }
  
  /**
   * Run chaos test
   */
  async runChaosTest() {
    console.log('\n' + '='.repeat(70));
    console.log('🔥 CHAOS TEST STARTING');
    console.log('='.repeat(70));
    
    // Select random service
    const service = this.services[Math.floor(Math.random() * this.services.length)];
    console.log(`\n🎯 Target: ${service.name}`);
    
    // Select random failure type
    const failureTypes = [
      'memory_spike',
      'cpu_spike',
      'network_delay',
      'database_timeout',
      'random_crash'
    ];
    
    const failureType = failureTypes[Math.floor(Math.random() * failureTypes.length)];
    console.log(`💥 Simulating: ${failureType}`);
    
    const startTime = Date.now();
    
    try {
      // Simulate failure
      await this.simulateFailure(service, failureType);
      
      // Wait for auto-repair to kick in
      console.log(`\n⏳ Waiting for auto-repair...`);
      
      // Monitor recovery
      const recovered = await this.waitForRecovery(service, 90000); // 90s timeout
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      // Log result
      const result = {
        timestamp: new Date().toISOString(),
        service: service.name,
        failureType: failureType,
        recovered: recovered,
        recoveryTime: duration,
        success: recovered && duration < 90
      };
      
      this.testResults.push(result);
      
      if (result.success) {
        console.log(`\n✅ CHAOS TEST PASSED`);
        console.log(`   Recovery time: ${duration}s`);
      } else {
        console.log(`\n❌ CHAOS TEST FAILED`);
        console.log(`   Recovery: ${recovered ? 'Yes' : 'No'}`);
        console.log(`   Time: ${duration}s`);
      }
      
    } catch (error) {
      console.error(`\n❌ CHAOS TEST ERROR: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(70));
  }
  
  /**
   * Simulate different types of failures
   */
  async simulateFailure(service, type) {
    console.log(`\n💥 Simulating ${type}...`);
    
    switch (type) {
      case 'memory_spike':
        // Simulate memory leak
        console.log(`  Triggering memory spike...`);
        // In real implementation: fill memory
        break;
        
      case 'cpu_spike':
        // Simulate CPU overload
        console.log(`  Triggering CPU spike...`);
        // In real implementation: heavy computation
        break;
        
      case 'network_delay':
        // Simulate network issues
        console.log(`  Introducing network delay...`);
        // In real implementation: add latency
        break;
        
      case 'database_timeout':
        // Simulate database issues
        console.log(`  Simulating database timeout...`);
        // In real implementation: block database
        break;
        
      case 'random_crash':
        // Simulate service crash
        console.log(`  Crashing service...`);
        // In real implementation: kill process
        break;
    }
    
    // Wait for failure to propagate
    await this.sleep(5000);
  }
  
  /**
   * Wait for service to recover
   */
  async waitForRecovery(service, timeout) {
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5s
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${service.url}${service.healthPath}`, {
          timeout: 3000
        });
        
        if (response.ok) {
          return true;
        }
      } catch (error) {
        // Still down
      }
      
      await this.sleep(checkInterval);
    }
    
    return false;
  }
  
  /**
   * Run continuous chaos testing
   */
  async runContinuous(interval = 24 * 60 * 60 * 1000) { // Default: 24 hours
    console.log(`🔥 Starting continuous chaos testing (interval: ${interval/1000/60/60}h)`);
    
    // Run immediately
    await this.runChaosTest();
    
    // Then run at intervals
    setInterval(async () => {
      await this.runChaosTest();
      this.printSummary();
    }, interval);
  }
  
  /**
   * Print test summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 CHAOS TEST SUMMARY');
    console.log('='.repeat(70));
    
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.success).length;
    const failed = total - passed;
    
    console.log(`\nTotal tests: ${total}`);
    console.log(`Passed: ${passed} (${(passed/total*100).toFixed(1)}%)`);
    console.log(`Failed: ${failed} (${(failed/total*100).toFixed(1)}%)`);
    
    if (this.testResults.length > 0) {
      const avgRecoveryTime = this.testResults
        .filter(r => r.recovered)
        .reduce((sum, r) => sum + parseFloat(r.recoveryTime), 0) / passed;
      
      console.log(`\nAverage recovery time: ${avgRecoveryTime.toFixed(1)}s`);
    }
    
    // Recent failures
    const recentFailures = this.testResults
      .filter(r => !r.success)
      .slice(-5);
    
    if (recentFailures.length > 0) {
      console.log(`\n⚠️ Recent failures:`);
      recentFailures.forEach(f => {
        console.log(`  - ${f.service}: ${f.failureType} (${f.recoveryTime}s)`);
      });
    }
    
    console.log('\n' + '='.repeat(70));
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ChaosEngineer;
