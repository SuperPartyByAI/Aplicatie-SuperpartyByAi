async function resolveCanonicalJid(sock, jid) {
  const rawJid = jid || null;
  let canonicalJid = rawJid;
  let resolvedContact = null;

  if (rawJid && rawJid.endsWith('@lid') && sock) {
    if (typeof sock.onWhatsApp === 'function') {
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

    if (canonicalJid === rawJid) {
      const contactsSource = sock.contacts || sock.store?.contacts || null;
      if (contactsSource) {
        const contacts = Array.isArray(contactsSource)
          ? contactsSource
          : Object.values(contactsSource);
        const match = contacts.find((contact) => {
          const contactJid = contact?.jid || contact?.id || null;
          const contactLid = contact?.lid || contact?.lidJid || contact?.lid_id || null;
          return contactLid === rawJid || contactJid === rawJid;
        });
        if (match) {
          const matchJid = match?.jid || match?.id || null;
          if (matchJid && matchJid !== rawJid) {
            canonicalJid = matchJid;
            resolvedContact = resolvedContact || match;
          }
        }
      }
    }
  }

  return { rawJid, canonicalJid, resolvedContact };
}

module.exports = {
  resolveCanonicalJid,
};
