import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/admin_service.dart';

class WhatsAppScreen extends StatefulWidget {
  const WhatsAppScreen({super.key});

  @override
  State<WhatsAppScreen> createState() => _WhatsAppScreenState();
}

class _WhatsAppScreenState extends State<WhatsAppScreen> {
  final AdminService _adminService = AdminService();
  Future<bool>? _isAdminFuture;

  @override
  void initState() {
    super.initState();
    _isAdminFuture = _adminService.isCurrentUserAdmin();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inbox intern'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          FutureBuilder<bool>(
            future: _isAdminFuture,
            builder: (context, snap) {
              final isAdmin = snap.data == true;
              if (!isAdmin) {
                return const Card(
                  child: ListTile(
                    leading: Icon(Icons.lock_outline),
                    title: Text('Administrare conturi'),
                    subtitle: Text('Doar admin poate gestiona conturi inbox'),
                  ),
                );
              }
              return Column(
                children: [
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.account_tree),
                      title: const Text('Administrare conturi'),
                      subtitle: const Text('Conectare QR + management conturi (max 30)'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go('/whatsapp/accounts'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.inbox),
                      title: const Text('Inbox'),
                      subtitle: const Text('Listă conversații'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go('/whatsapp/inbox'),
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
