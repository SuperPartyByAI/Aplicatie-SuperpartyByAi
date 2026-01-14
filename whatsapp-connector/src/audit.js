const crypto = require('crypto');
const { getDb, getAdmin } = require('./firestore');

const COL_AUDIT = 'whatsapp_audit';

function auditId() {
  return `audit_${crypto.randomUUID()}`;
}

async function writeAudit({
  actorUid,
  actorEmail,
  action,
  accountId = null,
  threadId = null,
  target = null,
  requestId = null,
  allowReadBySuperAdminOnly = true, // reserved for future policy
  meta = null,
}) {
  const db = getDb();
  const admin = getAdmin();

  const id = auditId();
  await db.collection(COL_AUDIT).doc(id).set({
    auditId: id,
    actorUid: actorUid || null,
    actorEmail: actorEmail || null,
    action: action || null,
    accountId,
    threadId,
    target,
    requestId,
    meta,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    _policy: allowReadBySuperAdminOnly ? 'super_admin_only' : 'internal',
  });
  return { auditId: id };
}

module.exports = {
  writeAudit,
};

