import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../widgets/app_drawer.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  final List<Map<String, dynamic>> _pages = [
    {'title': 'Home', 'icon': Icons.home},
    {'title': 'Evenimente', 'icon': Icons.event, 'route': '/evenimente'},
    {'title': 'Disponibilitate', 'icon': Icons.calendar_today, 'route': '/disponibilitate'},
    {'title': 'Echipă', 'icon': Icons.people, 'route': '/team'},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SuperParty'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => FirebaseAuth.instance.signOut(),
          ),
        ],
      ),
      drawer: const AppDrawer(),
      body: GridView.count(
        crossAxisCount: 2,
        padding: const EdgeInsets.all(20),
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
        childAspectRatio: 1.1,
        children: [
          _buildCard(context, 'Evenimente', Icons.event, '/evenimente', Colors.blue),
          _buildCard(context, 'Disponibilitate', Icons.calendar_today, '/disponibilitate', Colors.green),
          _buildCard(context, 'Salarii', Icons.attach_money, '/salarizare', Colors.orange),
          _buildCard(context, 'Centrala', Icons.phone, '/centrala', Colors.purple),
          _buildCard(context, 'WhatsApp', Icons.chat, '/whatsapp', Colors.teal),
          _buildCard(context, 'Echipă', Icons.people, '/team', Colors.indigo),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (index) {
          setState(() => _selectedIndex = index);
          if (index > 0 && _pages[index]['route'] != null) {
            Navigator.pushNamed(context, _pages[index]['route']);
          }
        },
        type: BottomNavigationBarType.fixed,
        selectedItemColor: const Color(0xFFDC2626),
        unselectedItemColor: Colors.grey,
        items: _pages.map((page) {
          return BottomNavigationBarItem(
            icon: Icon(page['icon']),
            label: page['title'],
          );
        }).toList(),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.pushNamed(context, '/ai-chat'),
        backgroundColor: const Color(0xFF6366F1),
        child: const Icon(Icons.smart_toy),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
    );
  }

  Widget _buildCard(BuildContext context, String title, IconData icon, String route, Color color) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: InkWell(
        onTap: () => Navigator.pushNamed(context, route),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              colors: [color.withOpacity(0.7), color],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 56, color: Colors.white),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
