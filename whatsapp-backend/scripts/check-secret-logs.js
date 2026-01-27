const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'build']);
const TARGET_EXT = new Set(['.js', '.cjs', '.mjs']);

const patterns = [
  {
    name: 'ADMIN_TOKEN substring in logs',
    re: /console\.(log|warn|error)\([^\\n]*ADMIN_TOKEN\\.substring/gi,
  },
  {
    name: 'ONE_TIME_TEST_TOKEN interpolation in logs',
    re: /console\.(log|warn|error)\([^\\n]*\\$\\{ONE_TIME_TEST_TOKEN\\}/gi,
  },
  {
    name: 'ONE_TIME_TEST_TOKEN concatenation in logs',
    re: /console\.(log|warn|error)\([^\\n]*(\\+|,)\\s*ONE_TIME_TEST_TOKEN/gi,
  },
  {
    name: 'Bearer token in logs',
    re: /console\.(log|warn|error)\([^\\n]*['"`][^'"`]*Bearer\\s+[^'"`]*['"`]/gi,
  },
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && TARGET_EXT.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function findLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

const offenders = [];
for (const file of walk(ROOT)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const { name, re } of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content))) {
      offenders.push({
        file,
        line: findLineNumber(content, match.index),
        name,
        snippet: content
          .slice(match.index, match.index + 140)
          .split('\n')[0]
          .trim(),
      });
    }
  }
}

if (offenders.length) {
  console.error('Secret log check failed. Remove sensitive log output.');
  for (const off of offenders) {
    console.error(`- ${off.name}: ${off.file}:${off.line}`);
    console.error(`  ${off.snippet}`);
  }
  process.exit(1);
}

console.log('Secret log check passed.');
