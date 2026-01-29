import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/admin_service.dart';
import '../../services/whatsapp_service.dart';
import '../../services/whatsapp_account_service.dart';
import '../../services/role_service.dart';

class WhatsAppScreen extends StatefulWidget {
  const WhatsAppScreen({super.key});

  @override
  State<WhatsAppScreen> createState() => _WhatsAppScreenState();
}

class _WhatsAppScreenState extends State<WhatsAppScreen> {
  final AdminService _adminService = AdminService();
  final WhatsAppAccountService _accountService = WhatsAppAccountService.instance;
  final RoleService _roleService = RoleService();
  
  Future<bool>? _isAdminFuture;
  Future<String?>? _myAccountIdFuture;
  Future<List<String>>? _employeeAccountIdsFuture;
  bool _isLoading = false;
  bool? _isWhatsAppInstalled;

  @override
  void initState() {
    super.initState();
    _isAdminFuture = _adminService.isCurrentUserAdmin();
    _myAccountIdFuture = _accountService.getMyWhatsAppAccountId();
    _employeeAccountIdsFuture = _accountService.getEmployeeWhatsAppAccountIds();
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
              return Column(
                children: [
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.account_tree),
                      title: const Text('Manage Accounts'),
                      subtitle: const Text('Conectare QR + management conturi (max 30)'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go('/whatsapp/accounts'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.inbox),
                      title: const Text('Inbox (All Accounts)'),
                      subtitle: const Text('Listă conversații din toate conturile (admin)'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go('/whatsapp/inbox'),
                    ),
                  ),
                ],
              );
            },
          ),
          // My Inbox (personal account)
          FutureBuilder<String?>(
            future: _myAccountIdFuture,
            builder: (context, snap) {
              final myAccountId = snap.data;
              if (myAccountId == null || myAccountId.isEmpty) {
                return const SizedBox.shrink();
              }
              return Column(
                children: [
                  const SizedBox(height: 12),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.person, color: Color(0xFF25D366)),
                      title: const Text('My Inbox'),
                      subtitle: const Text('Conversațiile contului meu personal'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go('/whatsapp/my-inbox'),
                    ),
                  ),
                ],
              );
            },
          ),
          // Employee Inbox (if employee)
          FutureBuilder<List<String>>(
            future: _employeeAccountIdsFuture,
            builder: (context, snap) {
              final employeeAccountIds = snap.data ?? [];
              if (employeeAccountIds.isEmpty) {
                return const SizedBox.shrink();
              }
              return Column(
                children: [
                  const SizedBox(height: 12),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.business, color: Colors.blue),
                      title: const Text('Employee Inbox'),
                      subtitle: Text('Conversațiile conturilor de angajat (${employeeAccountIds.length} cont${employeeAccountIds.length > 1 ? 'uri' : ''})'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go('/whatsapp/employee-inbox'),
                    ),
                  ),
                ],
              );
            },
          ),
          // Staff Inbox (all accounts except 0737571397)
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.people, color: Colors.orange),
              title: const Text('Inbox Angajați'),
              subtitle: const Text('Toate conversațiile (exclus contul personal)'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.go('/whatsapp/inbox-staff'),
            ),
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
