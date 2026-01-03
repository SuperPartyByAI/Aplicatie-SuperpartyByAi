import { createWorker } from 'tesseract.js';

/**
 * Extrage text din imagine folosind Tesseract OCR (GRATIS, client-side)
 * @param {File} imageFile - Fișier imagine
 * @returns {Promise<string>} - Text extras
 */
export async function extractTextFromImage(imageFile) {
  const worker = await createWorker('ron'); // Română

  try {
    const {
      data: { text },
    } = await worker.recognize(imageFile);
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Parsează text extras din CI și structurează datele
 * @param {string} frontText - Text din CI față
 * @param {string} backText - Text din CI verso
 * @returns {Object} - Date structurate
 */
export function parseIdText(frontText, backText) {
  const data = {
    fullName: '',
    cnp: '',
    gender: '',
    address: '',
    series: '',
    number: '',
    issuedAt: '',
    expiresAt: '',
  };

  const allText = frontText + '\n' + backText;

  // Extrage CNP (13 cifre consecutive)
  const cnpMatch = allText.match(/\b(\d{13})\b/);
  if (cnpMatch) {
    data.cnp = cnpMatch[1];
    // Determină sex din CNP (prima cifră: 1/5=M, 2/6=F)
    const firstDigit = data.cnp[0];
    data.gender = ['1', '5'].includes(firstDigit) ? 'M' : 'F';
  }

  // Extrage serie + număr (ex: RX 123456)
  const seriesMatch = allText.match(/\b([A-Z]{2})\s*(\d{6})\b/);
  if (seriesMatch) {
    data.series = seriesMatch[1];
    data.number = seriesMatch[2];
  }

  // Extrage nume (de obicei pe prima linie sau după "Nume:")
  const nameMatch = allText.match(/(?:Nume[:\s]*)?([A-ZĂÂÎȘȚ\s]{10,})/);
  if (nameMatch) {
    data.fullName = nameMatch[1].trim();
  }

  // Extrage adresă (după "Domiciliu:" sau "Adresa:")
  const addressMatch = allText.match(/(?:Domiciliu|Adresa)[:\s]*(.+?)(?:\n|$)/i);
  if (addressMatch) {
    data.address = addressMatch[1].trim();
  }

  // Extrage date (format DD.MM.YYYY sau DD/MM/YYYY)
  const dateMatches = allText.match(/(\d{2}[.\/]\d{2}[.\/]\d{4})/g);
  if (dateMatches && dateMatches.length >= 2) {
    // Prima dată = emitere, a doua = expirare
    data.issuedAt = convertDateToISO(dateMatches[0]);
    data.expiresAt = convertDateToISO(dateMatches[1]);
  }

  return data;
}

/**
 * Convertește dată din DD.MM.YYYY în YYYY-MM-DD
 */
function convertDateToISO(dateStr) {
  const parts = dateStr.split(/[.\/]/);
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return '';
}

/**
 * Calculează confidence score pentru datele extrase
 * @param {Object} data - Date extrase
 * @returns {number} - Score 0-1
 */
export function calculateConfidence(data) {
  let score = 0;
  const weights = {
    cnp: 0.3, // Cel mai important
    fullName: 0.2,
    series: 0.15,
    number: 0.15,
    address: 0.1,
    issuedAt: 0.05,
    expiresAt: 0.05,
  };

  for (const [field, weight] of Object.entries(weights)) {
    if (data[field] && data[field].length > 0) {
      // Validări suplimentare
      if (field === 'cnp' && data[field].length === 13) score += weight;
      else if (field === 'series' && data[field].length === 2) score += weight;
      else if (field === 'number' && data[field].length === 6) score += weight;
      else if (field === 'fullName' && data[field].length >= 5) score += weight;
      else if (data[field].length > 0) score += weight * 0.5;
    }
  }

  return score;
}
