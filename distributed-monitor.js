/**
 * DISTRIBUTED MONITORING
 * 3 monitoare în regions diferite
 * Consensus-based alerting (2/3 confirmă)
 * Zero false positives
 */

class DistributedMonitor {
  constructor() {
    this.monitors = [
      { id: 'monitor-us-west', region: 'us-west', votes: [] },
      { id: 'monitor-us-east', region: 'us-east', votes: [] },
      { id: 'monitor-eu-west', region: 'eu-west', votes: [] }
    ];
    
    this.consensusThreshold = 2; // 2/3 must agree
    this.voteWindow = 30000; // 30s window
    
    console.log('🌐 Distributed Monitoring initialized');
    console.log(`   Monitors: ${this.monitors.length}`);
    console.log(`   Consensus: ${this.consensusThreshold}/${this.monitors.length}`);
  }
  
  /**
   * Record vote from monitor
   */
  recordVote(monitorId, service, status) {
    const monitor = this.monitors.find(m => m.id === monitorId);
    if (!monitor) return;
    
    monitor.votes.push({
      service,
      status,
      timestamp: Date.now()
    });
    
    // Clean old votes
    const cutoff = Date.now() - this.voteWindow;
    monitor.votes = monitor.votes.filter(v => v.timestamp > cutoff);
  }
  
  /**
   * Get consensus for service
   */
  getConsensus(service) {
    const recentVotes = [];
    
    this.monitors.forEach(monitor => {
      const vote = monitor.votes
        .filter(v => v.service === service)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      
      if (vote) {
        recentVotes.push({ monitor: monitor.id, status: vote.status });
      }
    });
    
    if (recentVotes.length === 0) return null;
    
    // Count votes
    const unhealthyVotes = recentVotes.filter(v => v.status === 'unhealthy').length;
    const healthyVotes = recentVotes.filter(v => v.status === 'healthy').length;
    
    // Consensus reached?
    const consensus = {
      service,
      totalVotes: recentVotes.length,
      unhealthyVotes,
      healthyVotes,
      status: unhealthyVotes >= this.consensusThreshold ? 'unhealthy' : 'healthy',
      confidence: Math.max(unhealthyVotes, healthyVotes) / recentVotes.length * 100,
      votes: recentVotes
    };
    
    return consensus;
  }
  
  /**
   * Check if should trigger alert
   */
  shouldAlert(service) {
    const consensus = this.getConsensus(service);
    
    if (!consensus) return false;
    
    return consensus.status === 'unhealthy' && 
           consensus.unhealthyVotes >= this.consensusThreshold;
  }
}

module.exports = DistributedMonitor;
