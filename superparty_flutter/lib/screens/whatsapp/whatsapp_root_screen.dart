import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/auth/is_super_admin.dart';
import 'whatsapp_accounts_screen.dart';
import 'whatsapp_inbox_screen.dart';

class WhatsAppRootScreen extends StatefulWidget {
  const WhatsAppRootScreen({super.key});

  @override
  State<WhatsAppRootScreen> createState() => _WhatsAppRootScreenState();
}

class _WhatsAppRootScreenState extends State<WhatsAppRootScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  bool get _isSuperAdmin => isSuperAdmin(FirebaseAuth.instance.currentUser);

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _isSuperAdmin ? 2 : 1, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // If auth changes, rebuild tab controller count.
    final desired = _isSuperAdmin ? 2 : 1;
    if (_tabs.length != desired) {
      _tabs.dispose();
      _tabs = TabController(length: desired, vsync: this);
    }

    final tabs = <Tab>[
      const Tab(text: 'Inbox', icon: Icon(Icons.inbox)),
      if (_isSuperAdmin) const Tab(text: 'Accounts', icon: Icon(Icons.qr_code)),
    ];

    final views = <Widget>[
      const WhatsAppInboxScreen(),
      if (_isSuperAdmin) const WhatsAppAccountsScreen(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp'),
        bottom: TabBar(controller: _tabs, tabs: tabs),
      ),
      body: TabBarView(controller: _tabs, children: views),
    );
  }
}

