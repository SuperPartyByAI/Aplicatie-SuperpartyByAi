import 'package:cloud_firestore/cloud_firestore.dart';

/// Canonical Firestore query for threads list. Matches index:
/// threads: accountId ASC + lastMessageAt DESC (COLLECTION).
/// No other where/orderBy, no whereIn, no collectionGroup.
/// Limit 1000 so more clients appear (old limit 200 hid many conversations).
Query<Map<String, dynamic>> buildThreadsQuery(String accountId) {
  return FirebaseFirestore.instance
      .collection('threads')
      .where('accountId', isEqualTo: accountId)
      .orderBy('lastMessageAt', descending: true)
      .limit(1000);
}
