#!/usr/bin/env node

/**
 * Script pentru inițializare AI Prompts în Firebase
 * Rulează: node scripts/init-ai-prompts.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function initAIPrompts() {
  console.log('🚀 Inițializare AI Prompts în Firebase...\n');

  try {
    // 1. Global System Prompt
    const globalPrompt = {
      systemPrompt: `Ești asistentul AI pentru aplicația SuperParty - o platformă de management evenimente și staff.

Rolul tău:
- Ajuți utilizatorii cu întrebări despre aplicație
- Oferi informații despre evenimente, disponibilitate, salarizare
- Ghidezi userii prin procesul de KYC
- Răspunzi la întrebări despre funcționalități

Stil comunicare:
- Concis și prietenos
- În limba română
- Răspunsuri clare și directe
- Maximum 2-3 paragrafe

Limitări:
- Nu poți modifica date direct în aplicație
- Nu poți aproba KYC (doar admin)
- Nu poți vedea date personale ale altor useri`,
      version: '1.0',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'system',
      active: true
    };

    await db.collection('aiPrompts').doc('globalPrompt').set(globalPrompt);
    console.log('✅ Global Prompt salvat');

    // 2. Contextual Prompts
    const contextualPrompts = {
      kyc_documents: {
        trigger: ['kyc', 'documente', 'ci', 'buletin', 'identitate', 'verificare'],
        prompt: `Când user întreabă despre documente KYC:

Documente necesare:
1. CI/Buletin (față + verso) - fotografii clare
2. Selfie cu documentul - pentru verificare identitate
3. IBAN - pentru plăți

Dacă e minor (<18 ani):
- Adaugă CI părinte (față + verso)
- Consimțământ părinte necesar

Dacă vrea să fie șofer:
- Permis conducere (față + verso)
- Cazier judiciar

Proces:
1. Mergi la secțiunea KYC
2. Completează formularul
3. Încarcă documentele
4. Așteaptă aprobare (24-48h)`,
        active: true,
        examples: [
          'Ce documente trebuie pentru KYC?',
          'Cum mă verific?',
          'Ce trebuie să încărc?'
        ]
      },
      weekend_availability: {
        trigger: ['weekend', 'sâmbătă', 'duminică', 'disponibilitate'],
        prompt: `Când user întreabă despre lucru în weekend:

Da, poți lucra în weekend!

Cum setezi disponibilitatea:
1. Mergi la secțiunea "Disponibilitate"
2. Selectează zilele când ești disponibil
3. Alege intervalul orar (ex: 10:00 - 22:00)
4. Salvează

Important:
- Poți selecta orice zile (inclusiv weekend)
- Poți avea disponibilități diferite pe zile diferite
- Poți modifica oricând disponibilitatea
- Evenimentele se alocă automat bazat pe disponibilitate`,
        active: true,
        examples: [
          'Pot lucra la weekend?',
          'Cum setez disponibilitatea pentru sâmbătă?',
          'Pot lucra duminica?'
        ]
      },
      payment_salary: {
        trigger: ['plată', 'bani', 'salariu', 'iban', 'când primesc'],
        prompt: `Când user întreabă despre plăți:

Sistem plăți:
- Plățile se fac după fiecare eveniment
- Transfer bancar pe IBAN-ul din KYC
- Procesare: 3-5 zile lucrătoare

Verifică plățile:
1. Mergi la secțiunea "Salarizare"
2. Vezi istoric plăți
3. Status: Pending / Procesată / Finalizată

Probleme:
- IBAN greșit? Actualizează în KYC
- Plată întârziată? Contactează admin
- Întrebări? Verifică secțiunea Salarizare`,
        active: true,
        examples: [
          'Când primesc banii?',
          'Cum văd plățile?',
          'Unde e salariul meu?'
        ]
      },
      events_allocation: {
        trigger: ['eveniment', 'alocare', 'lucru', 'shift', 'program'],
        prompt: `Când user întreabă despre evenimente:

Cum funcționează alocarea:
1. Admin creează eveniment
2. Sistemul verifică disponibilitatea ta
3. Dacă ești disponibil, primești notificare
4. Accepți sau refuzi evenimentul

Vezi evenimente:
- Secțiunea "Evenimente"
- Filtrează: Viitoare / Trecute / Toate
- Detalii: Dată, oră, locație, rol

Important:
- Setează disponibilitatea corect
- Răspunde prompt la alocări
- Poți refuza dacă nu poți participa`,
        active: true,
        examples: [
          'Cum primesc evenimente?',
          'Unde văd programul?',
          'Cum accept un eveniment?'
        ]
      }
    };

    for (const [key, value] of Object.entries(contextualPrompts)) {
      await db.collection('aiPrompts').doc('contextualPrompts').collection('prompts').doc(key).set({
        ...value,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Contextual Prompt salvat: ${key}`);
    }

    // 3. Settings
    const settings = {
      autoLearning: true,
      feedbackThreshold: 3,
      updateFrequency: 'daily',
      personalization: true,
      maxTokens: 300,
      temperature: 0.5,
      model: 'gpt-4o-mini'
    };

    await db.collection('aiPrompts').doc('settings').set({
      ...settings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Settings salvate');

    console.log('\n🎉 AI Prompts inițializate cu succes!');
    console.log('\n📊 Rezumat:');
    console.log('   - 1 Global Prompt');
    console.log('   - 4 Contextual Prompts');
    console.log('   - 1 Settings document');
    console.log('\n💡 Acum Cloud Functions pot citi prompt-urile din Firebase!');

  } catch (error) {
    console.error('❌ Eroare:', error);
    process.exit(1);
  }

  process.exit(0);
}

initAIPrompts();
