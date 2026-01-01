/**
 * SELF-EVOLUTION SYSTEM
 * Learns from patterns and evolves autonomously
 */

class SelfEvolution {
  constructor() {
    this.knowledge = {
      patterns: [],
      solutions: [],
      failures: [],
      successes: [],
    };

    this.learningRate = 0.1;
    this.evolutionThreshold = 0.8;

    console.log('🧬 Self-Evolution System initialized');
  }

  /**
   * Learn from decisions
   */
  async learnFromDecisions(decisions) {
    for (const decision of decisions) {
      if (decision.success) {
        this.learnSuccess(decision);
      } else {
        this.learnFailure(decision);
      }
    }

    // Evolve patterns
    await this.evolvePatterns();
  }

  /**
   * Learn from successful decision
   */
  learnSuccess(decision) {
    this.knowledge.successes.push({
      type: decision.type,
      action: decision.action,
      params: decision.params,
      confidence: decision.confidence,
      timestamp: decision.executedAt,
    });

    // Update pattern confidence
    const pattern = this.findPattern(decision);
    if (pattern) {
      pattern.confidence += this.learningRate;
      pattern.successCount++;
    } else {
      this.knowledge.patterns.push({
        type: decision.type,
        action: decision.action,
        confidence: decision.confidence,
        successCount: 1,
        failureCount: 0,
        created: new Date().toISOString(),
      });
    }
  }

  /**
   * Learn from failed decision
   */
  learnFailure(decision) {
    this.knowledge.failures.push({
      type: decision.type,
      action: decision.action,
      params: decision.params,
      error: decision.error,
      timestamp: decision.executedAt,
    });

    // Update pattern confidence
    const pattern = this.findPattern(decision);
    if (pattern) {
      pattern.confidence -= this.learningRate * 2;
      pattern.failureCount++;

      // Remove pattern if too many failures
      if (pattern.confidence < 0.3) {
        this.knowledge.patterns = this.knowledge.patterns.filter(p => p !== pattern);
        console.log(`🗑️ Removed low-confidence pattern: ${pattern.action}`);
      }
    }
  }

  /**
   * Find existing pattern
   */
  findPattern(decision) {
    return this.knowledge.patterns.find(
      p => p.type === decision.type && p.action === decision.action
    );
  }

  /**
   * Evolve patterns based on learning
   */
  async evolvePatterns() {
    // Find high-confidence patterns
    const evolved = this.knowledge.patterns.filter(
      p => p.confidence > this.evolutionThreshold && p.successCount > 5
    );

    if (evolved.length > 0) {
      console.log(`\n🧬 Evolved ${evolved.length} patterns`);

      for (const pattern of evolved) {
        console.log(`   ${pattern.action}: ${(pattern.confidence * 100).toFixed(0)}% confidence`);
      }
    }
  }

  /**
   * Find improvements
   */
  async findImprovements() {
    const improvements = [];

    // Analyze failure patterns
    const failurePatterns = this.analyzeFailures();

    for (const pattern of failurePatterns) {
      if (pattern.frequency > 3) {
        improvements.push({
          type: 'prevent_failure',
          description: `Prevent ${pattern.type} failures`,
          confidence: 0.9,
          action: this.suggestPreventiveAction(pattern),
        });
      }
    }

    // Analyze success patterns
    const successPatterns = this.analyzeSuccesses();

    for (const pattern of successPatterns) {
      if (pattern.frequency > 5 && pattern.avgResponseTime < 100) {
        improvements.push({
          type: 'optimize',
          description: `Apply ${pattern.action} more proactively`,
          confidence: 0.85,
          action: {
            type: 'proactive',
            trigger: pattern.trigger,
            action: pattern.action,
          },
        });
      }
    }

    return improvements;
  }

  /**
   * Analyze failure patterns
   */
  analyzeFailures() {
    const patterns = {};

    for (const failure of this.knowledge.failures) {
      const key = `${failure.type}_${failure.action}`;

      if (!patterns[key]) {
        patterns[key] = {
          type: failure.type,
          action: failure.action,
          frequency: 0,
          errors: [],
        };
      }

      patterns[key].frequency++;
      patterns[key].errors.push(failure.error);
    }

    return Object.values(patterns);
  }

  /**
   * Analyze success patterns
   */
  analyzeSuccesses() {
    const patterns = {};

    for (const success of this.knowledge.successes) {
      const key = `${success.type}_${success.action}`;

      if (!patterns[key]) {
        patterns[key] = {
          type: success.type,
          action: success.action,
          frequency: 0,
          avgResponseTime: 0,
          trigger: success.params,
        };
      }

      patterns[key].frequency++;
    }

    return Object.values(patterns);
  }

  /**
   * Suggest preventive action
   */
  suggestPreventiveAction(pattern) {
    // Based on failure type, suggest prevention
    const preventions = {
      slow_response: {
        type: 'modify_code',
        action: 'add_caching',
        trigger: 'response_time > 500ms',
      },
      high_memory: {
        type: 'scale',
        action: 'scale_up',
        trigger: 'memory > 80%',
      },
      service_down: {
        type: 'create_project',
        action: 'create_backup_service',
        trigger: 'consecutive_failures > 2',
      },
    };

    return (
      preventions[pattern.type] || {
        type: 'monitor',
        action: 'increase_monitoring',
        trigger: 'pattern_detected',
      }
    );
  }

  /**
   * Apply improvement
   */
  async applyImprovement(improvement) {
    console.log(`🧬 Applying improvement: ${improvement.description}`);

    // Store as new solution
    this.knowledge.solutions.push({
      ...improvement,
      applied: new Date().toISOString(),
    });

    return {
      success: true,
      message: `Improvement applied: ${improvement.description}`,
    };
  }

  /**
   * Get evolution stats
   */
  getStats() {
    return {
      patterns: this.knowledge.patterns.length,
      successes: this.knowledge.successes.length,
      failures: this.knowledge.failures.length,
      solutions: this.knowledge.solutions.length,
      avgConfidence: this.calculateAvgConfidence(),
    };
  }

  /**
   * Calculate average confidence
   */
  calculateAvgConfidence() {
    if (this.knowledge.patterns.length === 0) return 0;

    const sum = this.knowledge.patterns.reduce((acc, p) => acc + p.confidence, 0);
    return ((sum / this.knowledge.patterns.length) * 100).toFixed(1) + '%';
  }
}

module.exports = SelfEvolution;
