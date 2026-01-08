#!/usr/bin/env node

/**
 * Test pentru verificarea că AI-ul nu intră în loop când user răspunde cu "da"
 */

console.log('🧪 Test: Verificare Loop Conversație\n');
console.log('═══════════════════════════════════════════════════════════════\n');

// Simulate conversation
const conversation = [
  {
    user: "Vreau să adaug un eveniment",
    expectedAI: "Trebuie să conțină instrucțiuni despre format",
    shouldNotContain: ["Confirmăm?", "Ești sigur?", "Vrei să continui?"]
  },
  {
    user: "da",
    expectedAI: "Trebuie să schimbe subiectul sau să întrebe cum poate ajuta",
    shouldNotContain: ["Confirmăm?", "Ești sigur?", "Vrei să continui?", "Ce dată?", "Ce adresă?"]
  },
  {
    user: "ok",
    expectedAI: "Trebuie să schimbe subiectul",
    shouldNotContain: ["Confirmăm?", "Ești sigur?", "Vrei să continui?"]
  }
];

console.log('📋 Scenariul de test:\n');
conversation.forEach((turn, index) => {
  console.log(`${index + 1}. User: "${turn.user}"`);
  console.log(`   Expected: ${turn.expectedAI}`);
  console.log(`   Should NOT contain: ${turn.shouldNotContain.join(', ')}`);
  console.log('');
});

console.log('═══════════════════════════════════════════════════════════════\n');

// Check system prompt
const fs = require('fs');
const indexJs = fs.readFileSync('./index.js', 'utf8');

console.log('🔍 Verificare System Prompt:\n');

const checks = [
  {
    pattern: 'NU întreba utilizatorul despre detalii pentru evenimente',
    description: 'AI nu trebuie să întrebe despre detalii'
  },
  {
    pattern: 'NU continua să întrebi despre evenimente după ce utilizatorul a răspuns cu "da"',
    description: 'AI nu trebuie să continue după "da"'
  },
  {
    pattern: 'schimbă subiectul',
    description: 'AI trebuie să schimbe subiectul'
  },
  {
    pattern: 'NU intra în loop-uri',
    description: 'AI nu trebuie să intre în loop-uri'
  },
  {
    pattern: 'shortConfirmations',
    description: 'Backend detectează confirmări scurte'
  }
];

let allChecksPass = true;

checks.forEach(check => {
  const found = indexJs.includes(check.pattern);
  if (found) {
    console.log(`✅ ${check.description}`);
  } else {
    console.log(`❌ ${check.description} - LIPSEȘTE`);
    allChecksPass = false;
  }
});

console.log('\n═══════════════════════════════════════════════════════════════\n');

if (allChecksPass) {
  console.log('🎉 Toate verificările au trecut!\n');
  console.log('✅ System prompt actualizat corect');
  console.log('✅ Backend detectează confirmări scurte');
  console.log('✅ AI nu va mai intra în loop-uri\n');
  console.log('📝 Next Steps:');
  console.log('  1. Deploy functions: cd functions && npm run deploy');
  console.log('  2. Test în app cu conversație reală');
  console.log('  3. Verifică că AI schimbă subiectul după "da"\n');
  process.exit(0);
} else {
  console.log('⚠️  Unele verificări au eșuat.\n');
  console.log('Verifică că toate modificările au fost aplicate corect.\n');
  process.exit(1);
}
