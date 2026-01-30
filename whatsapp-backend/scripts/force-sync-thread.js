#!/usr/bin/env node
/**
 * Force History Sync for a specific Thread via Admin API
 *
 * Usage:
 *   node scripts/force-sync-thread.js --accountId=... --threadId=... [--count=50]
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const API_BASE_URL = process.env.WHATSAPP_BACKEND_URL || 'http://localhost:8080';

const args = process.argv.slice(2);
const getArg = name => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
};

const accountId = getArg('accountId');
const threadId = getArg('threadId');
const count = getArg('count') || '50';

if (!accountId || !threadId) {
  console.log(
    '❌ Usage: node scripts/force-sync-thread.js --accountId=... --threadId=... [--count=50]'
  );
  console.log(
    '   Example: node scripts/force-sync-thread.js --accountId=acc_1 --threadId=acc_1__40712345678@s.whatsapp.net'
  );
  process.exit(1);
}

if (!ADMIN_TOKEN) {
  console.error('❌ Error: ADMIN_TOKEN not found in .env');
  process.exit(1);
}

async function forceSync() {
  console.log(`\n🔄 Requesting force sync for thread: ${threadId} (Account: ${accountId})`);

  const url = `${API_BASE_URL}/api/admin/sync-thread/${accountId}/${threadId}?count=${count}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-admin-token': ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log('✅ Success!');
      console.log(`   Messages written: ${result.messagesWritten}`);
      console.log(`   Duration:         ${result.durationMs}ms`);
      if (result.errors && result.errors.length > 0) {
        console.warn(`   Errors:           ${JSON.stringify(result.errors)}`);
      }
    } else {
      console.error(`❌ Failed: ${response.status} ${response.statusText}`);
      console.error(`   Error: ${result.error || result.errors || JSON.stringify(result)}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Network/Request error: ${error.message}`);
    process.exit(1);
  }
}

console.log(`🚀 API Base: ${API_BASE_URL}`);

forceSync().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
