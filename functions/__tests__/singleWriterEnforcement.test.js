const fs = require('fs');
const path = require('path');

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

function findExportRequires(indexJsText) {
  // Matches: exports.name = require('./file').prop;
  const re = /exports\.(\w+)\s*=\s*require\(\s*['"]\.\/([^'"]+)['"]\s*\)\.(\w+)\s*;/g;
  const out = [];
  let m;
  while ((m = re.exec(indexJsText))) {
    out.push({ exportName: m[1], relPath: `${m[2]}.js` });
  }
  return out;
}

function hasDirectEvenimenteWrite(source) {
  // Conservative: detect *direct* Firestore writes to evenimente from app code.
  // (Admin SDK server writes bypass rules, so we want a single controlled entrypoint.)
  const patterns = [
    /\.collection\(['"]evenimente['"]\)\.add\(/,
    /\.collection\(['"]evenimente['"]\)\.doc\([^)]*\)\.set\(/,
    /\.collection\(['"]evenimente['"]\)\.doc\([^)]*\)\.update\(/,
    /\.collection\(['"]evenimente['"]\)\.doc\([^)]*\)\.delete\(/,
  ];
  return patterns.some((re) => re.test(source));
}

test('only aiEventGateway callable performs direct writes to evenimente', () => {
  const functionsDir = path.join(__dirname, '..');
  const indexPath = path.join(functionsDir, 'index.js');
  const indexText = readUtf8(indexPath);

  // Ensure index itself doesn't write to evenimente directly.
  expect(hasDirectEvenimenteWrite(indexText)).toBe(false);

  const exportsMap = findExportRequires(indexText);
  expect(exportsMap.length).toBeGreaterThan(0);

  const offenders = [];
  for (const { exportName, relPath } of exportsMap) {
    const full = path.join(functionsDir, relPath);
    if (!fs.existsSync(full)) continue;
    const src = readUtf8(full);
    if (hasDirectEvenimenteWrite(src) && exportName !== 'aiEventGateway') {
      offenders.push({ exportName, relPath });
    }
  }

  expect(offenders).toEqual([]);
});

