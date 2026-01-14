import 'package:flutter/material.dart';

/// Evidence Screen - placeholder minimal pentru compilare
class EvidenceScreen extends StatelessWidget {
  final String eventId;

  const EvidenceScreen({
    super.key,
    required this.eventId,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Evidence'),
      ),
      body: Center(
        child: Text('Event: $eventId'),
      ),
    );
  }
}
