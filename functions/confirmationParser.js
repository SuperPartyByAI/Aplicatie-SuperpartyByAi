/**
 * Check if user input is affirmative (confirmation)
 * 
 * Accepts natural language:
 * - "da", "confirm", "corect", "exact", "e ok", "sigur"
 * - "yes", "ok", "sure", "correct"
 * - variations with punctuation
 * 
 * @param {string} input - User input
 * @returns {boolean} - True if affirmative
 */
function isAffirmative(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }

  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[.,!?]/g, ''); // Remove punctuation

  // Romanian affirmative patterns
  const roPatterns = [
    'da',
    'confirm',
    'confirmă',
    'confirma',
    'corect',
    'exact',
    'e ok',
    'e okay',
    'sigur',
    'desigur',
    'bineînțeles',
    'bineinteles',
    'perfect',
    'ok',
    'okay',
  ];

  // English affirmative patterns
  const enPatterns = [
    'yes',
    'yep',
    'yeah',
    'sure',
    'correct',
    'right',
    'exactly',
    'ok',
    'okay',
  ];

  const allPatterns = [...roPatterns, ...enPatterns];

  // Check exact match
  if (allPatterns.includes(cleaned)) {
    return true;
  }

  // Check if starts with affirmative word
  for (const pattern of allPatterns) {
    if (cleaned.startsWith(pattern + ' ')) {
      return true;
    }
  }

  return false;
}

/**
 * Check if user input is negative (rejection)
 * 
 * @param {string} input - User input
 * @returns {boolean} - True if negative
 */
function isNegative(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }

  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[.,!?]/g, '');

  const negativePatterns = [
    'nu',
    'no',
    'nope',
    'not',
    'fals',
    'false',
    'greșit',
    'gresit',
    'incorect',
    'anulează',
    'anuleaza',
    'cancel',
  ];

  // Check exact match
  if (negativePatterns.includes(cleaned)) {
    return true;
  }

  // Check if starts with negative word
  for (const pattern of negativePatterns) {
    if (cleaned.startsWith(pattern + ' ')) {
      return true;
    }
  }

  return false;
}

module.exports = {
  isAffirmative,
  isNegative,
};
