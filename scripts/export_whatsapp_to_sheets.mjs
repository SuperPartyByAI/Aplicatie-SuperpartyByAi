/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import mime from 'mime-types';
import axios from 'axios';

// CLI Arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value || true;
  return acc;
}, {});

const ACCOUNT_IDS = args.accountId ? args.accountId.split(',') : [];
const SPREADSHEET_ID = args.spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID;
const SINCE_DAYS = Number.parseInt(args.sinceDays || '0');
const INCLUDE_MEDIA = args.includeMedia !== 'false';

if (!SPREADSHEET_ID) {
  console.error('❌ Missing --spreadsheetId or GOOGLE_SPREADSHEET_ID env');
  process.exit(1);
}

// Auth Helper
async function getAuth() {
  let creds;
  const credsVar =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!credsVar) {
    throw new Error('Missing GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON');
  }

  if (credsVar.trim().startsWith('{')) {
    creds = JSON.parse(credsVar);
  } else {
    creds = JSON.parse(fs.readFileSync(path.resolve(credsVar), 'utf8'));
  }

  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return { auth, creds };
}

// Media Cache
const mediaCache = new Map();

async function uploadToDrive(drive, mediaUrl, fileName, folderId) {
  if (mediaCache.has(mediaUrl)) return mediaCache.get(mediaUrl);

  try {
    console.log(`  📥 Downloading ${mediaUrl}...`);
    const response = await axios.get(mediaUrl, { responseType: 'stream' });
    const mimeType =
      response.headers['content-type'] || mime.lookup(fileName) || 'application/octet-stream';

    const driveFile = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: folderId ? [folderId] : [],
        mimeType: mimeType,
      },
      media: {
        mimeType: mimeType,
        body: response.data,
      },
      fields: 'id, webViewLink',
    });

    const link = driveFile.data.webViewLink;
    mediaCache.set(mediaUrl, link);
    return link;
  } catch (err) {
    console.error(`  ❌ Failed media: ${mediaUrl} -> ${err.message}`);
    return null;
  }
}

async function main() {
  const { auth, creds } = await getAuth();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(creds),
    });
  }
  const db = admin.firestore();
  const drive = google.drive({ version: 'v3', auth });

  console.log(`🚀 Starting export to: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
  await doc.loadInfo();

  const contactsSheet =
    doc.sheetsByTitle['Contacts'] ||
    (await doc.addSheet({
      title: 'Contacts',
      headerValues: [
        'accountId',
        'threadId',
        'phone',
        'displayName',
        'clientJid',
        'lastMessageAt',
        'lastMessageText',
        'ai_summary', // <--- NEW COLUMN
      ],
    }));
  const messagesSheet =
    doc.sheetsByTitle['Messages'] ||
    (await doc.addSheet({
      title: 'Messages',
      headerValues: [
        'accountId',
        'threadId',
        'messageId',
        'tsClientMs',
        'direction',
        'senderName',
        'type',
        'text',
        'mediaUrl',
        'driveUrl',
        'status',
      ],
    }));

  // Clear sheets before starting (optional, based on requirement "1 row per...")
  // We'll append for now or clear if needed.
  await contactsSheet.clearRows();
  await messagesSheet.clearRows();

  // 1. Export Contacts/Threads
  console.log('👥 Fetching threads...');
  let threadsQuery = db.collection('threads');
  if (ACCOUNT_IDS.length > 0) {
    threadsQuery = threadsQuery.where('accountId', 'in', ACCOUNT_IDS);
  }

  const threadSnap = await threadsQuery.get();
  const threadRows = threadSnap.docs.map(d => {
    const data = d.data();
    return {
      accountId: data.accountId || '',
      threadId: d.id,
      phone: data.phone || data.phoneE164 || '',
      displayName: data.displayName || '',
      clientJid: data.clientJid || '',
      lastMessageAt: data.lastMessageAt ? data.lastMessageAt.toDate().toISOString() : '',
      lastMessageText: data.lastMessageText || '',
      ai_summary: data.ai_summary || '', // <--- MAP DATA
    };
  });

  if (threadRows.length > 0) {
    await contactsSheet.addRows(threadRows);
    console.log(`✅ Exported ${threadRows.length} threads.`);
  }

  // 2. Export Messages (Paginat)
  console.log('💬 Fetching messages...');
  let messageCount = 0;

  // Designated folder for media
  let mediaFolderId = null;
  if (INCLUDE_MEDIA) {
    const folderRes = await drive.files.list({
      q: `name = 'WhatsApp_Export_Media' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    });
    if (folderRes.data.files.length > 0) {
      mediaFolderId = folderRes.data.files[0].id;
    } else {
      const folder = await drive.files.create({
        requestBody: {
          name: 'WhatsApp_Export_Media',
          mimeType: 'application/vnd.google-apps.folder',
        },
      });
      mediaFolderId = folder.data.id;
    }
  }

  // Iterate over threads to fetch messages (avoids collectionGroup memory issues if scale is high)
  for (const threadId of threadSnap.docs.map(d => d.id)) {
    console.log(`  🧵 Exporting thread: ${threadId}`);
    let msgQuery = db
      .collection('threads')
      .doc(threadId)
      .collection('messages')
      .orderBy('tsSort', 'asc');

    if (SINCE_DAYS > 0) {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - SINCE_DAYS);
      msgQuery = msgQuery.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(sinceDate));
    }

    const msgSnap = await msgQuery.get();
    const batchRows = [];

    for (const msgDoc of msgSnap.docs) {
      const data = msgDoc.data();
      const row = {
        accountId: data.accountId || '',
        threadId: threadId,
        messageId: msgDoc.id,
        tsClientMs: data.tsClientMs || '',
        direction: data.direction || '',
        senderName: data.pushName || data.displayName || '',
        type: data.type || 'text',
        text: data.body || '',
        mediaUrl: data.mediaUrl || '',
        driveUrl: '',
        status: data.status || '',
      };

      if (INCLUDE_MEDIA && data.mediaUrl && !data.mediaUrl.includes('google.com')) {
        const fileName = `${threadId}_${msgDoc.id}_${data.fileName || 'file'}`;
        row.driveUrl = await uploadToDrive(drive, data.mediaUrl, fileName, mediaFolderId);
      }

      batchRows.push(row);
      messageCount++;
    }

    if (batchRows.length > 0) {
      await messagesSheet.addRows(batchRows);
    }
  }

  console.log(`🏁 Export finished. Total messages: ${messageCount}`);
}

main().catch(err => {
  console.error('💥 Crash:', err);
  process.exit(1);
});
