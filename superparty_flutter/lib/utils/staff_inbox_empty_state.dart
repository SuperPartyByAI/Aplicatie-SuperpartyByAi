/// Logic for when to show the "re-pair to import conversations" callout in Staff Inbox.
/// Shown only when there are connected (allowed) accounts but zero conversations.
bool showRepairCallout(int allowedConnectedCount, int threadCount) {
  return allowedConnectedCount > 0 && threadCount == 0;
}
