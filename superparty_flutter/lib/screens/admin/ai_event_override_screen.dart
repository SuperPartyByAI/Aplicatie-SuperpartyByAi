import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'dart:convert';
import '../../core/auth/is_super_admin.dart';

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
  final _json = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _error;

  bool get _isSuperAdmin => isSuperAdmin(FirebaseAuth.instance.currentUser);

  DocumentReference<Map<String, dynamic>> get _publicRef => FirebaseFirestore.instance
      .collection('ai_config_overrides')
      .doc(widget.eventId);

  DocumentReference<Map<String, dynamic>> get _privateRef => FirebaseFirestore.instance
      .collection('ai_config_overrides_private')
      .doc(widget.eventId);

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
      final pubSnap = await _publicRef.get();
      final privSnap = await _privateRef.get();
      final pubData = pubSnap.data() ?? <String, dynamic>{};
      final privData = privSnap.data() ?? <String, dynamic>{};

      final pubOverrides = (pubData['overrides'] is Map)
          ? Map<String, dynamic>.from(pubData['overrides'] as Map)
          : <String, dynamic>{};
      final privOverrides = (privData['overrides'] is Map)
          ? Map<String, dynamic>.from(privData['overrides'] as Map)
          : <String, dynamic>{};

      final merged = <String, dynamic>{}..addAll(pubOverrides)..addAll(privOverrides);
      _json.text = const JsonEncoder.withIndent('  ').convert(merged);
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
      final overrides = jsonDecode(_json.text) as Map<String, dynamic>;
      final uid = FirebaseAuth.instance.currentUser?.uid;

      final pubSnap = await _publicRef.get();
      final privSnap = await _privateRef.get();
      final vPub = (pubSnap.data()?['version'] is num)
          ? (pubSnap.data()!['version'] as num).toInt()
          : 0;
      final vPriv = (privSnap.data()?['version'] is num)
          ? (privSnap.data()!['version'] as num).toInt()
          : 0;

      final publicOverrides = <String, dynamic>{};
      final privateOverrides = <String, dynamic>{};
      for (final entry in overrides.entries) {
        final k = entry.key;
        if (k == 'eventSchema' || k == 'rolesCatalog' || k == 'uiTemplates') {
          publicOverrides[k] = entry.value;
        } else {
          privateOverrides[k] = entry.value;
        }
      }

      await _publicRef.set(
        {
          'overrides': publicOverrides,
          'version': vPub + 1,
          'updatedAt': FieldValue.serverTimestamp(),
          'updatedBy': uid,
        },
        SetOptions(merge: true),
      );
      await _privateRef.set(
        {
          'overrides': privateOverrides,
          'version': vPriv + 1,
          'updatedAt': FieldValue.serverTimestamp(),
          'updatedBy': uid,
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

