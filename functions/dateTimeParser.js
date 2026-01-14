'use strict';

/**
 * Date and Time Parser
 * 
 * Parses dates and times from Romanian text input.
 * Enforces DD-MM-YYYY format for dates.
 */

class DateTimeParser {
  /**
   * Parse date from text
   * Only accepts DD-MM-YYYY format
   * Rejects relative dates like "mâine", "săptămâna viitoare"
   */
  parseDate(text) {
    if (!text) return null;

    const normalized = text.trim();

    // Check for relative date keywords - REJECT these
    const relativeDateKeywords = [
      'maine', 'mâine', 'mâine',
      'azi', 'astazi', 'astăzi',
      'poimaine', 'poimâine', 'poimâine',
      'saptamana', 'săptămâna', 'săptămâna',
      'luna', 'lună',
      'vineri', 'sambata', 'sâmbătă', 'duminica', 'duminică',
      'luni', 'marti', 'marți', 'miercuri', 'joi',
    ];

    const normalizedLower = normalized.toLowerCase()
      .replace(/ă/g, 'a')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/ș/g, 's')
      .replace(/ț/g, 't');

    for (const keyword of relativeDateKeywords) {
      if (normalizedLower.includes(keyword)) {
        return {
          valid: false,
          error: 'relative_date',
          message: 'Te rog să specifici data exactă în format DD-MM-YYYY (ex: 15-01-2026)',
        };
      }
    }

    // Match DD-MM-YYYY format (allow 1-2 digits and normalize)
    const dateRegex = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;
    const match = normalized.match(dateRegex);

    if (!match) {
      return {
        valid: false,
        error: 'invalid_format',
        message: 'Data trebuie să fie în format DD-MM-YYYY (ex: 15-01-2026)',
      };
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    // Validate ranges
    if (day < 1 || day > 31) {
      return {
        valid: false,
        error: 'invalid_day',
        message: `Ziua trebuie să fie între 1 și 31. Ai introdus: ${day}`,
      };
    }

    if (month < 1 || month > 12) {
      return {
        valid: false,
        error: 'invalid_month',
        message: `Luna trebuie să fie între 1 și 12. Ai introdus: ${month}`,
      };
    }

    if (year < 2024 || year > 2030) {
      return {
        valid: false,
        error: 'invalid_year',
        message: `Anul trebuie să fie între 2024 și 2030. Ai introdus: ${year}`,
      };
    }

    // Validate actual date
    const dateObj = new Date(year, month - 1, day);
    if (
      dateObj.getDate() !== day ||
      dateObj.getMonth() !== month - 1 ||
      dateObj.getFullYear() !== year
    ) {
      return {
        valid: false,
        error: 'invalid_date',
        message: `Data ${day}-${month}-${year} nu este validă`,
      };
    }

    // Return normalized format DD-MM-YYYY
    const formattedDate = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;

    return {
      valid: true,
      date: formattedDate,
      day,
      month,
      year,
      dateObj,
    };
  }

  /**
   * Parse time from text
   * Accepts HH:mm format
   */
  parseTime(text) {
    if (!text) return null;

    const normalized = text.trim();

    let hours;
    let minutes;

    // HH:mm or HH.mm (minutes can be 1-2 digits, e.g. 14.5 -> 14:05)
    if (normalized.includes(':') || normalized.includes('.')) {
      const parts = normalized.split(/[:.]/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        hours = parseInt(parts[0], 10);
        minutes = parseInt(parts[1], 10);
      }
    } else {
      // HHmm or Hmm (e.g. 930 -> 9:30)
      const m = /^(\d{1,2})(\d{2})$/.exec(normalized);
      if (m) {
        hours = parseInt(m[1], 10);
        minutes = parseInt(m[2], 10);
      }
    }

    if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes)) {
      return {
        valid: false,
        error: 'invalid_format',
        message: 'Ora trebuie să fie în format HH:mm (ex: 14:00, 09:30)',
      };
    }

    // Validate ranges
    if (hours < 0 || hours > 23) {
      return {
        valid: false,
        error: 'invalid_hours',
        message: `Ora trebuie să fie între 0 și 23. Ai introdus: ${hours}`,
      };
    }

    if (minutes < 0 || minutes > 59) {
      return {
        valid: false,
        error: 'invalid_minutes',
        message: `Minutele trebuie să fie între 0 și 59. Ai introdus: ${minutes}`,
      };
    }

    // Return normalized format HH:mm
    const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    return {
      valid: true,
      time: formattedTime,
      hours,
      minutes,
    };
  }

  /**
   * Parse duration from text
   * Accepts various formats: "2 ore", "90 minute", "1.5 ore", "120", etc.
   */
  parseDuration(text) {
    if (!text) return null;

    const normalized = text.trim().toLowerCase()
      .replace(/ă/g, 'a')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/ș/g, 's')
      .replace(/ț/g, 't');

    // Direct number (assume minutes if < 10, otherwise minutes)
    const directNumber = /^(\d+)$/.exec(normalized);
    if (directNumber) {
      const num = parseInt(directNumber[1], 10);
      // If number is small (< 10), assume hours, otherwise minutes
      const minutes = num < 10 ? num * 60 : num;
      return {
        valid: true,
        minutes,
        hours: minutes / 60,
        formatted: this.formatDuration(minutes),
      };
    }

    // Hours patterns
    const hoursPatterns = [
      // Hours + minutes must be checked before "hours only"
      /(\d+)\s*(?:ora|ore)\s*(?:si|și)?\s*(\d+)\s*(?:minute|min)/i,
      /(\d+(?:[.,]\d+)?)\s*(?:ora|ore|hour|hours|h|hr|hrs)/i,
    ];

    for (const pattern of hoursPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        let minutes;
        if (match[2]) {
          // Hours and minutes
          minutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
        } else {
          // Just hours (can be decimal)
          const hours = parseFloat(match[1].replace(',', '.'));
          minutes = Math.round(hours * 60);
        }

        return {
          valid: true,
          minutes,
          hours: minutes / 60,
          formatted: this.formatDuration(minutes),
        };
      }
    }

    // Minutes patterns
    const minutesPatterns = [
      /(\d+)\s*(?:minute|min|m)/i,
    ];

    for (const pattern of minutesPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        const minutes = parseInt(match[1], 10);
        return {
          valid: true,
          minutes,
          hours: minutes / 60,
          formatted: this.formatDuration(minutes),
        };
      }
    }

    // Special cases
    if (/jumatate|jumătate|1\/2|0\.5|0,5/.test(normalized)) {
      if (/ora|ore|hour/.test(normalized)) {
        return {
          valid: true,
          minutes: 30,
          hours: 0.5,
          formatted: '30 minute',
        };
      }
    }

    return {
      valid: false,
      error: 'invalid_format',
      message: 'Durata trebuie să fie în format: "2 ore", "90 minute", "1.5 ore", sau "120"',
    };
  }

  /**
   * Format duration in human-readable Romanian
   */
  formatDuration(minutes) {
    if (!minutes) return '';

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0 && mins > 0) {
      return `${hours} ${hours === 1 ? 'oră' : 'ore'} și ${mins} ${mins === 1 ? 'minut' : 'minute'}`;
    } else if (hours > 0) {
      return `${hours} ${hours === 1 ? 'oră' : 'ore'}`;
    } else {
      return `${mins} ${mins === 1 ? 'minut' : 'minute'}`;
    }
  }

  /**
   * Extract phone number from text
   */
  parsePhone(text) {
    if (!text) return null;

    // Romanian phone patterns
    const phonePatterns = [
      /(\+?40\s?7\d{2}\s?\d{3}\s?\d{3})/,  // +40 7XX XXX XXX
      /(07\d{2}\s?\d{3}\s?\d{3})/,         // 07XX XXX XXX
      /(\+?40\s?7\d{8})/,                  // +407XXXXXXXX
      /(07\d{8})/,                         // 07XXXXXXXX
    ];

    for (const pattern of phonePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Normalize phone number
        let phone = match[1].replace(/\s/g, '');
        
        // Add +40 if missing
        if (!phone.startsWith('+')) {
          if (phone.startsWith('07')) {
            phone = '+4' + phone;
          } else if (phone.startsWith('40')) {
            phone = '+' + phone;
          }
        }

        return {
          valid: true,
          phone,
          formatted: this.formatPhone(phone),
        };
      }
    }

    return {
      valid: false,
      error: 'invalid_format',
      message: 'Numărul de telefon trebuie să fie în format: 07XX XXX XXX sau +40 7XX XXX XXX',
    };
  }

  /**
   * Format phone number for display
   */
  formatPhone(phone) {
    if (!phone) return '';

    // Remove all non-digits except +
    const cleaned = phone.replace(/[^\d+]/g, '');

    // Format as +40 7XX XXX XXX
    if (cleaned.startsWith('+407') && cleaned.length === 12) {
      return `+40 ${cleaned.substr(3, 3)} ${cleaned.substr(6, 3)} ${cleaned.substr(9, 3)}`;
    }

    return cleaned;
  }
}

module.exports = DateTimeParser;
