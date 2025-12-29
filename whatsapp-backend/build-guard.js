const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const matches = content.match(/const ADMIN_TOKEN/g);
if (matches && matches.length > 1) {
  console.error('❌ BUILD GUARD FAILED: Duplicate ADMIN_TOKEN declaration');
  process.exit(1);
}
console.log('✅ BUILD GUARD PASSED');
