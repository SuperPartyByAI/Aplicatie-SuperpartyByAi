import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

class AppDrawer extends StatelessWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFFDC2626), Color(0xFFEF4444)],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const Icon(Icons.celebration, size: 48, color: Colors.white),
                const SizedBox(height: 8),
                const Text(
                  'SuperParty',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  FirebaseAuth.instance.currentUser?.email ?? '',
                  style: const TextStyle(color: Colors.white70, fontSize: 14),
                ),
              ],
            ),
          ),
          _buildDrawerItem(context, Icons.home, 'Home', '/home'),
          _buildDrawerItem(context, Icons.event, 'Evenimente', '/evenimente'),
          _buildDrawerItem(context, Icons.calendar_today, 'Disponibilitate',
              '/disponibilitate'),
          _buildDrawerItem(
              context, Icons.attach_money, 'Salarii', '/salarizare'),
          _buildDrawerItem(context, Icons.phone, 'Centrala', '/centrala'),
          _buildDrawerItem(context, Icons.chat, 'WhatsApp', '/whatsapp'),
          _buildDrawerItem(context, Icons.people, 'Echipă', '/team'),
          _buildDrawerItem(
              context, Icons.admin_panel_settings, 'Admin', '/admin'),
          _buildDrawerItem(context, Icons.smart_toy, 'AI Chat', '/ai-chat'),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Logout'),
            onTap: () => FirebaseAuth.instance.signOut(),
          ),
        ],
      ),
    );
  }

  Widget _buildDrawerItem(
      BuildContext context, IconData icon, String title, String route) {
    return ListTile(
      leading: Icon(icon, color: const Color(0xFFDC2626)),
      title: Text(title),
      onTap: () {
        Navigator.pop(context);
        Navigator.pushNamed(context, route);
      },
    );
  }
}
