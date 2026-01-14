import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/is_super_admin.dart';
import '../../services/whatsapp_api_service.dart';

class WhatsAppAccountsScreen extends StatelessWidget {
  const WhatsAppAccountsScreen({super.key});

  bool get _isSuperAdmin => isSuperAdmin(FirebaseAuth.instance.currentUser);

  @override
  Widget build(BuildContext context) {
    if (!_isSuperAdmin) {
      return const Center(child: Text('Doar super-admin poate vedea conturile.'));
    }

    final q = FirebaseFirestore.instance
        .collection('whatsapp_accounts')
        .orderBy('updatedAt', descending: true)
        .limit(30);

    return Scaffold(
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: q.snapshots(),
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text('Eroare: ${snap.error}'));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());

          final docs = snap.data!.docs;
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Conturi (${docs.length})',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: () => _showAddDialog(context),
                    icon: const Icon(Icons.add),
                    label: const Text('Add'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (docs.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 32),
                  child: Center(child: Text('Nu există conturi încă.')),
                ),
              for (final d in docs) _accountCard(context, d),
            ],
          );
        },
      ),
    );
  }

  Widget _accountCard(BuildContext context, QueryDocumentSnapshot<Map<String, dynamic>> d) {
    final data = d.data();
    final name = (data['name'] ?? '').toString();
    final phone = (data['phone'] ?? '').toString();
    final status = (data['status'] ?? '').toString();
    final pairing = (data['pairingCode'] ?? '').toString();
    final qr = (data['qrCodeDataUrl'] ?? '').toString();

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    name.isEmpty ? d.id : name,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                _statusChip(status),
              ],
            ),
            if (phone.isNotEmpty) Text(phone),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: () => _openConnectPage(context, d.id),
                  icon: const Icon(Icons.qr_code),
                  label: const Text('Connect'),
                ),
                OutlinedButton.icon(
                  onPressed: () async {
                    try {
                      await WhatsAppApiService.instance.regenerateQr(accountId: d.id);
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('QR regenerat.')),
                      );
                    } catch (e) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Eroare: $e')),
                      );
                    }
                  },
                  icon: const Icon(Icons.refresh),
                  label: const Text('Regenerate'),
                ),
                OutlinedButton.icon(
                  onPressed: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: const Text('Ștergi contul?'),
                        content: Text('AccountId: ${d.id}'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Nu')),
                          ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Da')),
                        ],
                      ),
                    );
                    if (ok != true) return;
                    try {
                      await WhatsAppApiService.instance.deleteAccount(accountId: d.id);
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Cont șters.')),
                      );
                    } catch (e) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Eroare: $e')),
                      );
                    }
                  },
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Delete'),
                ),
              ],
            ),
            if (pairing.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text('Pairing code: $pairing', style: const TextStyle(fontFamily: 'monospace')),
            ],
            if (status == 'qr_ready' && qr.isNotEmpty) ...[
              const SizedBox(height: 10),
              _qrWidget(qr),
            ],
          ],
        ),
      ),
    );
  }

  Widget _statusChip(String status) {
    final s = status.isEmpty ? 'unknown' : status;
    Color c = Colors.grey;
    if (s == 'connected') c = Colors.green;
    if (s == 'qr_ready') c = Colors.orange;
    if (s == 'disconnected') c = Colors.red;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.3)),
      ),
      child: Text(s, style: TextStyle(color: c)),
    );
  }

  Widget _qrWidget(String dataUrl) {
    try {
      if (dataUrl.startsWith('data:')) {
        final idx = dataUrl.indexOf('base64,');
        final b64 = idx >= 0 ? dataUrl.substring(idx + 7) : '';
        final bytes = base64Decode(b64);
        return Image.memory(bytes, width: 260, height: 260);
      }
      // If backend stores a normal URL instead.
      return Image.network(dataUrl, width: 260, height: 260);
    } catch (_) {
      return const Text('QR invalid.');
    }
  }

  Future<void> _openConnectPage(BuildContext context, String accountId) async {
    try {
      final uri = await WhatsAppApiService.instance.buildConnectUri(accountId: accountId);
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Nu pot deschide connect: $e')));
    }
  }

  Future<void> _showAddDialog(BuildContext context) async {
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Add WhatsApp account'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name')),
            TextField(controller: phoneCtrl, decoration: const InputDecoration(labelText: 'Phone (optional)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Add')),
        ],
      ),
    );

    if (ok != true) {
      nameCtrl.dispose();
      phoneCtrl.dispose();
      return;
    }

    try {
      await WhatsAppApiService.instance.addAccount(
        name: nameCtrl.text.trim(),
        phone: phoneCtrl.text.trim().isEmpty ? null : phoneCtrl.text.trim(),
      );
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Cont adăugat.')));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Eroare: $e')));
    } finally {
      nameCtrl.dispose();
      phoneCtrl.dispose();
    }
  }
}

