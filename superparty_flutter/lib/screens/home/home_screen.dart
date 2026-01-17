import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../widgets/grid_overlay.dart';
import '../../providers/app_state_provider.dart';
import '../../theme/app_theme.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  final List<Map<String, dynamic>> _dockItems = [
    {'title': 'Centrala', 'icon': Icons.phone, 'route': '/centrala'},
    {'title': 'Chat', 'icon': Icons.chat, 'route': '/whatsapp'},
    {'title': 'Echipă', 'icon': Icons.people, 'route': '/team'},
    {'title': 'AI Chat', 'icon': Icons.smart_toy, 'route': '/ai-chat'},
  ];

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppStateProvider>(context);
    final theme = Theme.of(context);
    final colors = theme.extension<AppColors>();

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      appBar: AppBar(
        backgroundColor: colors?.overlayBackdrop ?? theme.colorScheme.surface.withValues(alpha: 0.72),
        elevation: 0,
        title: Text(
          'SuperParty',
          style: theme.textTheme.titleLarge?.copyWith(
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        automaticallyImplyLeading: false, // Remove hamburger menu icon
        actions: [
          IconButton(
            icon: Icon(Icons.logout, color: theme.colorScheme.onSurface),
            onPressed: () => FirebaseAuth.instance.signOut(),
          ),
        ],
      ),
      body: Stack(
        children: [
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  colors?.gradientStart ?? theme.colorScheme.surface,
                  colors?.gradientEnd ?? theme.colorScheme.surface,
                ],
              ),
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.celebration, size: 80, color: theme.colorScheme.onSurface),
                  const SizedBox(height: 20),
                  Text(
                    'Bine ai venit!',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Apasă ➕ pentru meniu',
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontSize: 18,
                      color: colors?.textMuted ?? theme.colorScheme.onSurface.withValues(alpha: 0.9),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const GridOverlay(),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          boxShadow: [
            BoxShadow(
              color: theme.colorScheme.shadow.withValues(alpha: 0.1),
              blurRadius: 10,
              offset: const Offset(0, -5),
            ),
          ],
        ),
        child: BottomNavigationBar(
          currentIndex: _selectedIndex,
          onTap: (index) {
            setState(() => _selectedIndex = index);
            if (_dockItems[index]['route'] != null) {
              context.go(_dockItems[index]['route']);
            }
          },
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.transparent,
          elevation: 0,
          selectedItemColor: theme.colorScheme.primary,
          unselectedItemColor: colors?.textMuted ?? theme.colorScheme.onSurface.withValues(alpha: 0.6),
          selectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600),
          items: _dockItems.map((item) {
            return BottomNavigationBarItem(
              icon: Icon(item['icon']),
              label: item['title'],
            );
          }).toList(),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => appState.toggleGrid(),
        backgroundColor: theme.colorScheme.primary,
        elevation: 8,
        child: Icon(Icons.add, color: theme.colorScheme.onPrimary, size: 28),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
    );
  }


}
