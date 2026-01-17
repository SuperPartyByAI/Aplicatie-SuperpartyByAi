import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/whatsapp_api_service.dart';

/// Client Profile Screen - CRM KPI + Events List + Ask AI
class ClientProfileScreen extends StatefulWidget {
  final String? phoneE164;

  const ClientProfileScreen({super.key, this.phoneE164});

  @override
  State<ClientProfileScreen> createState() => _ClientProfileScreenState();
}

class _ClientProfileScreenState extends State<ClientProfileScreen> {
  final WhatsAppApiService _apiService = WhatsAppApiService.instance;
  final TextEditingController _questionController = TextEditingController();
  
  Map<String, dynamic>? _clientProfile;
  bool _isLoadingProfile = true;
  bool _isAskingAI = false;
  String? _aiAnswer;
  List<Map<String, dynamic>> _aiSources = [];

  String? get _phoneE164 => widget.phoneE164 ?? _extractFromQuery('phoneE164');

  String? _extractFromQuery(String param) {
    final uri = Uri.base;
    return uri.queryParameters[param];
  }

  @override
  void initState() {
    super.initState();
    _loadClientProfile();
  }

  Future<void> _loadClientProfile() async {
    if (_phoneE164 == null) {
      setState(() => _isLoadingProfile = false);
      return;
    }

    setState(() => _isLoadingProfile = true);

    try {
      final profile = await _apiService.getClientProfile(_phoneE164!);
      if (mounted) {
        setState(() {
          _clientProfile = profile;
          _isLoadingProfile = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoadingProfile = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading profile: $e')),
        );
      }
    }
  }

  Future<void> _askAI() async {
    final question = _questionController.text.trim();
    if (question.isEmpty || _phoneE164 == null || _isAskingAI) return;

    setState(() {
      _isAskingAI = true;
      _aiAnswer = null;
      _aiSources = [];
    });

    try {
      final result = await _apiService.askClientAI(
        phoneE164: _phoneE164!,
        question: question,
      );

      if (mounted) {
        setState(() {
          _aiAnswer = result['answer'] as String?;
          _aiSources = (result['sources'] as List<dynamic>? ?? [])
              .cast<Map<String, dynamic>>();
          _isAskingAI = false;
        });
        _questionController.clear();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isAskingAI = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error asking AI: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  String _formatCurrency(num? amount, String? currency) {
    if (amount == null) return '0';
    final cur = currency ?? 'RON';
    return '${amount.toStringAsFixed(0)} $cur';
  }

  @override
  Widget build(BuildContext context) {
    if (_phoneE164 == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Client Profile')),
        body: const Center(child: Text('PhoneE164 is required')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_phoneE164 ?? 'Client Profile'),
        backgroundColor: const Color(0xFF25D366),
      ),
      body: _isLoadingProfile
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // KPI Cards
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Client Summary',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: _buildKpiCard(
                                  'Total Spent',
                                  _formatCurrency(
                                    _clientProfile?['lifetimeSpendPaid'] as num?,
                                    _clientProfile?['stats']?['currency'] as String?,
                                  ),
                                  Icons.attach_money,
                                  Colors.green,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: _buildKpiCard(
                                  'Events',
                                  '${_clientProfile?['eventsCount'] ?? 0}',
                                  Icons.event,
                                  Colors.blue,
                                ),
                              ),
                            ],
                          ),
                          if (_clientProfile?['lastEventAt'] != null) ...[
                            const SizedBox(height: 12),
                            Text(
                              'Last Event: ${DateFormat('dd-MM-yyyy').format((_clientProfile!['lastEventAt'] as Timestamp).toDate())}',
                              style: TextStyle(color: Colors.grey[600]),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Events List
                  Text(
                    'Events',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  StreamBuilder<QuerySnapshot>(
                    stream: FirebaseFirestore.instance
                        .collection('evenimente')
                        .where('phoneE164', isEqualTo: _phoneE164)
                        .orderBy('date', descending: true)
                        .limit(50)
                        .snapshots(),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      if (snapshot.hasError) {
                        return Text('Error: ${snapshot.error}');
                      }

                      if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                        return const Card(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: Text('No events found'),
                          ),
                        );
                      }

                      return Column(
                        children: snapshot.data!.docs.map((doc) {
                          final data = doc.data() as Map<String, dynamic>;
                          final eventShortId = data['eventShortId'];
                          final date = data['date'] as String?;
                          final address = data['address'] as String?;
                          final payment = data['payment'] as Map<String, dynamic>?;
                          final amount = payment?['amount'] as num?;

                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: const Color(0xFF25D366),
                                child: Text(
                                  eventShortId?.toString() ?? '?',
                                  style: const TextStyle(color: Colors.white),
                                ),
                              ),
                              title: Text(date ?? 'No date'),
                              subtitle: Text(address ?? 'No address'),
                              trailing: amount != null
                                  ? Text(
                                      _formatCurrency(amount, payment?['currency'] as String?),
                                      style: const TextStyle(fontWeight: FontWeight.bold),
                                    )
                                  : null,
                            ),
                          );
                        }).toList(),
                      );
                    },
                  ),

                  const SizedBox(height: 24),

                  // Ask AI
                  Text(
                    'Ask AI',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TextField(
                            controller: _questionController,
                            decoration: const InputDecoration(
                              hintText: 'e.g., Cât a cheltuit clientul în total?',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _isAskingAI ? null : _askAI,
                              icon: _isAskingAI
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    )
                                  : const Icon(Icons.question_answer),
                              label: Text(_isAskingAI ? 'Asking...' : 'Ask AI'),
                            ),
                          ),
                          if (_aiAnswer != null) ...[
                            const SizedBox(height: 16),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.blue.shade50,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _aiAnswer!,
                                    style: const TextStyle(fontWeight: FontWeight.w500),
                                  ),
                                  if (_aiSources.isNotEmpty) ...[
                                    const SizedBox(height: 12),
                                    const Text(
                                      'Sources:',
                                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                                    ),
                                    ..._aiSources.map((source) {
                                      return Text(
                                        '• ${source['eventShortId'] != null ? "Event #${source['eventShortId']}" : ""} ${source['date'] ?? ""}: ${source['details'] ?? ""}',
                                        style: const TextStyle(fontSize: 12),
                                      );
                                    }),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildKpiCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color),
          ),
        ],
      ),
    );
  }
}
