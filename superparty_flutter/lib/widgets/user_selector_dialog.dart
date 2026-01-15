import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Dialog pentru selectarea unui user din lista de staff
class UserSelectorDialog extends StatefulWidget {
  final String? currentUserId;
  final String title;

  const UserSelectorDialog({
    super.key,
    this.currentUserId,
    this.title = 'Selectează persoană',
  });

  @override
  State<UserSelectorDialog> createState() => _UserSelectorDialogState();
}

class _UserSelectorDialogState extends State<UserSelectorDialog> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: const Color(0xFF1A2332),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Container(
        constraints: const BoxConstraints(maxHeight: 600, maxWidth: 400),
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  widget.title,
                  style: const TextStyle(
                    color: Color(0xFFE2E8F0),
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Color(0xFF94A3B8)),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Search bar
            TextField(
              controller: _searchController,
              onChanged: (value) {
                setState(() {
                  _searchQuery = value.toLowerCase();
                });
              },
              style: const TextStyle(color: Color(0xFFE2E8F0)),
              decoration: InputDecoration(
                hintText: 'Caută după nume sau cod...',
                hintStyle: const TextStyle(color: Color(0xFF94A3B8)),
                filled: true,
                fillColor: const Color(0xFF0B1220),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFF2D3748)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFF2D3748)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFFDC2626)),
                ),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF94A3B8)),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, color: Color(0xFF94A3B8)),
                        onPressed: () {
                          _searchController.clear();
                          setState(() {
                            _searchQuery = '';
                          });
                        },
                      )
                    : null,
              ),
            ),
            const SizedBox(height: 16),

            // Opțiune "Nealocat"
            _buildUnassignedOption(),
            const Divider(color: Color(0xFF2D3748)),

            // Lista de useri
            Expanded(
              child: StreamBuilder<QuerySnapshot>(
                stream: FirebaseFirestore.instance
                    .collection('users')
                    .where('role', whereIn: ['animator', 'sofer', 'admin'])
                    .orderBy('displayName')
                    .snapshots(),
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return Center(
                      child: Text(
                        'Eroare: ${snapshot.error}',
                        style: const TextStyle(color: Color(0xFFDC2626)),
                      ),
                    );
                  }

                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(
                      child: CircularProgressIndicator(
                        color: Color(0xFFDC2626),
                      ),
                    );
                  }

                  if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                    return const Center(
                      child: Text(
                        'Nu există utilizatori disponibili',
                        style: TextStyle(color: Color(0xFF94A3B8)),
                      ),
                    );
                  }

                  // Filtrare după search query
                  final users = snapshot.data!.docs.where((doc) {
                    if (_searchQuery.isEmpty) return true;

                    final data = doc.data() as Map<String, dynamic>;
                    final displayName = (data['displayName'] as String? ?? '').toLowerCase();
                    final staffCode = (data['staffCode'] as String? ?? '').toLowerCase();
                    final email = (data['email'] as String? ?? '').toLowerCase();

                    return displayName.contains(_searchQuery) ||
                        staffCode.contains(_searchQuery) ||
                        email.contains(_searchQuery);
                  }).toList();

                  if (users.isEmpty) {
                    return const Center(
                      child: Text(
                        'Niciun rezultat',
                        style: TextStyle(color: Color(0xFF94A3B8)),
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: users.length,
                    itemBuilder: (context, index) {
                      final doc = users[index];
                      final data = doc.data() as Map<String, dynamic>;
                      final userId = doc.id;
                      final displayName = data['displayName'] as String? ?? 'Fără nume';
                      final staffCode = data['staffCode'] as String? ?? '';
                      final role = data['role'] as String? ?? '';
                      final isSelected = userId == widget.currentUserId;

                      return _buildUserTile(
                        userId: userId,
                        displayName: displayName,
                        staffCode: staffCode,
                        role: role,
                        isSelected: isSelected,
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUnassignedOption() {
    final isSelected = widget.currentUserId == null;

    return ListTile(
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: const Color(0xFF2D3748),
          borderRadius: BorderRadius.circular(20),
        ),
        child: const Icon(
          Icons.person_off,
          color: Color(0xFF94A3B8),
          size: 20,
        ),
      ),
      title: const Text(
        'Nealocat',
        style: TextStyle(
          color: Color(0xFFE2E8F0),
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: const Text(
        'Șterge alocarea curentă',
        style: TextStyle(
          color: Color(0xFF94A3B8),
          fontSize: 12,
        ),
      ),
      trailing: isSelected
          ? const Icon(Icons.check_circle, color: Color(0xFFDC2626))
          : null,
      tileColor: isSelected ? const Color(0xFF2D3748) : null,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
      ),
      onTap: () => Navigator.pop(context, null), // Return null pentru unassign
    );
  }

  Widget _buildUserTile({
    required String userId,
    required String displayName,
    required String staffCode,
    required String role,
    required bool isSelected,
  }) {
    // Culoare badge în funcție de rol
    Color badgeColor;
    String badgeText;
    switch (role) {
      case 'animator':
        badgeColor = const Color(0xFF10B981);
        badgeText = 'Animator';
        break;
      case 'sofer':
        badgeColor = const Color(0xFF3B82F6);
        badgeText = 'Șofer';
        break;
      case 'admin':
        badgeColor = const Color(0xFFDC2626);
        badgeText = 'Admin';
        break;
      default:
        badgeColor = const Color(0xFF94A3B8);
        badgeText = role;
    }

    return ListTile(
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [badgeColor, badgeColor.withValues(alpha: 0.7)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Center(
          child: Text(
            staffCode.isNotEmpty ? staffCode[0].toUpperCase() : displayName[0].toUpperCase(),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              displayName,
              style: const TextStyle(
                color: Color(0xFFE2E8F0),
                fontWeight: FontWeight.w500,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (staffCode.isNotEmpty) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: badgeColor.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: badgeColor.withValues(alpha: 0.5)),
              ),
              child: Text(
                staffCode,
                style: TextStyle(
                  color: badgeColor,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ],
      ),
      subtitle: Text(
        badgeText,
        style: const TextStyle(
          color: Color(0xFF94A3B8),
          fontSize: 12,
        ),
      ),
      trailing: isSelected
          ? const Icon(Icons.check_circle, color: Color(0xFFDC2626))
          : null,
      tileColor: isSelected ? const Color(0xFF2D3748) : null,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
      ),
      onTap: () => Navigator.pop(context, userId),
    );
  }
}

/// Helper function pentru a afișa dialogul
Future<String?> showUserSelectorDialog({
  required BuildContext context,
  String? currentUserId,
  String title = 'Selectează persoană',
}) async {
  return await showDialog<String?>(
    context: context,
    builder: (context) => UserSelectorDialog(
      currentUserId: currentUserId,
      title: title,
    ),
  );
}
