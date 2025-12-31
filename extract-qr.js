const fs = require('fs');

console.log('🔍 Extracting QR code from accounts-railway.json...\n');

try {
  const data = JSON.parse(fs.readFileSync('accounts-railway.json', 'utf8'));
  const accounts = data.accounts || [];
  
  if (accounts.length === 0) {
    console.log('❌ No accounts found. Create one first with:');
    console.log('   curl -X POST https://aplicatie-superpartybyai-production-d067.up.railway.app/api/whatsapp/add-account \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -H "Authorization: Bearer dev-token-local" \\');
    console.log('     -d "{\\"phone\\":\\"+40737571397\\"}"');
    process.exit(1);
  }
  
  const account = accounts[0];
  
  if (!account.qrCode) {
    console.log(`⏳ QR not ready yet for account: ${account.id}`);
    console.log(`   Status: ${account.status}`);
    console.log('\n   Wait 3-5 seconds and run GET-QR-RAILWAY.bat again');
    process.exit(1);
  }
  
  console.log(`✅ Found QR for account: ${account.id}`);
  console.log(`   Phone: ${account.phone || 'N/A'}`);
  console.log(`   Status: ${account.status}`);
  console.log(`   Name: ${account.name || 'N/A'}\n`);
  
  // Extract base64 and save as PNG
  const base64Data = account.qrCode.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync('qr-code.png', Buffer.from(base64Data, 'base64'));
  
  console.log('💾 QR code saved to: qr-code.png');
  console.log('\n📱 To scan:');
  console.log('   1. Open qr-code.png (double-click)');
  console.log('   2. Open WhatsApp on phone');
  console.log('   3. Go to Settings → Linked Devices → Link a Device');
  console.log('   4. Scan the QR code\n');
  
  console.log('🔗 Or paste this in browser:');
  console.log(account.qrCode.substring(0, 100) + '...\n');
  
} catch (error) {
  console.log('❌ Error:', error.message);
  console.log('\n   Make sure accounts-railway.json exists.');
  console.log('   Run GET-QR-RAILWAY.bat first!');
  process.exit(1);
}
