import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

import '../../services/firebase_service.dart';

const _kMaxTemplateLength = 20000;

/// Admin-only screen to edit AI prompts stored in Firestore (app_config/ai_prompts).
/// Functions use these prompts at runtime via prompt_config.
class AiPromptsScreen extends StatefulWidget {
  const AiPromptsScreen({super.key});

  @override
  State<AiPromptsScreen> createState() => _AiPromptsScreenState();
}

class _AiPromptsScreenState extends State<AiPromptsScreen> {
  final _extractSystem = TextEditingController();
  final _extractUser = TextEditingController();
  final _crmSystem = TextEditingController();
  final _crmUser = TextEditingController();

  bool _isSaving = false;
  String? _error;
  bool _initialLoadApplied = false;

  @override
  void dispose() {
    _extractSystem.dispose();
    _extractUser.dispose();
    _crmSystem.dispose();
    _crmUser.dispose();
    super.dispose();
  }

  void _applySnapshot(DocumentSnapshot<Map<String, dynamic>>? snap) {
    if (!mounted) return;
    final data = snap?.data();
    _extractSystem.text = data?['whatsappExtractEvent_system'] as String? ?? '';
    _extractUser.text = data?['whatsappExtractEvent_userTemplate'] as String? ?? '';
    _crmSystem.text = data?['clientCrmAsk_system'] as String? ?? '';
    _crmUser.text = data?['clientCrmAsk_userTemplate'] as String? ?? '';
  }

  Future<void> _save() async {
    final sysExtract = _extractSystem.text.trim();
    final sysCrm = _crmSystem.text.trim();
    if (sysExtract.isEmpty) {
      setState(() => _error = 'System prompt (Extract Event) nu poate fi gol.');
      return;
    }
    if (sysCrm.isEmpty) {
      setState(() => _error = 'System prompt (CRM Ask) nu poate fi gol.');
      return;
    }
    if (_extractUser.text.length > _kMaxTemplateLength ||
        _crmUser.text.length > _kMaxTemplateLength) {
      setState(() => _error = 'Template-urile nu pot depăși $_kMaxTemplateLength caractere.');
      return;
    }
    setState(() {
      _error = null;
      _isSaving = true;
    });
    try {
      final ref = FirebaseService.firestore.collection('app_config').doc('ai_prompts');
      final snap = await ref.get();
      final version = ((snap.data()?['version']) as int?) ?? 0;
      await ref.set({
        'whatsappExtractEvent_system': sysExtract,
        'whatsappExtractEvent_userTemplate': _extractUser.text.trim(),
        'clientCrmAsk_system': sysCrm,
        'clientCrmAsk_userTemplate': _crmUser.text.trim(),
        'updatedAt': FieldValue.serverTimestamp(),
        'version': version + 1,
      }, SetOptions(merge: true));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Prompturi salvate.')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _isSaving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Eroare: $e'), backgroundColor: Colors.red),
      );
      return;
    }
    if (mounted) setState(() => _isSaving = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Prompts'),
        backgroundColor: const Color(0xFFEF4444),
      ),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: FirebaseService.firestore.collection('app_config').doc('ai_prompts').snapshots(),
        builder: (context, ss) {
          if (ss.connectionState == ConnectionState.waiting && !ss.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          if (ss.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Eroare: ${ss.error}', style: TextStyle(color: Colors.red[700])),
              ),
            );
          }
          if (ss.hasData && !_initialLoadApplied) {
            _initialLoadApplied = true;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _applySnapshot(ss.data);
            });
          }
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(_error!, style: TextStyle(color: Colors.red[700])),
                  ),
                  const SizedBox(height: 16),
                ],
                _buildSection(
                  'WhatsApp Extract Event',
                  systemController: _extractSystem,
                  userController: _extractUser,
                  userHint: 'Placeholdere: {{conversation_text}}, {{phone_e164}}',
                ),
                const SizedBox(height: 24),
                _buildSection(
                  'Client CRM Ask',
                  systemController: _crmSystem,
                  userController: _crmUser,
                  userHint: 'Placeholdere: {{client_json}}, {{events_json}}, {{question}}',
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _isSaving ? null : _save,
                  icon: _isSaving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save),
                  label: Text(_isSaving ? 'Se salvează…' : 'Salvează'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFEF4444),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSection(
    String title, {
    required TextEditingController systemController,
    required TextEditingController userController,
    required String userHint,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text('System', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 4),
        TextField(
          controller: systemController,
          maxLines: 12,
          maxLength: _kMaxTemplateLength,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText: 'System prompt',
          ),
        ),
        const SizedBox(height: 12),
        Text('User template', style: Theme.of(context).textTheme.labelLarge),
        if (kDebugMode) ...[
          const SizedBox(height: 2),
          Text(userHint, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey)),
        ],
        const SizedBox(height: 4),
        TextField(
          controller: userController,
          maxLines: 8,
          maxLength: _kMaxTemplateLength,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText: 'User prompt template',
          ),
        ),
      ],
    );
  }
}
