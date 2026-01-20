async function resolveCanonicalJid(sock, jid) {
  const rawJid = jid || null;
  let canonicalJid = rawJid;
  let resolvedContact = null;

  if (rawJid && rawJid.endsWith('@lid') && sock && typeof sock.onWhatsApp === 'function') {
    try {
      const [contact] = await sock.onWhatsApp(rawJid);
      resolvedContact = contact || null;
      if (contact?.jid && contact.jid !== rawJid) {
        canonicalJid = contact.jid;
      }
    } catch (_err) {
      // Best-effort resolution only
    }
  }

  return { rawJid, canonicalJid, resolvedContact };
}

module.exports = {
  resolveCanonicalJid,
};
