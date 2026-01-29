import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// Debug-only diagnostic: check Firestore for threads + messages (OK/EMPTY).
/// Use after backfill to separate backend vs UI issues.
class WhatsAppBackfillDiagnosticScreen extends StatefulWidget {
  final String accountId;

  const WhatsAppBackfillDiagnosticScreen({super.key, required this.accountId});

  @override
  State<WhatsAppBackfillDiagnosticScreen> createState() =>
      _WhatsAppBackfillDiagnosticScreenState();
}

class _WhatsAppBackfillDiagnosticScreenState
    extends State<WhatsAppBackfillDiagnosticScreen> {
  bool _loading = true;
  String? _error;
  int _threadCount = 0;
  int _threadsWithMessages = 0;
  static const int _maxThreads = 20;

  @override
  void initState() {
    super.initState();
    _runCheck();
  }

  Future<void> _runCheck() async {
    setState(() {
      _loading = true;
      _error = null;
      _threadCount = 0;
      _threadsWithMessages = 0;
    });

    try {
      final threadsSnap = await FirebaseFirestore.instance
          .collection('threads')
          .where('accountId', isEqualTo: widget.accountId)
          .limit(_maxThreads)
          .get();

      final threads = threadsSnap.docs;
      final threadIds = threads.map((d) => d.id).toList();
      int withMessages = 0;

      for (final tid in threadIds) {
        final msgSnap = await FirebaseFirestore.instance
            .collection('threads')
            .doc(tid)
            .collection('messages')
            .limit(1)
            .get();
        if (msgSnap.docs.isNotEmpty) withMessages++;
      }

      final n = threads.length;
      if (mounted) {
        setState(() {
          _loading = false;
          _threadCount = n;
          _threadsWithMessages = withMessages;
        });
      }
      debugPrint(
        '[BackfillDiagnostic] accountId=${widget.accountId} threads=$n threadsWithMessages=$withMessages',
      );
    } catch (e) {
      debugPrint('[BackfillDiagnostic] error: $e');
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Backfill diagnostic (debug)'),
        backgroundColor: Colors.orange,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('Error: $_error', style: TextStyle(color: Colors.red[700])),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _runCheck,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Account: ${widget.accountId}',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 16),
                      _row('Threads', _threadCount > 0 ? 'OK ($_threadCount)' : 'EMPTY (0)'),
                      const SizedBox(height: 8),
                      _row(
                        'Messages (sample)',
                        _threadsWithMessages > 0
                            ? 'OK ($_threadsWithMessages threads with messages)'
                            : 'EMPTY (no messages in any)',
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton.icon(
                        onPressed: _runCheck,
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('Refresh'),
                      ),
                    ],
                  ),
      ),
    );
  }

  Widget _row(String label, String value) {
    final isOk = value.startsWith('OK');
    return Row(
      children: [
        SizedBox(width: 160, child: Text(label)),
        Text(
          value,
          style: TextStyle(
            fontWeight: FontWeight.w600,
            color: isOk ? Colors.green : Colors.orange,
          ),
        ),
      ],
    );
  }
}
