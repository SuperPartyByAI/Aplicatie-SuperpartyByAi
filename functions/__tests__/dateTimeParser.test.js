'use strict';

const DateTimeParser = require('../dateTimeParser');

describe('DateTimeParser', () => {
  let parser;

  beforeEach(() => {
    parser = new DateTimeParser();
  });

  describe('parseDate', () => {
    it('should parse valid DD-MM-YYYY format', () => {
      const result = parser.parseDate('15-01-2026');
      
      expect(result.valid).toBe(true);
      expect(result.date).toBe('15-01-2026');
      expect(result.day).toBe(15);
      expect(result.month).toBe(1);
      expect(result.year).toBe(2026);
    });

    it('should accept different separators', () => {
      expect(parser.parseDate('15-01-2026').valid).toBe(true);
      expect(parser.parseDate('15/01/2026').valid).toBe(true);
      expect(parser.parseDate('15.01.2026').valid).toBe(true);
    });

    it('should normalize to DD-MM-YYYY format', () => {
      expect(parser.parseDate('5-1-2026').date).toBe('05-01-2026');
      expect(parser.parseDate('15/1/2026').date).toBe('15-01-2026');
    });

    it('should reject relative dates', () => {
      const result = parser.parseDate('mâine');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('relative_date');
    });

    it('should reject "azi", "astăzi"', () => {
      expect(parser.parseDate('azi').valid).toBe(false);
      expect(parser.parseDate('astăzi').valid).toBe(false);
    });

    it('should reject "săptămâna viitoare"', () => {
      const result = parser.parseDate('săptămâna viitoare');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('relative_date');
    });

    it('should reject day names', () => {
      expect(parser.parseDate('vineri').valid).toBe(false);
      expect(parser.parseDate('sâmbătă').valid).toBe(false);
      expect(parser.parseDate('duminică').valid).toBe(false);
    });

    it('should reject invalid day', () => {
      const result = parser.parseDate('32-01-2026');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_day');
    });

    it('should reject invalid month', () => {
      const result = parser.parseDate('15-13-2026');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_month');
    });

    it('should reject invalid year', () => {
      expect(parser.parseDate('15-01-2020').valid).toBe(false);
      expect(parser.parseDate('15-01-2035').valid).toBe(false);
    });

    it('should reject invalid dates (e.g., 31 Feb)', () => {
      const result = parser.parseDate('31-02-2026');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_date');
    });

    it('should accept leap year dates', () => {
      const result = parser.parseDate('29-02-2024');
      
      expect(result.valid).toBe(true);
    });

    it('should reject non-leap year Feb 29', () => {
      const result = parser.parseDate('29-02-2025');
      
      expect(result.valid).toBe(false);
    });
  });

  describe('parseTime', () => {
    it('should parse valid HH:mm format', () => {
      const result = parser.parseTime('14:30');
      
      expect(result.valid).toBe(true);
      expect(result.time).toBe('14:30');
      expect(result.hours).toBe(14);
      expect(result.minutes).toBe(30);
    });

    it('should accept different separators', () => {
      expect(parser.parseTime('14:30').valid).toBe(true);
      expect(parser.parseTime('14.30').valid).toBe(true);
      expect(parser.parseTime('1430').valid).toBe(true);
    });

    it('should normalize to HH:mm format', () => {
      expect(parser.parseTime('9:30').time).toBe('09:30');
      expect(parser.parseTime('14.5').time).toBe('14:05');
    });

    it('should reject invalid hours', () => {
      const result = parser.parseTime('25:00');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_hours');
    });

    it('should reject invalid minutes', () => {
      const result = parser.parseTime('14:60');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_minutes');
    });

    it('should accept midnight and noon', () => {
      expect(parser.parseTime('00:00').valid).toBe(true);
      expect(parser.parseTime('12:00').valid).toBe(true);
      expect(parser.parseTime('23:59').valid).toBe(true);
    });
  });

  describe('parseDuration', () => {
    it('should parse hours', () => {
      expect(parser.parseDuration('2 ore').minutes).toBe(120);
      expect(parser.parseDuration('1 oră').minutes).toBe(60);
      expect(parser.parseDuration('3h').minutes).toBe(180);
    });

    it('should parse minutes', () => {
      expect(parser.parseDuration('90 minute').minutes).toBe(90);
      expect(parser.parseDuration('30 min').minutes).toBe(30);
      expect(parser.parseDuration('45m').minutes).toBe(45);
    });

    it('should parse decimal hours', () => {
      expect(parser.parseDuration('1.5 ore').minutes).toBe(90);
      expect(parser.parseDuration('2,5 ore').minutes).toBe(150);
    });

    it('should parse hours and minutes', () => {
      expect(parser.parseDuration('2 ore si 30 minute').minutes).toBe(150);
      expect(parser.parseDuration('1 oră și 15 minute').minutes).toBe(75);
    });

    it('should parse direct numbers', () => {
      expect(parser.parseDuration('120').minutes).toBe(120);
      expect(parser.parseDuration('90').minutes).toBe(90);
      expect(parser.parseDuration('2').minutes).toBe(120); // < 10 = hours
    });

    it('should format duration correctly', () => {
      expect(parser.parseDuration('2 ore').formatted).toBe('2 ore');
      expect(parser.parseDuration('90 minute').formatted).toBe('1 oră și 30 minute');
      expect(parser.parseDuration('30 minute').formatted).toBe('30 minute');
    });
  });

  describe('formatDuration', () => {
    it('should format hours only', () => {
      expect(parser.formatDuration(60)).toBe('1 oră');
      expect(parser.formatDuration(120)).toBe('2 ore');
      expect(parser.formatDuration(180)).toBe('3 ore');
    });

    it('should format minutes only', () => {
      expect(parser.formatDuration(30)).toBe('30 minute');
      expect(parser.formatDuration(45)).toBe('45 minute');
      expect(parser.formatDuration(1)).toBe('1 minut');
    });

    it('should format hours and minutes', () => {
      expect(parser.formatDuration(90)).toBe('1 oră și 30 minute');
      expect(parser.formatDuration(150)).toBe('2 ore și 30 minute');
      expect(parser.formatDuration(75)).toBe('1 oră și 15 minute');
    });
  });

  describe('parsePhone', () => {
    it('should parse Romanian phone numbers', () => {
      expect(parser.parsePhone('0712345678').valid).toBe(true);
      expect(parser.parsePhone('+40712345678').valid).toBe(true);
      expect(parser.parsePhone('0712 345 678').valid).toBe(true);
      expect(parser.parsePhone('+40 712 345 678').valid).toBe(true);
    });

    it('should normalize phone numbers', () => {
      const result = parser.parsePhone('0712345678');
      
      expect(result.valid).toBe(true);
      expect(result.phone).toBe('+40712345678');
    });

    it('should format phone numbers', () => {
      const result = parser.parsePhone('0712345678');
      
      expect(result.formatted).toBe('+40 712 345 678');
    });

    it('should reject invalid phone numbers', () => {
      expect(parser.parsePhone('123456').valid).toBe(false);
      expect(parser.parsePhone('0612345678').valid).toBe(false); // Not 07XX
      expect(parser.parsePhone('+41712345678').valid).toBe(false); // Not +40
    });
  });

  describe('formatPhone', () => {
    it('should format phone numbers', () => {
      expect(parser.formatPhone('+40712345678')).toBe('+40 712 345 678');
      expect(parser.formatPhone('0712345678')).toBe('0712345678'); // Not normalized
    });

    it('should handle empty input', () => {
      expect(parser.formatPhone('')).toBe('');
      expect(parser.formatPhone(null)).toBe('');
    });
  });
});
