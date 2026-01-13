import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'dart:convert';

class AiEventOverrideScreen extends StatefulWidget {
  final String eventId;

  const AiEventOverrideScreen({
    super.key,
    required this.eventId,
  });

  @override
  State<AiEventOverrideScreen> createState() => _AiEventOverrideScreenState();
}

class _AiEventOverrideScreenState extends State<AiEventOverrideScreen> {
  static const _superAdminEmail = 'ursache.andrei1995@gmail.com';

  final _json = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _error;

  bool get _isSuperAdmin =>
      (FirebaseAuth.instance.currentUser?.email ?? '') == _superAdminEmail;

  DocumentReference<Map<String, dynamic>> get _ref => FirebaseFirestore.instance
      .collection('evenimente')
      .doc(widget.eventId)
      .collection('ai_overrides')
      .doc('current');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final snap = await _ref.get();
      final data = snap.data() ?? <String, dynamic>{};
      final overrides = (data['overrides'] is Map)
          ? Map<String, dynamic>.from(data['overrides'] as Map)
          : <String, dynamic>{};
      _json.text = const JsonEncoder.withIndent('  ').convert(overrides);
    } catch (e) {
      _error = e.toString();
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (!_isSuperAdmin) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final snap = await _ref.get();
      final currentVersion = (snap.data()?['version'] is num)
          ? (snap.data()!['version'] as num).toInt()
          : 0;

      final overrides = jsonDecode(_json.text) as Map<String, dynamic>;

      await _ref.set(
        {
          'overrides': overrides,
          'version': currentVersion + 1,
          'updatedAt': FieldValue.serverTimestamp(),
          'updatedBy': FirebaseAuth.instance.currentUser?.uid,
        },
        SetOptions(merge: true),
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Salvat override pentru eveniment')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (!mounted) return;
      setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _json.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canEdit = _isSuperAdmin;
    return Scaffold(
      appBar: AppBar(
        title: Text('AI Override (${widget.eventId})'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            onPressed: (!canEdit || _saving || _loading) ? null : _save,
            icon: const Icon(Icons.save),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (!canEdit)
                    const Text(
                      'Doar super-admin poate edita override.',
                      style: TextStyle(color: Colors.red),
                    ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(_error!, style: const TextStyle(color: Colors.red)),
                    ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: TextField(
                      controller: _json,
                      decoration: const InputDecoration(
                        labelText: 'ai_overrides/current.overrides (JSON)',
                        alignLabelWithHint: true,
                      ),
                      enabled: canEdit,
                      maxLines: null,
                      expands: true,
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

