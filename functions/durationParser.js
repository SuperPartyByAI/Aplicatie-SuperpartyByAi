/**
 * Parse duration from various formats to minutes
 * 
 * Accepts:
 * - "2" or "2 ore" → 120 minutes
 * - "120" or "120 min" → 120 minutes
 * - "90" or "90 min" → 90 minutes
 * - "1.5" or "1,5" or "1.5 ore" → 90 minutes
 * 
 * @param {string} input - Duration input
 * @returns {Object} - { minutes: number, interpretation: string, valid: boolean }
 */
function parseDuration(input) {
  if (!input || typeof input !== 'string') {
    return {
      minutes: null,
      interpretation: null,
      valid: false,
      error: 'Durata lipsește sau este invalidă.',
    };
  }

  const cleaned = input.trim().toLowerCase();

  // Pattern 1: "2 ore" or "2ore" or "2 h"
  const hoursMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*(?:ore?|h|hours?)$/);
  if (hoursMatch) {
    const hours = parseFloat(hoursMatch[1].replace(',', '.'));
    const minutes = Math.round(hours * 60);
    const hoursFormatted = hours === Math.floor(hours) ? hours : hours.toFixed(1);
    return {
      minutes,
      interpretation: `${hoursFormatted} ${hours === 1 ? 'oră' : 'ore'} = ${minutes} minute`,
      valid: true,
    };
  }

  // Pattern 2: "120 min" or "120min" or "120 minute"
  const minutesMatch = cleaned.match(/^(\d+)\s*(?:min|minute|minutes?)$/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10);
    const hours = minutes / 60;
    const hoursFormatted = hours === Math.floor(hours) ? hours : hours.toFixed(1);
    return {
      minutes,
      interpretation: `${minutes} minute = ${hoursFormatted} ${hours === 1 ? 'oră' : 'ore'}`,
      valid: true,
    };
  }

  // Pattern 3: Just a number (ambiguous - could be hours or minutes)
  const numberMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)$/);
  if (numberMatch) {
    const value = parseFloat(numberMatch[1].replace(',', '.'));

    // Heuristic: if value <= 10, assume hours; if > 10, assume minutes
    if (value <= 10) {
      const minutes = Math.round(value * 60);
      const hoursFormatted = value === Math.floor(value) ? value : value.toFixed(1);
      return {
        minutes,
        interpretation: `${hoursFormatted} ${value === 1 ? 'oră' : 'ore'} = ${minutes} minute`,
        valid: true,
        ambiguous: true,
        alternativeInterpretation: `${value} minute`,
      };
    } else {
      const minutes = Math.round(value);
      const hours = minutes / 60;
      const hoursFormatted = hours === Math.floor(hours) ? hours : hours.toFixed(1);
      return {
        minutes,
        interpretation: `${minutes} minute = ${hoursFormatted} ${hours === 1 ? 'oră' : 'ore'}`,
        valid: true,
      };
    }
  }

  return {
    minutes: null,
    interpretation: null,
    valid: false,
    error: `Nu am putut interpreta durata "${input}". Te rog să specifici în format: "2 ore", "120 min", sau "1.5 ore".`,
  };
}

module.exports = {
  parseDuration,
};
