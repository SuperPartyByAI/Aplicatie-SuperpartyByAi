#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const EVIDENCE_FILE = path.join(__dirname, 'evidence.json');

function main() {
  console.log('=== Evidence Verification ===\n');

  if (!fs.existsSync(EVIDENCE_FILE)) {
    console.error('❌ FAIL: evidence.json not found');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(EVIDENCE_FILE, 'utf8'));

  let errors = 0;
  let warnings = 0;

  // Check each evidence item
  data.evidence.forEach((item, idx) => {
    console.log(`\n[${idx + 1}/${data.evidence.length}] ${item.id}`);
    console.log(`  Claim: ${item.claim}`);
    console.log(`  Status: ${item.status}`);

    // Rule 1: Numeric claims must have evidence
    const hasNumber = /\d+/.test(item.claim);
    if (hasNumber && item.status === 'CONFIRMAT') {
      if (!item.reproduce_command || item.reproduce_command === 'N/A') {
        if (!item.calc) {
          console.error(`  ❌ ERROR: Numeric claim without reproduce_command or calc`);
          errors++;
        }
      }

      if (!item.raw_output_excerpt || item.raw_output_excerpt === '(no matches)') {
        if (!item.calc) {
          console.error(`  ❌ ERROR: Numeric claim without raw_output_excerpt or calc`);
          errors++;
        }
      }
    }

    // Rule 2: CONFIRMAT must have evidence
    if (item.status === 'CONFIRMAT') {
      if (item.evidence_type === 'none') {
        console.error(`  ❌ ERROR: CONFIRMAT status with evidence_type=none`);
        errors++;
      }

      if (!item.raw_output_excerpt && !item.calc) {
        console.error(`  ❌ ERROR: CONFIRMAT without raw_output_excerpt or calc`);
        errors++;
      }
    }

    // Rule 3: FALS must have evidence of absence
    if (item.status === 'FALS') {
      if (!item.raw_output_excerpt) {
        console.warn(`  ⚠️  WARNING: FALS without raw_output_excerpt`);
        warnings++;
      }
    }

    // Rule 4: Calc must be complete
    if (item.calc) {
      if (!item.calc.inputs || !item.calc.formula || !item.calc.result) {
        console.error(`  ❌ ERROR: Incomplete calc (missing inputs/formula/result)`);
        errors++;
      }

      // Verify percentage calculations
      if (item.claim.includes('%')) {
        const match = item.claim.match(/(\d+)%/);
        if (match) {
          const claimedPercent = parseInt(match[1]);
          const resultPercent = parseFloat(item.calc.result);

          if (Math.abs(claimedPercent - resultPercent) > 1) {
            console.error(
              `  ❌ ERROR: Percentage mismatch: claim=${claimedPercent}%, calc=${resultPercent}%`
            );
            errors++;
          }
        }
      }
    }

    // Rule 5: Source path should exist if specified
    if (item.source_path && item.source_path !== null) {
      if (!fs.existsSync(item.source_path)) {
        console.warn(`  ⚠️  WARNING: Source path not found: ${item.source_path}`);
        warnings++;
      }
    }

    if (errors === 0 && warnings === 0) {
      console.log(`  ✅ OK`);
    }
  });

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total evidence items: ${data.evidence.length}`);
  console.log(`CONFIRMAT: ${data.summary.confirmat}`);
  console.log(`FALS: ${data.summary.fals}`);
  console.log(`NECONFIRMAT: ${data.summary.neconfirmat}`);
  console.log(`NETESTAT: ${data.summary.netestat}`);
  console.log(`\nErrors: ${errors}`);
  console.log(`Warnings: ${warnings}`);

  if (errors > 0) {
    console.log('\n❌ VERIFICATION FAILED');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('\n⚠️  VERIFICATION PASSED WITH WARNINGS');
    process.exit(0);
  } else {
    console.log('\n✅ VERIFICATION PASSED');
    process.exit(0);
  }
}

main();
