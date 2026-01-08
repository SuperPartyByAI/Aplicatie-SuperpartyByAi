#!/usr/bin/env node

/**
 * Test detecție pattern-uri pentru evenimente (simulare Flutter logic)
 */

console.log('🧪 Testare detecție pattern-uri evenimente\n');
console.log('═══════════════════════════════════════════════════════════════\n');

// Simulate Flutter normalization function
function normalizeText(text) {
  const diacritics = 'ăâîșțĂÂÎȘȚ';
  const replacements = 'aaistaAISTA';
  let normalized = text.toLowerCase();
  
  for (let i = 0; i < diacritics.length; i++) {
    normalized = normalized.split(diacritics[i]).join(replacements[i]);
  }
  
  return normalized;
}

// Simulate Flutter detection function
function detectEventIntent(message) {
  const normalized = normalizeText(message);
  
  const patterns = [
    'noteaza', 'adauga', 'creeaza', 'programeaza', 'rezerva',
    'seteaza', 'pune', 'inscrie', 'inregistreaza', 'salveaza',
    'vreau', 'as vrea', 'pot sa', 'poti sa', 'trebuie sa',
    'eveniment', 'petrecere', 'aniversare', 'botez', 'nunta',
    'party', 'sarbatoare', 'celebrare', 'organizare', 'planificare',
    'am nevoie', 'necesit', 'caut', 'doresc', 'solicit',
    'comanda', 'booking', 'rezervare', 'programare', 'planificare',
    'pentru', 'la data', 'pe data', 'in data', 'ziua de',
    'animator', 'ursitoare', 'vata', 'popcorn', 'decoratiuni',
    'baloane', 'aranjamente', 'mos craciun', 'gheata carbonica',
    'copil', 'copii', 'ani', 'varsta', 'sarbatorit',
  ];
  
  return patterns.some(p => normalized.includes(p));
}

const testCases = [
  // Should detect (with diacritics)
  { text: 'Notează eveniment pentru Maria pe 15-02-2026', shouldDetect: true, description: 'Cu diacritice - notează' },
  { text: 'Adaugă petrecere pentru Ion', shouldDetect: true, description: 'Cu diacritice - adaugă' },
  { text: 'Creează eveniment mâine', shouldDetect: true, description: 'Cu diacritice - creează' },
  { text: 'Programează botez pentru Ana', shouldDetect: true, description: 'Cu diacritice - programează' },
  
  // Should detect (without diacritics)
  { text: 'noteaza eveniment pentru Maria pe 15-02-2026', shouldDetect: true, description: 'Fără diacritice - noteaza' },
  { text: 'adauga petrecere pentru Ion', shouldDetect: true, description: 'Fără diacritice - adauga' },
  { text: 'creeaza eveniment maine', shouldDetect: true, description: 'Fără diacritice - creeaza' },
  { text: 'programeaza botez pentru Ana', shouldDetect: true, description: 'Fără diacritice - programeaza' },
  
  // Should detect (various patterns)
  { text: 'Vreau să organizez o petrecere', shouldDetect: true, description: 'Pattern: vreau + petrecere' },
  { text: 'Am nevoie de animator pentru copil', shouldDetect: true, description: 'Pattern: am nevoie + animator' },
  { text: 'Pot să rezerv pentru 15-02-2026?', shouldDetect: true, description: 'Pattern: pot sa + rezerv' },
  { text: 'Trebuie să planific un eveniment', shouldDetect: true, description: 'Pattern: trebuie sa + eveniment' },
  { text: 'Doresc să comand vată de zahăr', shouldDetect: true, description: 'Pattern: doresc + vata' },
  
  // Should NOT detect
  { text: 'Bună ziua, cum merge?', shouldDetect: false, description: 'Conversație normală' },
  { text: 'Ce mai faci?', shouldDetect: false, description: 'Întrebare generală' },
  { text: 'Mulțumesc pentru ajutor', shouldDetect: false, description: 'Mulțumire' },
  { text: 'Salut!', shouldDetect: false, description: 'Salut simplu' },
];

let passed = 0;
let failed = 0;

testCases.forEach(testCase => {
  const result = detectEventIntent(testCase.text);
  const testPassed = result === testCase.shouldDetect;
  
  if (testPassed) {
    console.log(`✅ PASS: ${testCase.description}`);
    console.log(`   Text: "${testCase.text}"`);
    console.log(`   Detected: ${result} (expected: ${testCase.shouldDetect})`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${testCase.description}`);
    console.log(`   Text: "${testCase.text}"`);
    console.log(`   Detected: ${result} (expected: ${testCase.shouldDetect})`);
    failed++;
  }
  console.log('');
});

console.log('═══════════════════════════════════════════════════════════════');
console.log(`📊 Rezultate: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

// Test normalization specifically
console.log('🔍 Testare normalizare diacritice\n');

const normalizationTests = [
  { input: 'notează', expected: 'noteaza' },
  { input: 'adaugă', expected: 'adauga' },
  { input: 'creează', expected: 'creeaza' },
  { input: 'programează', expected: 'programeaza' },
  { input: 'vată', expected: 'vata' },
  { input: 'înregistrează', expected: 'inregistreaza' },
  { input: 'șterge', expected: 'sterge' },
  { input: 'țară', expected: 'tara' },
];

let normPassed = 0;
let normFailed = 0;

normalizationTests.forEach(test => {
  const result = normalizeText(test.input);
  const testPassed = result === test.expected;
  
  if (testPassed) {
    console.log(`✅ "${test.input}" → "${result}"`);
    normPassed++;
  } else {
    console.log(`❌ "${test.input}" → "${result}" (expected: "${test.expected}")`);
    normFailed++;
  }
});

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`📊 Rezultate normalizare: ${normPassed} passed, ${normFailed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed === 0 && normFailed === 0) {
  console.log('🎉 Toate testele au trecut cu succes!\n');
  console.log('✅ Detecția pattern-urilor funcționează corect');
  console.log('✅ Normalizarea diacriticelor funcționează');
  console.log('✅ Pattern-urile cu și fără diacritice sunt detectate\n');
  process.exit(0);
} else {
  console.log('⚠️  Unele teste au eșuat.\n');
  process.exit(1);
}
