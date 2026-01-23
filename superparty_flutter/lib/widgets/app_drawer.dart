import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';

class AppDrawer extends StatelessWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  theme.colorScheme.primary,
                  theme.colorScheme.primary.withValues(alpha: 0.8),
                ],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Icon(Icons.celebration, size: 48, color: theme.colorScheme.onPrimary),
                const SizedBox(height: 8),
                Text(
                  'SuperParty',
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: theme.colorScheme.onPrimary,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  FirebaseAuth.instance.currentUser?.email ?? '',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onPrimary.withValues(alpha: 0.7),
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
          _buildDrawerItem(context, Icons.home, 'Home', '/home'),
          _buildDrawerItem(context, Icons.event, 'Evenimente', '/evenimente'),
          _buildDrawerItem(context, Icons.calendar_today, 'Disponibilitate', '/disponibilitate'),
          _buildDrawerItem(context, Icons.attach_money, 'Salarii', '/salarizare'),
          _buildDrawerItem(context, Icons.phone, 'Centrala', '/centrala'),
          _buildDrawerItem(context, Icons.chat, 'Inbox intern', '/whatsapp'),
          _buildDrawerItem(context, Icons.people, 'Echipă', '/team'),
          _buildDrawerItem(context, Icons.admin_panel_settings, 'Admin', '/admin'),
          _buildDrawerItem(context, Icons.smart_toy, 'AI Chat', '/ai-chat'),
          const Divider(),
          ListTile(
            leading: Icon(Icons.logout, color: Theme.of(context).colorScheme.error),
            title: const Text('Logout'),
            onTap: () => FirebaseAuth.instance.signOut(),
          ),
        ],
      ),
    );
  }

  Widget _buildDrawerItem(BuildContext context, IconData icon, String title, String route) {
    final theme = Theme.of(context);
    return ListTile(
      leading: Icon(icon, color: theme.colorScheme.primary),
      title: Text(title),
      onTap: () {
        Navigator.pop(context);
        context.go(route);
      },
    );
  }
}
