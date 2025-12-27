// Load test script - simulates 100+ messages per minute
const io = require('socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const NUM_MESSAGES = parseInt(process.env.NUM_MESSAGES) || 150;
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS) || 400; // 150 messages in 60 seconds = 400ms interval

console.log(`🧪 Load Test Starting...`);
console.log(`📡 Backend: ${BACKEND_URL}`);
console.log(`📨 Messages: ${NUM_MESSAGES}`);
console.log(`⏱️  Interval: ${INTERVAL_MS}ms`);
console.log(`📊 Rate: ${Math.round(60000 / INTERVAL_MS)} messages/minute\n`);

const socket = io(BACKEND_URL);

let messagesReceived = 0;
let messagesSent = 0;
let errors = 0;
const startTime = Date.now();

socket.on('connect', () => {
  console.log('✅ Connected to backend\n');
  
  // Start sending messages
  const interval = setInterval(() => {
    if (messagesSent >= NUM_MESSAGES) {
      clearInterval(interval);
      
      // Wait 5 seconds for remaining messages
      setTimeout(() => {
        const duration = (Date.now() - startTime) / 1000;
        const rate = Math.round(messagesSent / duration * 60);
        
        console.log(`\n📊 Test Complete!`);
        console.log(`✅ Messages sent: ${messagesSent}`);
        console.log(`📥 Messages received: ${messagesReceived}`);
        console.log(`❌ Errors: ${errors}`);
        console.log(`⏱️  Duration: ${duration.toFixed(2)}s`);
        console.log(`📈 Rate: ${rate} messages/minute`);
        console.log(`✅ Success rate: ${((messagesReceived / messagesSent) * 100).toFixed(1)}%`);
        
        socket.disconnect();
        process.exit(messagesReceived >= NUM_MESSAGES * 0.95 ? 0 : 1);
      }, 5000);
      
      return;
    }
    
    messagesSent++;
    
    // Simulate message event
    socket.emit('test:message', {
      id: `test_${messagesSent}`,
      body: `Test message ${messagesSent}`,
      timestamp: Date.now()
    });
    
    if (messagesSent % 10 === 0) {
      process.stdout.write(`\r📤 Sent: ${messagesSent}/${NUM_MESSAGES} | 📥 Received: ${messagesReceived} | ❌ Errors: ${errors}`);
    }
  }, INTERVAL_MS);
});

socket.on('whatsapp:message', (data) => {
  messagesReceived++;
});

socket.on('error', (error) => {
  errors++;
  console.error(`\n❌ Socket error:`, error.message);
});

socket.on('disconnect', () => {
  console.log('\n🔌 Disconnected from backend');
});

// Timeout after 2 minutes
setTimeout(() => {
  console.log('\n⏱️  Test timeout - stopping');
  socket.disconnect();
  process.exit(1);
}, 120000);
