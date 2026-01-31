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
        'phone', // Moved to front
        'displayName', // Moved to front
        'eventDate', // <--- NEW: Dedicated date column
        'guestCount', // <--- NEW: Dedicated guest count column
        'location', // <--- NEW: Dedicated location column
        'manualNotes', // <--- NEW: Persistent Manual Notes column
        'ai_summary',
        'lastMessageAt',
        'lastMessageText',
        'accountId',
        'threadId',
        'clientJid',
      ],
    }));

  // FORCE UPDATE HEADERS (Ensures new columns exist if they didn't before)
  await contactsSheet.setHeaderRow([
    'phone',
    'displayName',
    'eventDate',
    'guestCount',
    'location',
    'manualNotes',
    'ai_summary',
    'lastMessageAt',
    'lastMessageText',
    'accountId',
    'threadId',
    'clientJid',
  ]);

  const messagesSheet =
    doc.sheetsByTitle['Messages'] ||
    (await doc.addSheet({
      title: 'Messages',
      headerValues: [
        'phone',
        'direction',
        'senderName',
        'text',
        'timestamp', // Changed from tsClientMs
        'accountId',
        'threadId',
        'messageId',
        'type',
        'mediaUrl',
        'driveUrl',
        'status',
      ],
    }));

  await messagesSheet.setHeaderRow([
    'phone',
    'direction',
    'senderName',
    'text',
    'timestamp',
    'accountId',
    'threadId',
    'messageId',
    'type',
    'mediaUrl',
    'driveUrl',
    'status',
  ]);

  // FETCH EXISTING DATA to preserve manual notes
  console.log('📖 Reading existing sheet data to preserve manual notes...');
  const existingRows = await contactsSheet.getRows();
  const manualNotesMap = new Map();
  existingRows.forEach(row => {
    const rawPhone = row.get('phone') || '';
    const phoneNum = rawPhone.toString().replace(/\D/g, '');
    const notes = (row.get('manualNotes') || '').toString().trim();
    if (phoneNum && notes) {
      // Dacă avem mai multe rânduri, păstrăm nota cea mai lungă (cel mai probabil cea mai updatată)
      const existing = manualNotesMap.get(phoneNum) || '';
      if (notes.length >= existing.length) {
        manualNotesMap.set(phoneNum, notes);
      }
    }
  });

  // Clear messages (safe to clear full history)
  await messagesSheet.clearRows();
  // For Contacts, we will OVERWRITE but keep manual notes
  await contactsSheet.clearRows();

  // 1. Export Contacts/Threads
  console.log('👥 Fetching threads...');
  let threadsQuery = db.collection('threads');
  if (ACCOUNT_IDS.length > 0) {
    threadsQuery = threadsQuery.where('accountId', 'in', ACCOUNT_IDS);
  }

  const threadSnap = await threadsQuery.get();

  // Map thread IDs to Phone numbers for fast lookup during message export
  const threadPhoneMap = new Map();
  const threadRows = threadSnap.docs.map(d => {
    const data = d.data();
    const phone = (data.phone || data.phoneE164 || '').toString();
    const cleanPhone = phone.replace(/\D/g, '');
    threadPhoneMap.set(d.id, phone);

    const summary = data.ai_summary || '';

    // Simple intelligence: Try to extract data from the summary
    let extractedDate = '';
    const dateMatch = summary.match(/(?:Dată|Data|Eveniment|Când):\s*([^\n,.]+)/i);
    if (dateMatch) {
      extractedDate = dateMatch[1].trim();
    }

    let extractedGuests = '';
    const guestMatch = summary.match(/(?:Persoane|Copii|Invitați|Nr\.?\s*persoane):\s*([^\n,.]+)/i);
    if (guestMatch) {
      extractedGuests = guestMatch[1].trim();
    }

    let extractedLocation = '';
    const locationMatch = summary.match(/(?:Locație|Locatie|Adresă|Adresa):\s*([^\n,.]+)/i);
    if (locationMatch) {
      extractedLocation = locationMatch[1].trim();
    }

    // Preserve manual notes if they exist in the map
    const manualNote = manualNotesMap.get(cleanPhone) || '';

    return {
      phone: phone,
      displayName: data.displayName || '',
      eventDate: extractedDate,
      guestCount: extractedGuests,
      location: extractedLocation,
      manualNotes: manualNote, // <--- PRESERVED
      ai_summary: summary,
      lastMessageAt: data.lastMessageAt ? data.lastMessageAt.toDate().toISOString() : '',
      lastMessageText: data.lastMessageText || '',
      accountId: data.accountId || '',
      threadId: d.id,
      clientJid: data.clientJid || '',
    };
  });

  if (threadRows.length > 0) {
    await contactsSheet.addRows(threadRows);
    console.log(`✅ Exported ${threadRows.length} threads with preserved manual notes.`);
  }

  // 2. Export Messages (Paginat)
  console.log('💬 Fetching messages...');
  let messageCount = 0;

  // Designated folder for media
  let mediaFolderId = null;
  if (INCLUDE_MEDIA) {
    try {
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
    } catch (driveErr) {
      console.error(`  ⚠️  Google Drive API error: ${driveErr.message}. Disabling media upload.`);
      // Continue without media folder if Drive API is not enabled or accessible
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

    const msgSnap = await msgQuery.get();
    const batchRows = [];

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - SINCE_DAYS);

    for (const msgDoc of msgSnap.docs) {
      const data = msgDoc.data();

      // In-memory filter to avoid index requirement
      if (SINCE_DAYS > 0 && data.createdAt) {
        const createdAt = data.createdAt.toDate
          ? data.createdAt.toDate()
          : new Date(data.createdAt);
        if (createdAt < sinceDate) continue;
      }
      const rawTs =
        data.tsClientMs ||
        (data.createdAt && data.createdAt.toDate
          ? data.createdAt.toDate().getTime()
          : data.createdAt);
      let formattedDate = '';
      if (rawTs) {
        try {
          formattedDate = new Date(rawTs).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' });
        } catch (e) {
          formattedDate = String(rawTs);
        }
      }

      const row = {
        phone: threadPhoneMap.get(threadId) || '',
        direction: data.direction || (data.fromMe ? 'outbound' : 'inbound'),
        senderName: data.fromMe
          ? 'AI (SuperParty)'
          : data.pushName || data.displayName || data.senderName || 'Client',
        text: data.body || data.text || '',
        timestamp: formattedDate,
        accountId: data.accountId || '',
        threadId: threadId,
        messageId: msgDoc.id,
        type: data.type || 'text',
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
