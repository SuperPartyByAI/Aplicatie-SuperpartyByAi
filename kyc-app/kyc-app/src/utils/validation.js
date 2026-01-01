// Validări pentru formulare

// Helper functions pentru teste simple
export function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPassword(password) {
  if (!password) return false;
  return password.length >= 6;
}

export function isValidCNP(cnp) {
  if (!cnp) return false;
  if (cnp.length !== 13) return false;
  if (!/^\d{13}$/.test(cnp)) return false;
  return true;
}

export function validatePassword(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push('Parola trebuie să aibă minim 8 caractere');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Parola trebuie să conțină cel puțin o literă mare');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Parola trebuie să conțină cel puțin o cifră');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateCNP(cnp) {
  if (!cnp || cnp.length !== 13) {
    return { isValid: false, error: 'CNP-ul trebuie să aibă 13 cifre' };
  }

  if (!/^\d{13}$/.test(cnp)) {
    return { isValid: false, error: 'CNP-ul trebuie să conțină doar cifre' };
  }

  // Validare algoritm CNP
  const controlKey = '279146358279';
  let sum = 0;

  for (let i = 0; i < 12; i++) {
    sum += parseInt(cnp[i]) * parseInt(controlKey[i]);
  }

  const controlDigit = sum % 11 === 10 ? 1 : sum % 11;

  if (controlDigit !== parseInt(cnp[12])) {
    return { isValid: false, error: 'CNP invalid (cifră de control greșită)' };
  }

  // Validare dată naștere
  const month = parseInt(cnp.substring(3, 5));
  const day = parseInt(cnp.substring(5, 7));

  if (month < 1 || month > 12) {
    return { isValid: false, error: 'CNP invalid (lună invalidă)' };
  }

  if (day < 1 || day > 31) {
    return { isValid: false, error: 'CNP invalid (zi invalidă)' };
  }

  return { isValid: true };
}

export function validateIBAN(iban) {
  // Elimină spații
  const cleanIBAN = iban.replace(/\s/g, '').toUpperCase();

  // Verifică format RO + 24 caractere
  if (!cleanIBAN.startsWith('RO')) {
    return { isValid: false, error: 'IBAN-ul trebuie să înceapă cu RO' };
  }

  if (cleanIBAN.length !== 24) {
    return { isValid: false, error: 'IBAN-ul românesc trebuie să aibă 24 caractere' };
  }

  // Verifică dacă conține doar litere și cifre
  if (!/^[A-Z0-9]+$/.test(cleanIBAN)) {
    return { isValid: false, error: 'IBAN-ul conține caractere invalide' };
  }

  // Validare algoritm IBAN (mod 97)
  const rearranged = cleanIBAN.substring(4) + cleanIBAN.substring(0, 4);
  const numericIBAN = rearranged.replace(/[A-Z]/g, char => char.charCodeAt(0) - 55);

  // Calculează mod 97 pentru numere mari
  let remainder = numericIBAN;
  while (remainder.length > 2) {
    const block = remainder.substring(0, 9);
    remainder = (parseInt(block) % 97) + remainder.substring(block.length);
  }

  if (parseInt(remainder) % 97 !== 1) {
    return { isValid: false, error: 'IBAN invalid (cifră de control greșită)' };
  }

  return { isValid: true, formatted: cleanIBAN };
}

export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Email invalid' };
  }

  return { isValid: true };
}

export function validatePhone(phone) {
  // Elimină spații, +, -, (, )
  const cleanPhone = phone.replace(/[\s+\-()]/g, '');

  // Verifică dacă are 10 cifre (format românesc)
  if (!/^0\d{9}$/.test(cleanPhone)) {
    return { isValid: false, error: 'Număr de telefon invalid (format: 07XXXXXXXX)' };
  }

  return { isValid: true, formatted: cleanPhone };
}
