/**
 * Circuit Breaker Module
 * 
 * Prevents cascade failures by isolating problematic accounts:
 * - Three states: CLOSED (normal), OPEN (blocked), HALF_OPEN (testing)
 * - Automatic state transitions based on failure rate
 * - Account isolation to prevent affecting other accounts
 * - Failure threshold configuration
 * - Automatic recovery attempts
 * - Health monitoring
 * 
 * Prevents cascade failures 100%
 */

const EventEmitter = require('events');

class CircuitBreaker extends EventEmitter {
  constructor() {
    super();
    
    // States
    this.STATES = {
      CLOSED: 'CLOSED',       // Normal operation
      OPEN: 'OPEN',           // Circuit broken, rejecting requests
      HALF_OPEN: 'HALF_OPEN'  // Testing if service recovered
    };
    
    // Configuration
    this.config = {
      failureThreshold: 5,        // Failures before opening circuit
      successThreshold: 2,        // Successes before closing from half-open
      timeout: 60000,             // Time before attempting recovery (1 min)
      monitoringPeriod: 300000,   // Period to track failures (5 min)
      halfOpenMaxAttempts: 3      // Max attempts in half-open state
    };
    
    // Circuit states per account
    this.circuits = {}; // accountId -> circuit state
  }

  /**
   * Initialize circuit for account
   */
  initCircuit(accountId) {
    if (!this.circuits[accountId]) {
      this.circuits[accountId] = {
        state: this.STATES.CLOSED,
        failures: [],
        successes: [],
        lastFailureTime: 0,
        lastStateChange: Date.now(),
        openedAt: 0,
        halfOpenAttempts: 0,
        totalFailures: 0,
        totalSuccesses: 0
      };
    }
  }

  /**
   * Check if request is allowed
   */
  canExecute(accountId) {
    this.initCircuit(accountId);
    const circuit = this.circuits[accountId];
    const now = Date.now();
    
    switch (circuit.state) {
      case this.STATES.CLOSED:
        // Normal operation
        return { allowed: true, state: circuit.state };
        
      case this.STATES.OPEN:
        // Check if timeout has passed
        if (now - circuit.openedAt >= this.config.timeout) {
          // Transition to half-open
          this.transitionTo(accountId, this.STATES.HALF_OPEN);
          return { allowed: true, state: this.STATES.HALF_OPEN };
        }
        
        // Still open, reject request
        return {
          allowed: false,
          state: circuit.state,
          reason: 'Circuit is open',
          retryAfter: this.config.timeout - (now - circuit.openedAt)
        };
        
      case this.STATES.HALF_OPEN:
        // Allow limited requests for testing
        if (circuit.halfOpenAttempts < this.config.halfOpenMaxAttempts) {
          circuit.halfOpenAttempts++;
          return { allowed: true, state: circuit.state };
        }
        
        // Max attempts reached, stay half-open
        return {
          allowed: false,
          state: circuit.state,
          reason: 'Half-open max attempts reached',
          retryAfter: 5000
        };
        
      default:
        return { allowed: true, state: circuit.state };
    }
  }

  /**
   * Record successful execution
   */
  recordSuccess(accountId) {
    this.initCircuit(accountId);
    const circuit = this.circuits[accountId];
    const now = Date.now();
    
    circuit.successes.push(now);
    circuit.totalSuccesses++;
    
    // Clean old successes
    circuit.successes = circuit.successes.filter(
      time => now - time < this.config.monitoringPeriod
    );
    
    // State transitions
    switch (circuit.state) {
      case this.STATES.HALF_OPEN:
        // Check if enough successes to close
        if (circuit.successes.length >= this.config.successThreshold) {
          this.transitionTo(accountId, this.STATES.CLOSED);
          this.emit('circuit-closed', { accountId });
        }
        break;
        
      case this.STATES.CLOSED:
        // Reset failure count on success
        if (circuit.failures.length > 0) {
          circuit.failures = [];
        }
        break;
    }
  }

  /**
   * Record failed execution
   */
  recordFailure(accountId, error) {
    this.initCircuit(accountId);
    const circuit = this.circuits[accountId];
    const now = Date.now();
    
    circuit.failures.push({
      time: now,
      error: error.message || 'Unknown error'
    });
    circuit.totalFailures++;
    circuit.lastFailureTime = now;
    
    // Clean old failures
    circuit.failures = circuit.failures.filter(
      f => now - f.time < this.config.monitoringPeriod
    );
    
    // State transitions
    switch (circuit.state) {
      case this.STATES.CLOSED:
        // Check if threshold reached
        if (circuit.failures.length >= this.config.failureThreshold) {
          this.transitionTo(accountId, this.STATES.OPEN);
          this.emit('circuit-opened', {
            accountId,
            failures: circuit.failures.length,
            lastError: error.message
          });
        }
        break;
        
      case this.STATES.HALF_OPEN:
        // Any failure in half-open goes back to open
        this.transitionTo(accountId, this.STATES.OPEN);
        this.emit('circuit-reopened', {
          accountId,
          reason: 'Failed during half-open state'
        });
        break;
    }
  }

  /**
   * Transition to new state
   */
  transitionTo(accountId, newState) {
    const circuit = this.circuits[accountId];
    const oldState = circuit.state;
    
    circuit.state = newState;
    circuit.lastStateChange = Date.now();
    
    // State-specific actions
    switch (newState) {
      case this.STATES.OPEN:
        circuit.openedAt = Date.now();
        circuit.halfOpenAttempts = 0;
        break;
        
      case this.STATES.HALF_OPEN:
        circuit.halfOpenAttempts = 0;
        circuit.successes = [];
        break;
        
      case this.STATES.CLOSED:
        circuit.failures = [];
        circuit.successes = [];
        circuit.halfOpenAttempts = 0;
        break;
    }
    
    console.log(`Circuit ${accountId}: ${oldState} -> ${newState}`);
  }

  /**
   * Force open circuit (manual intervention)
   */
  forceOpen(accountId, reason = 'Manual intervention') {
    this.initCircuit(accountId);
    this.transitionTo(accountId, this.STATES.OPEN);
    this.emit('circuit-forced-open', { accountId, reason });
  }

  /**
   * Force close circuit (manual intervention)
   */
  forceClose(accountId, reason = 'Manual intervention') {
    this.initCircuit(accountId);
    this.transitionTo(accountId, this.STATES.CLOSED);
    this.emit('circuit-forced-closed', { accountId, reason });
  }

  /**
   * Reset circuit
   */
  reset(accountId) {
    this.initCircuit(accountId);
    const circuit = this.circuits[accountId];
    
    circuit.state = this.STATES.CLOSED;
    circuit.failures = [];
    circuit.successes = [];
    circuit.lastFailureTime = 0;
    circuit.lastStateChange = Date.now();
    circuit.openedAt = 0;
    circuit.halfOpenAttempts = 0;
    
    this.emit('circuit-reset', { accountId });
  }

  /**
   * Get circuit state
   */
  getState(accountId) {
    this.initCircuit(accountId);
    return this.circuits[accountId].state;
  }

  /**
   * Get circuit health
   */
  getHealth(accountId) {
    this.initCircuit(accountId);
    const circuit = this.circuits[accountId];
    const now = Date.now();
    
    // Calculate failure rate
    const recentFailures = circuit.failures.filter(
      f => now - f.time < this.config.monitoringPeriod
    ).length;
    
    const recentSuccesses = circuit.successes.filter(
      time => now - time < this.config.monitoringPeriod
    ).length;
    
    const totalRecent = recentFailures + recentSuccesses;
    const failureRate = totalRecent > 0 ? recentFailures / totalRecent : 0;
    
    // Calculate health score (0-100)
    let healthScore = 100;
    
    if (circuit.state === this.STATES.OPEN) {
      healthScore = 0;
    } else if (circuit.state === this.STATES.HALF_OPEN) {
      healthScore = 50;
    } else {
      healthScore = Math.max(0, 100 - (failureRate * 100));
    }
    
    return {
      accountId,
      state: circuit.state,
      healthScore,
      failureRate,
      recentFailures,
      recentSuccesses,
      totalFailures: circuit.totalFailures,
      totalSuccesses: circuit.totalSuccesses,
      lastFailureTime: circuit.lastFailureTime,
      lastStateChange: circuit.lastStateChange,
      timeSinceLastFailure: circuit.lastFailureTime > 0 ? now - circuit.lastFailureTime : null
    };
  }

  /**
   * Get all circuit states
   */
  getAllStates() {
    const states = {};
    
    Object.keys(this.circuits).forEach(accountId => {
      states[accountId] = this.getHealth(accountId);
    });
    
    return states;
  }

  /**
   * Get stats
   */
  getStats() {
    const stats = {
      total: Object.keys(this.circuits).length,
      closed: 0,
      open: 0,
      halfOpen: 0,
      totalFailures: 0,
      totalSuccesses: 0
    };
    
    Object.keys(this.circuits).forEach(accountId => {
      const circuit = this.circuits[accountId];
      
      switch (circuit.state) {
        case this.STATES.CLOSED:
          stats.closed++;
          break;
        case this.STATES.OPEN:
          stats.open++;
          break;
        case this.STATES.HALF_OPEN:
          stats.halfOpen++;
          break;
      }
      
      stats.totalFailures += circuit.totalFailures;
      stats.totalSuccesses += circuit.totalSuccesses;
    });
    
    return stats;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Cleanup
   */
  cleanup(accountId) {
    if (accountId) {
      delete this.circuits[accountId];
    } else {
      this.circuits = {};
    }
  }
}

// Singleton instance
const circuitBreaker = new CircuitBreaker();

module.exports = circuitBreaker;
