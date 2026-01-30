/**
 * Thread last-activity repair: derive lastMessageAt/lastMessageAtMs from message data.
 * Used by repairThreadsLastActivityForAccount (server.js) and by unit tests.
 *
 * @param {object} msgData - message document data (tsClient, createdAt, lastMessageTimestamp)
 * @param {{ firestore: { Timestamp: { fromMillis: (ms: number) => object } } }} admin - firebase-admin (for Timestamp.fromMillis)
 * @returns {{ lastMessageAt: object, lastMessageAtMs: number } | null}
 */
function deriveLastActivityFromMessage(msgData, admin) {
  if (!msgData || !admin?.firestore?.Timestamp) return null;
  let ms = null;
  if (msgData.tsClient && typeof msgData.tsClient.toMillis === 'function') {
    ms = msgData.tsClient.toMillis();
  } else if (msgData.createdAt && typeof msgData.createdAt.toMillis === 'function') {
    ms = msgData.createdAt.toMillis();
  } else if (typeof msgData.lastMessageTimestamp === 'number') {
    const n = msgData.lastMessageTimestamp;
    ms = n > 1000000000000 ? n : n * 1000;
  } else if (msgData.tsClient?._seconds !== undefined && msgData.tsClient?._seconds !== null) {
    ms = (msgData.tsClient._seconds || 0) * 1000;
  } else if (msgData.createdAt?._seconds !== undefined && msgData.createdAt?._seconds !== null) {
    ms = (msgData.createdAt._seconds || 0) * 1000;
  }
  if (ms === null || ms === undefined || ms <= 0) return null;
  return {
    lastMessageAt: admin.firestore.Timestamp.fromMillis(ms),
    lastMessageAtMs: ms,
  };
}

module.exports = {
  deriveLastActivityFromMessage,
};
