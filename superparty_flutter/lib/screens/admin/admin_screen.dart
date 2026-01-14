import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'kyc_approvals_screen.dart';
import '../../core/auth/is_super_admin.dart';

class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context) {
    if (!isSuperAdmin(FirebaseAuth.instance.currentUser)) {
      return const Scaffold(
        body: Center(child: Text('Nu ai acces (super-admin only).')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Panel'),
        backgroundColor: const Color(0xFFDC2626),
      ),
      body: GridView.count(
        crossAxisCount: 2,
        padding: const EdgeInsets.all(16),
        children: [
          _buildAdminCard(context, 'Aprobări KYC', Icons.verified_user, () {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const KycApprovalsScreen()));
          }),
          _buildAdminCard(context, 'Conversații AI', Icons.chat, () {}),
          _buildAdminCard(context, 'Firestore Migration', Icons.storage, () {
            Navigator.pushNamed(context, '/admin/firestore-migration');
          }),
          _buildAdminCard(context, 'Utilizatori', Icons.people, () {}),
          _buildAdminCard(context, 'Statistici', Icons.analytics, () {}),
        ],
      ),
    );
  }

  Widget _buildAdminCard(BuildContext context, String title, IconData icon, VoidCallback onTap) {
    return Card(
      color: const Color(0xFFDC2626),
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 48, color: Colors.white),
            const SizedBox(height: 8),
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
          ],
        ),
      ),
    );
  }
}
