import 'package:cloud_firestore/cloud_firestore.dart';

/// Canonical Firestore query for threads list.
///
/// Index: `threads` collection, `accountId` ASC + `lastMessageAt` DESC (see firestore.indexes.json).
/// No other where/orderBy, no whereIn, no collectionGroup.
///
/// `lastMessageAt` is the canonical "last activity" field, updated for both inbound and outbound
/// (see message_persist.js, updateThreadLastMessageForOutbound). Ordering by it reflects WhatsApp
/// phone order: thread with most recent message (inbound or outbound) first. Limit 1000 so enough
/// conversations appear; top-N is correct because orderBy reflects last activity.
Query<Map<String, dynamic>> buildThreadsQuery(String accountId) {
  return FirebaseFirestore.instance
      .collection('threads')
      .where('accountId', isEqualTo: accountId)
      .orderBy('lastMessageAt', descending: true)
      .limit(100);
}
