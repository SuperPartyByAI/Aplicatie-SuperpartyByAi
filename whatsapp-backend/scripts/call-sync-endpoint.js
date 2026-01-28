#!/usr/bin/env node
/**
 * Call sync-contacts-to-threads endpoint
 * 
 * Usage:
 *   node scripts/call-sync-endpoint.js <backendUrl> <adminToken> <accountId> [--dry-run]
 * 
 * Example:
 *   node scripts/call-sync-endpoint.js https://whats-app-ompro.ro 8df59afe1ca9387674e2b72c42460e3a3d2dea96833af6d3d9b840ff48ddfea3 account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443
 */

const https = require('https');
const http = require('http');

const args = process.argv.slice(2);
const backendUrl = args[0];
const adminToken = args[1];
const accountId = args[2];
const dryRun = args.includes('--dry-run');

if (!backendUrl || !adminToken || !accountId) {
  console.error('Usage: node scripts/call-sync-endpoint.js <backendUrl> <adminToken> <accountId> [--dry-run]');
  process.exit(1);
}

const url = new URL(backendUrl);
const isHttps = url.protocol === 'https:';
const client = isHttps ? https : http;

const postData = JSON.stringify({
  accountId,
  dryRun,
});

const options = {
  hostname: url.hostname,
  port: url.port || (isHttps ? 443 : 80),
  path: '/admin/sync-contacts-to-threads',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

console.log(`🔄 Calling sync endpoint: ${backendUrl}/admin/sync-contacts-to-threads`);
console.log(`   Account: ${accountId}`);
console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE UPDATE'}\n`);

const req = client.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const result = JSON.parse(data);
        console.log('✅ Sync completed successfully!\n');
        console.log(`📊 Results:`);
        console.log(`   Processed: ${result.processed}`);
        console.log(`   Updated displayName: ${result.updatedDisplayName}`);
        console.log(`   Updated photo: ${result.updatedPhoto}`);
        console.log(`   Skipped: ${result.skipped}`);
        console.log(`   Errors: ${result.errors}`);
        console.log(`   Mode: ${result.dryRun ? 'DRY RUN (no changes made)' : 'LIVE UPDATE'}\n`);
        
        if (result.sampleResults && result.sampleResults.length > 0) {
          console.log(`📋 Sample results (first ${Math.min(10, result.sampleResults.length)}):`);
          result.sampleResults.slice(0, 10).forEach((r, i) => {
            console.log(`   ${i + 1}. ${r.clientJid}: "${r.oldName}" -> "${r.newName}" ${r.hasPhoto ? '(has photo)' : ''}`);
          });
        }
      } catch (e) {
        console.log('✅ Response:', data);
      }
    } else {
      console.error(`❌ Error: ${res.statusCode}`);
      console.error('Response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error(`❌ Request failed:`, error.message);
  process.exit(1);
});

req.write(postData);
req.end();
