import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/whatsapp_service.dart';
import '../../services/whatsapp_account_service.dart';
import '../../services/role_service.dart';

class WhatsAppScreen extends StatefulWidget {
  const WhatsAppScreen({super.key});

  @override
  State<WhatsAppScreen> createState() => _WhatsAppScreenState();
}

class _WhatsAppScreenState extends State<WhatsAppScreen> {
  final WhatsAppAccountService _accountService = WhatsAppAccountService.instance;
  final RoleService _roleService = RoleService();

  Future<String?>? _myAccountIdFuture;
  bool _isLoading = false;
  bool? _isWhatsAppInstalled;

  Future<({
    bool canSeeAdminInbox,
    bool canSeeEmployeeInbox,
    String? myAccountId,
  })>? _inboxDataFuture;

  @override
  void initState() {
    super.initState();
    _myAccountIdFuture = _accountService.getMyWhatsAppAccountId();
    _inboxDataFuture = () async {
      final isAdmin = await _roleService.isAdmin();
      final canSeeEmployee = await _roleService.canSeeEmployeeInbox();
      final m = await _myAccountIdFuture!;
      return (
        canSeeAdminInbox: isAdmin,
        canSeeEmployeeInbox: canSeeEmployee,
        myAccountId: m,
      );
    }();
    _checkWhatsAppInstallation();
  }

  Future<void> _checkWhatsAppInstallation() async {
    final installed = await WhatsAppService.isWhatsAppInstalled();
    if (mounted) setState(() => _isWhatsAppInstalled = installed);
  }

  Future<void> _openWhatsApp() async {
    setState(() => _isLoading = true);
    final success = await WhatsAppService.openWhatsAppChat();
    if (!mounted) return;
    setState(() => _isLoading = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(success
            ? 'WhatsApp deschis cu succes'
            : 'Nu s-a putut deschide WhatsApp. Verifică dacă este instalat.'),
        backgroundColor: success ? Colors.green : Colors.red,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp'),
        backgroundColor: const Color(0xFF25D366),
        leading: IconButton(
          icon: const Icon(Icons.home, color: Colors.white),
          onPressed: () => context.go('/home'),
          tooltip: 'Acasă',
        ),
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
          FutureBuilder<({
            bool canSeeAdminInbox,
            bool canSeeEmployeeInbox,
            String? myAccountId,
          })>(
            future: _inboxDataFuture,
            builder: (context, snap) {
              final d = snap.data;
              final canSeeAdmin = d?.canSeeAdminInbox ?? false;
              final canSeeEmployee = d?.canSeeEmployeeInbox ?? false;
              final myAccountId = d?.myAccountId;
              final showMyInbox = myAccountId != null && myAccountId.isNotEmpty;

              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (canSeeAdmin) ...[
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.account_tree),
                        title: const Text('Manage Accounts'),
                        subtitle: const Text(
                            'Conectare QR + management conturi (max 30)'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.go('/whatsapp/accounts'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.inbox),
                        title: const Text('Inbox Admin'),
                        subtitle: const Text(
                            'Doar contul 0737571397'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.go('/whatsapp/inbox'),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (canSeeEmployee)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.people, color: Colors.orange),
                        title: const Text('Inbox Angajați'),
                        subtitle: const Text(
                            'Toate conturile mai puțin 0737571397'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.go('/whatsapp/inbox-staff'),
                      ),
                    ),
                  if (showMyInbox) ...[
                    const SizedBox(height: 12),
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.person,
                            color: Color(0xFF25D366)),
                        title: const Text('My Inbox'),
                        subtitle: const Text(
                            'Conversațiile contului meu personal'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.go('/whatsapp/my-inbox'),
                      ),
                    ),
                  ],
                ],
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
