import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/admin_service.dart';
import '../../services/whatsapp_service.dart';

class WhatsAppScreen extends StatefulWidget {
  const WhatsAppScreen({super.key});

  @override
  State<WhatsAppScreen> createState() => _WhatsAppScreenState();
}

class _WhatsAppScreenState extends State<WhatsAppScreen> {
  final AdminService _adminService = AdminService();
  Future<bool>? _isAdminFuture;
  bool _isLoading = false;
  bool? _isWhatsAppInstalled;

  @override
  void initState() {
    super.initState();
    _isAdminFuture = _adminService.isCurrentUserAdmin();
    _checkWhatsAppInstallation();
  }

  Future<void> _checkWhatsAppInstallation() async {
    final installed = await WhatsAppService.isWhatsAppInstalled();
    setState(() {
      _isWhatsAppInstalled = installed;
    });
  }

  Future<void> _openWhatsApp() async {
    setState(() => _isLoading = true);

    final success = await WhatsAppService.openWhatsAppChat();

    setState(() => _isLoading = false);

    if (!mounted) return;

    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('WhatsApp deschis cu succes'),
          backgroundColor: Colors.green,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Nu s-a putut deschide WhatsApp. Verifică dacă este instalat.'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp'),
        backgroundColor: const Color(0xFF25D366),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.chat),
              title: const Text('Deschide WhatsApp'),
              subtitle: const Text('Deschide conversația WhatsApp externă (wa.me)'),
              trailing: _isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.chevron_right),
              onTap: _isLoading ? null : _openWhatsApp,
            ),
          ),
          const SizedBox(height: 12),
          FutureBuilder<bool>(
            future: _isAdminFuture,
            builder: (context, snap) {
              final isAdmin = snap.data == true;
              if (!isAdmin) {
                return const Card(
                  child: ListTile(
                    leading: Icon(Icons.lock_outline),
                    title: Text('Manage Accounts'),
                    subtitle: Text('Doar admin poate gestiona conturi WhatsApp'),
                  ),
                );
              }
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.account_tree),
                  title: const Text('Manage Accounts'),
                  subtitle: const Text('Conectare QR + management conturi (max 30)'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.go('/whatsapp/accounts'),
                ),
              );
            },
          ),
          if (_isWhatsAppInstalled == false) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning, color: Colors.orange),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'WhatsApp nu pare să fie instalat pe acest dispozitiv',
                      style: TextStyle(color: Colors.orange.shade900),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
