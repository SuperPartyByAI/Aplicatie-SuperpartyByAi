const DEFAULT_COUNTRY_CALLING_CODES = {
  RO: '40',
};

function getDefaultCallingCode() {
  const envCallingCode = process.env.DEFAULT_CALLING_CODE;
  const countryCode = process.env.DEFAULT_COUNTRY;
  return envCallingCode || (countryCode ? DEFAULT_COUNTRY_CALLING_CODES[countryCode] : null);
}

function normalizeJidToE164(rawJid, defaultCallingCode = getDefaultCallingCode()) {
  if (!rawJid) {
    return { rawJid: rawJid || null, normalizedPhone: null };
  }

  const raw = String(rawJid);
  // LID-based identifiers are not real phone numbers
  if (raw.includes('@lid')) {
    return { rawJid: raw, normalizedPhone: null };
  }
  const jidPart = raw.includes('@') ? raw.split('@')[0] : raw;

  if (jidPart.startsWith('+')) {
    return { rawJid: raw, normalizedPhone: jidPart };
  }

  let digits = jidPart.replace(/\D/g, '');
  if (!digits) {
    return { rawJid: raw, normalizedPhone: null };
  }
  // E.164 max length is 15 digits
  if (digits.length > 15) {
    return { rawJid: raw, normalizedPhone: null };
  }

  if (digits.startsWith('0') && defaultCallingCode) {
    digits = `${defaultCallingCode}${digits.slice(1)}`;
  }

  return {
    rawJid: raw,
    normalizedPhone: `+${digits}`,
  };
}

function resolveDisplayName(contact) {
  if (!contact) return null;
  return (
    contact.displayName ||
    contact.name ||
    contact.notify ||
    contact.verifiedName ||
    contact.subject ||
    null
  );
}

module.exports = {
  normalizeJidToE164,
  resolveDisplayName,
};
