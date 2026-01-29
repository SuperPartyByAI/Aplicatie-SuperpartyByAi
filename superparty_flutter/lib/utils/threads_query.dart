import 'package:cloud_firestore/cloud_firestore.dart';

/// Canonical Firestore query for threads list. Matches index:
/// threads: accountId ASC + lastMessageAt DESC (COLLECTION).
/// No other where/orderBy, no whereIn, no collectionGroup.
Query<Map<String, dynamic>> buildThreadsQuery(String accountId) {
  return FirebaseFirestore.instance
      .collection('threads')
      .where('accountId', isEqualTo: accountId)
      .orderBy('lastMessageAt', descending: true)
      .limit(200);
}
