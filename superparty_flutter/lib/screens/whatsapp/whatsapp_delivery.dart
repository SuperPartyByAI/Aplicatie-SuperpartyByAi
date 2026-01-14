import 'package:flutter/material.dart';

/// Maps server-side delivery states to UI icons/colors.
///
/// Canonical values: queued|sent|delivered|read|failed
IconData? deliveryIconData(String delivery) {
  switch (delivery) {
    case 'failed':
      return Icons.error_outline;
    case 'read':
      return Icons.done_all;
    case 'delivered':
      return Icons.done_all;
    case 'sent':
      return Icons.check;
    default:
      return null;
  }
}

Color? deliveryIconColor(String delivery) {
  switch (delivery) {
    case 'failed':
      return Colors.red;
    case 'read':
      return Colors.blue;
    case 'delivered':
      return Colors.black54;
    case 'sent':
      return Colors.black54;
    default:
      return null;
  }
}

