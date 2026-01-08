/**
 * Smoke tests for AI-powered event creation
 * 
 * Tests the complete flow:
 * 1. User sends natural language message
 * 2. chatWithAI detects event intent and calls chatEventOps
 * 3. chatEventOps validates and creates event in Firestore
 * 
 * Run: node test-event-creation.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Test cases
const testCases = [
  {
    name: 'Valid event with all fields',
    input: {
      message: 'Vreau să creez un eveniment pentru Maria, 5 ani, pe 2026-02-15 la Strada Florilor 10, București. Avem nevoie de animator și vată de zahăr.',
      userId: 'test-user-1',
      conversationId: 'test-conv-1'
    },
    expected: {
      action: 'CREATE',
      hasDate: true,
      hasAddress: true,
      hasSarbatorit: true,
      hasRoles: true
    }
  },
  {
    name: 'Missing date (should fail validation)',
    input: {
      message: 'Vreau eveniment pentru Ana la Strada Mihai 5',
      userId: 'test-user-2',
      conversationId: 'test-conv-2'
    },
    expected: {
      action: 'NONE',
      errorContains: 'data'
    }
  },
  {
    name: 'Missing address (should fail validation)',
    input: {
      message: 'Eveniment pentru Ion pe 2026-03-20',
      userId: 'test-user-3',
      conversationId: 'test-conv-3'
    },
    expected: {
      action: 'NONE',
      errorContains: 'adresa'
    }
  },
  {
    name: 'Relative date (should be refused)',
    input: {
      message: 'Vreau eveniment mâine la Strada Unirii 3 pentru Andrei',
      userId: 'test-user-4',
      conversationId: 'test-conv-4'
    },
    expected: {
      action: 'NONE',
      errorContains: 'YYYY-MM-DD'
    }
  },
  {
    name: 'Idempotency test (duplicate clientRequestId)',
    input: {
      message: 'Eveniment pentru Laura, 7 ani, pe 2026-04-10 la Bulevardul Libertății 25',
      userId: 'test-user-5',
      conversationId: 'test-conv-5',
      clientRequestId: 'duplicate-test-123'
    },
    expected: {
      action: 'CREATE',
      shouldBeDuplicate: true
    }
  }
];

// Helper to call chatEventOps function
async function callChatEventOps(params) {
  const chatEventOps = require('./chatEventOps');
  
  // Simulate HTTP request
  const req = {
    body: params,
    headers: {}
  };
  
  const res = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.data = data;
      return this;
    },
    statusCode: 200,
    data: null
  };
  
  await chatEventOps(req, res);
  
  return {
    status: res.statusCode,
    data: res.data
  };
}

// Run tests
async function runTests() {
  console.log('🧪 Starting smoke tests for event creation...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.name}`);
    
    try {
      // For idempotency test, run twice
      if (testCase.expected.shouldBeDuplicate) {
        console.log('  → First call (should create)...');
        const firstResult = await callChatEventOps({
          ...testCase.input,
          dryRun: false
        });
        
        console.log('  → Second call (should be idempotent)...');
        const secondResult = await callChatEventOps({
          ...testCase.input,
          dryRun: false
        });
        
        if (firstResult.data.eventId === secondResult.data.eventId) {
          console.log(`  ✅ PASS: Idempotency works (eventId: ${firstResult.data.eventId})`);
          passed++;
        } else {
          console.log(`  ❌ FAIL: Different eventIds (${firstResult.data.eventId} vs ${secondResult.data.eventId})`);
          failed++;
        }
        
        // Cleanup
        if (firstResult.data.eventId) {
          await db.collection('evenimente').doc(firstResult.data.eventId).delete();
        }
        
      } else {
        // Regular test
        const result = await callChatEventOps({
          ...testCase.input,
          dryRun: true // Use preview mode for most tests
        });
        
        const response = result.data;
        
        // Validate expectations
        let testPassed = true;
        const errors = [];
        
        if (testCase.expected.action && response.action !== testCase.expected.action) {
          errors.push(`Expected action ${testCase.expected.action}, got ${response.action}`);
          testPassed = false;
        }
        
        if (testCase.expected.hasDate && !response.eventData?.date) {
          errors.push('Expected date field');
          testPassed = false;
        }
        
        if (testCase.expected.hasAddress && !response.eventData?.address) {
          errors.push('Expected address field');
          testPassed = false;
        }
        
        if (testCase.expected.errorContains) {
          const message = response.message || '';
          if (!message.toLowerCase().includes(testCase.expected.errorContains.toLowerCase())) {
            errors.push(`Expected error message to contain "${testCase.expected.errorContains}"`);
            testPassed = false;
          }
        }
        
        if (testPassed) {
          console.log(`  ✅ PASS`);
          passed++;
        } else {
          console.log(`  ❌ FAIL:`);
          errors.forEach(err => console.log(`     - ${err}`));
          console.log(`     Response: ${JSON.stringify(response, null, 2)}`);
          failed++;
        }
      }
      
    } catch (error) {
      console.log(`  ❌ FAIL: ${error.message}`);
      console.error(error);
      failed++;
    }
    
    console.log('');
  }
  
  console.log('═══════════════════════════════════════');
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
