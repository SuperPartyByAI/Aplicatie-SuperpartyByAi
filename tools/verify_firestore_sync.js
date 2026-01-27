#!/usr/bin/env node
/* eslint-disable no-console */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function formatTimestamp(value) {
  if (!value) return 'unknown';
  if (value.toDate) return value.toDate().toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') return value;
  if (value._seconds) {
    return new Date(value._seconds * 1000).toISOString();
  }
  return 'unknown';
}

function toEpochMs(value) {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value._seconds) return value._seconds * 1000;
  return 0;
}

function pickMessageTimestamp(data) {
  return data.tsClient || data.tsServer || data.createdAt || data.updatedAt;
}

async function promptForThreadId(threads) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const choice = await new Promise((resolve) => {
    rl.question('Select a thread by number or enter threadId: ', resolve);
  });
  rl.close();

  const trimmed = String(choice).trim();
  const index = Number(trimmed);
  if (!Number.isNaN(index) && index >= 1 && index <= threads.length) {
    return threads[index - 1].id;
  }
  return trimmed || null;
}

async function main() {
  const args = parseArgs(process.argv);
  const serviceAccountPath = args.serviceAccount;
  const accountId = args.accountId;
  const limit = Number(args.limit || 5);
  let threadId = args.threadId || null;

  if (!serviceAccountPath || !accountId) {
    console.error('Usage: node tools/verify_firestore_sync.js --serviceAccount <path> --accountId <id> [--threadId <id>] [--limit 5]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Service account file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const serviceAccount = require(resolvedPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();

  if (!threadId) {
    const query = db.collection('threads')
      .where('accountId', '==', accountId)
      .orderBy('lastMessageAt', 'desc')
      .limit(10);

    const snapshot = await query.get();
    const threads = snapshot.docs.map((doc) => ({
      id: doc.id,
      clientJid: doc.get('clientJid'),
      displayName: doc.get('displayName'),
      lastMessageAt: doc.get('lastMessageAt'),
      lastMessagePreview: doc.get('lastMessagePreview') || doc.get('lastMessageText'),
    }));

    if (threads.length === 0) {
      console.log('No threads found for accountId:', accountId);
      process.exit(0);
    }

    console.log('Top threads (latest first):');
    threads.forEach((thread, index) => {
      console.log(
        `${index + 1}. ${thread.id} | ${thread.clientJid || 'n/a'} | ${thread.displayName || 'n/a'} | ` +
        `${formatTimestamp(thread.lastMessageAt)} | ${thread.lastMessagePreview || ''}`,
      );
    });

    threadId = await promptForThreadId(threads);
    if (!threadId) {
      console.error('No thread selected.');
      process.exit(1);
    }
  }

  const threadRef = db.collection('threads').doc(threadId);
  const threadSnap = await threadRef.get();
  if (!threadSnap.exists) {
    console.error('Thread not found:', threadId);
    process.exit(1);
  }

  const threadData = threadSnap.data();
  console.log('\nThread details:');
  console.log('threadId:', threadId);
  console.log('accountId:', threadData.accountId);
  console.log('clientJid:', threadData.clientJid);
  console.log('displayName:', threadData.displayName);
  console.log('lastMessageAt:', formatTimestamp(threadData.lastMessageAt));
  console.log('lastMessagePreview:', threadData.lastMessagePreview || threadData.lastMessageText || '');
  if (threadData.updatedAt) {
    console.log('updatedAt:', formatTimestamp(threadData.updatedAt));
  }

  const messagesRef = threadRef.collection('messages');
  let messagesSnap;
  let usedOrderField = 'tsClient';
  try {
    messagesSnap = await messagesRef.orderBy('tsClient', 'desc').limit(limit).get();
  } catch (err) {
    usedOrderField = 'tsServer';
    messagesSnap = await messagesRef.orderBy('tsServer', 'desc').limit(limit).get();
  }

  const messages = messagesSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      fromMe: data.fromMe,
      direction: data.direction,
      body: data.body || data.text || data.message || '',
      tsClient: data.tsClient,
      tsServer: data.tsServer,
      waMessageId: data.waMessageId || data.messageId,
      clientMessageId: data.clientMessageId,
      requestId: data.requestId,
    };
  });

  console.log(`\nLast ${messages.length} messages (orderBy ${usedOrderField} desc):`);
  messages.forEach((message) => {
    console.log(
      `${message.id} | fromMe=${message.fromMe ?? 'n/a'} | dir=${message.direction || 'n/a'} | ` +
      `body="${message.body}" | tsClient=${formatTimestamp(message.tsClient)} | tsServer=${formatTimestamp(message.tsServer)} | ` +
      `waMessageId=${message.waMessageId || 'n/a'} | clientMessageId=${message.clientMessageId || 'n/a'} | requestId=${message.requestId || 'n/a'}`,
    );
  });

  const latestMessage = messages[0];
  if (latestMessage) {
    const latestTs = toEpochMs(pickMessageTimestamp(latestMessage));
    const threadTs = toEpochMs(threadData.lastMessageAt);
    const diffMs = Math.abs(threadTs - latestTs);
    if (diffMs > 120000) {
      console.log(`\nTHREAD NOT UPDATED: lastMessageAt differs by ${Math.round(diffMs / 1000)}s`);
    } else {
      console.log('\nTHREAD UPDATED: lastMessageAt matches latest message.');
    }
  }

  const outboundGroups = new Map();
  for (const message of messages) {
    const isOutbound = message.fromMe === true || message.direction === 'outbound' || message.direction === 'out';
    const key = message.clientMessageId || message.requestId;
    if (!isOutbound || !key) continue;
    const count = outboundGroups.get(key) || 0;
    outboundGroups.set(key, count + 1);
  }

  const duplicates = Array.from(outboundGroups.entries()).filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    console.log('\nPOSSIBLE DUPLICATE OUTBOUND:');
    duplicates.forEach(([key, count]) => {
      console.log(`- ${key} x${count}`);
    });
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
