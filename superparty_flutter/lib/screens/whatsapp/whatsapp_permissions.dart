bool canSendToThread({
  required String? currentUid,
  required bool isSuperAdmin,
  required String? ownerUid,
  required List<String> coWriterUids,
  required bool locked,
}) {
  if (isSuperAdmin) return true;
  if (currentUid == null || currentUid.isEmpty) return false;
  if (locked) return false;
  if (ownerUid != null && ownerUid == currentUid) return true;
  return coWriterUids.contains(currentUid);
}

