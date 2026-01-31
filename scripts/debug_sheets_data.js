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
  console.log('📑 Headers (internal):', JSON.stringify(sheet.headerValues));

  const rows = await sheet.getRows();
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

  const withNotes = rows.filter(r => (r.get('manualNotes') || '').toString().trim() !== '');
  console.log(`\n📝 Total rows globally with notes: ${withNotes.length}`);
  if (withNotes.length > 0) {
    console.log(
      'Top match with notes:',
      withNotes[0].get('phone'),
      '->',
      withNotes[0].get('manualNotes')
    );
  }
}

debugSheet().catch(console.error);
