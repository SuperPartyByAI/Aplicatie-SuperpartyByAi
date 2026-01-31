const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

async function debugSheet() {
  const saPath = '/etc/whatsapp-backend/firebase-sa.json';
  if (!fs.existsSync(saPath)) {
    console.error('❌ Service Account file not found at:', saPath);
    return;
  }

  const creds = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet('1r2sC0C-cP1CKBFYnNTYBzGBUCkz1HidEmwBOp63Snj8', auth);
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['Contacts'];
  if (!sheet) {
    console.error('❌ Sheet "Contacts" not found!');
    return;
  }

  console.log('✅ Connected to Sheet:', doc.title);
  console.log('📊 Total Rows (estimate):', sheet.rowCount);
  const rows = await sheet.getRows();
  // Header values are available on the sheet object after getRows or loadInfo
  console.log('📑 Headers (internal):', JSON.stringify(sheet.headerValues));
  const target = '40731829063';
  const matches = rows.filter(r => (r.get('phone') || '').toString().includes(target));

  console.log(`\n🔍 Found ${matches.length} matches for ${target}:`);
  matches.forEach(m => {
    console.log(`\n--- Row ${m._rowNumber} ---`);
    console.log('Raw Data Array:', JSON.stringify(m._rawData));
    console.log('Object Keys:', JSON.stringify(Object.keys(m.toObject())));
    console.log('manualNotes (get):', `"${m.get('manualNotes')}"`);
    console.log('manualNotes (direct):', `"${m._rawData[5]}"`); // Index 5 is Column F
    console.log('eventDate (get):', `"${m.get('eventDate')}"`);
  });

  console.log('\n🔎 Global scan for ANY non-empty manualNotes:');
  let noteCount = 0;
  rows.forEach(r => {
    const n = (r.get('manualNotes') || '').toString().trim();
    if (n.length > 0) {
      noteCount++;
      if (noteCount <= 10) {
        console.log(`Row ${r._rowNumber} (${r.get('phone')}): "${n}"`);
      }
    }
  });
  console.log(`Summary: Total rows with notes: ${noteCount}`);

  if (matches.length > 0) {
    console.log(
      '\n📊 FULL COLUMN DUMP for your latest row:',
      matches[matches.length - 1]._rowNumber
    );
    const lastMatch = matches[matches.length - 1];
    lastMatch._rawData.forEach((val, i) => {
      const header = sheet.headerValues[i] || `Col_${i}`;
      console.log(`${String.fromCharCode(65 + i)} [${header}]: "${val}"`);
    });
  } else {
    console.log('\n❌ No matches found to dump columns.');
  }
}

debugSheet().catch(console.error);
