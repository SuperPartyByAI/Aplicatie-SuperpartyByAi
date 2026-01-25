import 'package:flutter/material.dart';

import '../../services/whatsapp_api_service.dart';

class WhatsAppAiSettingsScreen extends StatefulWidget {
  final String? accountId;

  const WhatsAppAiSettingsScreen({super.key, this.accountId});

  @override
  State<WhatsAppAiSettingsScreen> createState() => _WhatsAppAiSettingsScreenState();
}

class _WhatsAppAiSettingsScreenState extends State<WhatsAppAiSettingsScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  final TextEditingController _promptController = TextEditingController();
  bool _enabled = false;
  bool _isSaving = false;
  bool _isLoading = true;

  @override
  void dispose() {
    _promptController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final accountId = widget.accountId;
    if (accountId == null || accountId.isEmpty) {
      setState(() => _isLoading = false);
      return;
    }
    try {
      final data = await _apiService.getAutoReplySettings(accountId: accountId);
      setState(() {
        _enabled = data['enabled'] == true;
        _promptController.text = data['prompt']?.toString() ?? '';
        _promptController.selection = TextSelection.collapsed(
          offset: _promptController.text.length,
        );
      });
    } catch (_) {
      // Fail silently; user can still save.
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSettings(String accountId) async {
    setState(() => _isSaving = true);
    try {
      await _apiService.setAutoReplySettings(
        accountId: accountId,
        enabled: _enabled,
        prompt: _promptController.text.trim(),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Setările AI au fost salvate')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Eroare la salvare: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accountId = widget.accountId;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Setări AI'),
        backgroundColor: const Color(0xFF25D366),
      ),
      body: accountId == null || accountId.isEmpty
          ? const Center(child: Text('AccountId lipsă'))
          : _isLoading
              ? const Center(child: CircularProgressIndicator())
              : Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SwitchListTile(
                        value: _enabled,
                        title: const Text('AI activ'),
                        onChanged: (value) => setState(() => _enabled = value),
                      ),
                      const SizedBox(height: 12),
                      const Text('Logică / Prompt'),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _promptController,
                        maxLines: 6,
                        decoration: InputDecoration(
                          hintText: 'Ex: Răspunde politicos, scurt și clar în română.',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _isSaving ? null : () => _saveSettings(accountId),
                          child: _isSaving
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Text('Salvează'),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}
