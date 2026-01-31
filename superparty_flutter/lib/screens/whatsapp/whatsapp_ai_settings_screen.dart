import 'package:flutter/material.dart';

import '../../services/whatsapp_api_service.dart';

class WhatsAppAiSettingsScreen extends StatefulWidget {
  final String? accountId;

  const WhatsAppAiSettingsScreen({super.key, this.accountId});

  @override
  State<WhatsAppAiSettingsScreen> createState() => _WhatsAppAiSettingsScreenState();
}

class _WhatsAppAiSettingsScreenState extends State<WhatsAppAiSettingsScreen> with SingleTickerProviderStateMixin {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  late TabController _tabController;

  bool _enabled = false;
  bool _isSaving = false;
  bool _isLoading = true;

  // Text fields for each tab
  String _logicText = '';
  String _restrictionsText = '';
  String _pricingText = '';
  String _faqText = '';
  String _extractionText = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _loadSettings();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    final accountId = widget.accountId;
    if (accountId == null || accountId.isEmpty) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }
    try {
      final data = await _apiService.getAutoReplySettings(accountId: accountId);
      debugPrint('[AISettings] Received data: $data');
      
      if (mounted) {
        setState(() {
          _enabled = data['enabled'] == true;
          // Load specific fields or fallback to generic prompt for logic if empty
          _logicText = (data['logic']?.toString().isNotEmpty == true) 
              ? data['logic'].toString() 
              : (data['prompt']?.toString() ?? '');
          
          _restrictionsText = data['restrictions']?.toString() ?? '';
          _pricingText = data['pricing']?.toString() ?? '';
          _faqText = data['faq']?.toString() ?? '';
          _extractionText = data['extraction']?.toString() ?? '';
        });
      }
    } catch (e) {
      debugPrint('[AISettings] Error loading settings: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Eroare la încărcarea setărilor: $e')),
        );
      }
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
        prompt: _logicText.trim(), // Legacy generic prompt updated with logic
        logic: _logicText.trim(),
        restrictions: _restrictionsText.trim(),
        pricing: _pricingText.trim(),
        faq: _faqText.trim(),
        extraction: _extractionText.trim(),
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

  Widget _buildTabContent(String label, String hint, String value, Function(String) onChanged, {String? helperText}) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 8),
          Expanded(
            child: TextFormField(
              key: ValueKey(label), // Force rebuild on tab switch if needed, though TabBarView handles keepAlive
              initialValue: value,
              onChanged: onChanged,
              maxLines: null,
              expands: true,
              textAlignVertical: TextAlignVertical.top,
              decoration: InputDecoration(
                hintText: hint,
                helperText: helperText,
                helperMaxLines: 2,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final accountId = widget.accountId;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Setări AI'),
        backgroundColor: const Color(0xFF25D366),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: const [
            Tab(text: 'Logică'),
            Tab(text: 'Restricții'),
            Tab(text: 'Prețuri'),
            Tab(text: 'Memorie Client'),
            Tab(text: 'Extragere'),
          ],
        ),
      ),
      body: accountId == null || accountId.isEmpty
          ? const Center(child: Text('AccountId lipsă'))
          : _isLoading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: SwitchListTile(
                        value: _enabled,
                        title: const Text('AI activ'),
                        onChanged: (value) => setState(() => _enabled = value),
                      ),
                    ),
                    Expanded(
                      child: TabBarView(
                        controller: _tabController,
                        children: [
                          _buildTabContent(
                            'Logică / Personalitate',
                            'Ex: Ești asistent Superparty. Răspunzi politicos și scurt.',
                            _logicText,
                            (v) => _logicText = v,
                            helperText: 'Comportamentul general și tonul vocii.',
                          ),
                          _buildTabContent(
                            'Restricții (CE NU ARE VOIE)',
                            'Ex: - Nu dai numărul personal\n- Nu confirmi rezervări fără verificare',
                            _restrictionsText,
                            (v) => _restrictionsText = v,
                            helperText: 'Reguli stricte pe care AI-ul trebuie să le respecte.',
                          ),
                          _buildTabContent(
                            'Prețuri & Informații Business',
                            'Ex: - Pachet Basic: 500 RON\n- Program: Luni-Vineri 9-17',
                            _pricingText,
                            (v) => _pricingText = v,
                            helperText: 'Sursa de adevăr pentru prețuri și servicii.',
                          ),
                          _buildTabContent(
                            'Memorie Client / Instrucțiuni Creier',
                            'Ex: "Reține tot ce zice clientul despre preferințe..."',
                            _faqText,
                            (v) => _faqText = v,
                            helperText: 'Răspunsuri specifice la întrebări comune.',
                          ),
                          _buildTabContent(
                            'Extragere Date Clienți',
                            'Ex: Colectează: Nume, Telefon, Data evenimentului.',
                            _extractionText,
                            (v) => _extractionText = v,
                            helperText: 'Ce informații să încerce să afle de la client.',
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _isSaving ? null : () => _saveSettings(accountId),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            backgroundColor: const Color(0xFF25D366),
                            foregroundColor: Colors.white,
                          ),
                          child: _isSaving
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Text('Salvează Setările', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}
