/**
 * Parse date of birth (DOB) from various formats
 * 
 * Accepts:
 * - "15-01-2020" (DD-MM-YYYY) → complete DOB
 * - "15-01" (DD-MM) → missing year, calculate from age
 * - "15 ianuarie" → missing year, calculate from age
 * 
 * @param {string} input - DOB input
 * @param {number} age - Child age (for calculating missing year)
 * @param {string} eventDate - Event date (DD-MM-YYYY) for reference
 * @returns {Object} - { dob: string|null, missingYear: boolean, interpretation: string, valid: boolean }
 */
function parseDOB(input, age, eventDate) {
  if (!input || typeof input !== 'string') {
    return {
      dob: null,
      missingYear: false,
      interpretation: null,
      valid: false,
      error: 'Data nașterii lipsește.',
    };
  }

  const cleaned = input.trim();

  // Pattern 1: DD-MM-YYYY (complete)
  const fullMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (fullMatch) {
    const day = fullMatch[1].padStart(2, '0');
    const month = fullMatch[2].padStart(2, '0');
    const year = fullMatch[3];
    return {
      dob: `${day}-${month}-${year}`,
      missingYear: false,
      interpretation: `Data nașterii: ${day}-${month}-${year}`,
      valid: true,
    };
  }

  // Pattern 2: DD-MM (missing year)
  const partialMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})$/);
  if (partialMatch) {
    if (!age || !Number.isFinite(Number(age))) {
      return {
        dob: null,
        missingYear: true,
        interpretation: null,
        valid: false,
        error: 'Lipsește anul nașterii. Te rog să specifici vârsta copilului pentru a calcula anul.',
      };
    }

    const day = partialMatch[1].padStart(2, '0');
    const month = partialMatch[2].padStart(2, '0');

    // Calculate year from age and event date
    const year = calculateYearFromAge(age, eventDate);

    return {
      dob: `${day}-${month}-${year}`,
      missingYear: true,
      interpretation: `Data nașterii calculată: ${day}-${month}-${year} (vârsta ${age} ani)`,
      valid: true,
      needsConfirmation: true,
    };
  }

  return {
    dob: null,
    missingYear: false,
    interpretation: null,
    valid: false,
    error: `Nu am putut interpreta data nașterii "${input}". Te rog să specifici în format DD-MM-YYYY (ex: 15-01-2020) sau DD-MM (ex: 15-01) + vârsta.`,
  };
}

/**
 * Calculate birth year from age and event date
 * 
 * @param {number} age - Child age
 * @param {string} eventDate - Event date (DD-MM-YYYY)
 * @returns {number} - Birth year
 */
function calculateYearFromAge(age, eventDate) {
  // Parse event date
  const [day, month, year] = eventDate.split('-').map(Number);
  const eventDateObj = new Date(year, month - 1, day);

  // Calculate birth year
  const birthYear = eventDateObj.getFullYear() - age;

  return birthYear;
}

module.exports = {
  parseDOB,
  calculateYearFromAge,
};
