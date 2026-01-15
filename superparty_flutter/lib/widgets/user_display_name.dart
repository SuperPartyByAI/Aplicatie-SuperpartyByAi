import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Widget care afișează numele unui user din Firestore
/// În loc de UID, afișează displayName + staffCode
class UserDisplayName extends StatelessWidget {
  final String? userId;
  final TextStyle? style;
  final String fallback;
  final bool showStaffCode;

  const UserDisplayName({
    super.key,
    required this.userId,
    this.style,
    this.fallback = 'Nealocat',
    this.showStaffCode = true,
  });

  @override
  Widget build(BuildContext context) {
    if (userId == null || userId!.isEmpty) {
      return Text(
        fallback,
        style: style ?? const TextStyle(color: Color(0xFF94A3B8)),
      );
    }

    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Text(
            'Eroare',
            style: style ?? const TextStyle(color: Color(0xFFDC2626)),
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return Text(
            'Se încarcă...',
            style: style ?? const TextStyle(color: Color(0xFF94A3B8)),
          );
        }

        if (!snapshot.hasData || !snapshot.data!.exists) {
          return Text(
            'User șters',
            style: style ?? const TextStyle(color: Color(0xFF94A3B8)),
          );
        }

        final data = snapshot.data!.data() as Map<String, dynamic>?;
        if (data == null) {
          return Text(
            fallback,
            style: style ?? const TextStyle(color: Color(0xFF94A3B8)),
          );
        }

        final displayName = data['displayName'] as String? ?? 'Fără nume';
        final staffCode = data['staffCode'] as String? ?? '';

        if (showStaffCode && staffCode.isNotEmpty) {
          return Text(
            '$displayName ($staffCode)',
            style: style,
          );
        }

        return Text(
          displayName,
          style: style,
        );
      },
    );
  }
}

/// Widget compact care afișează doar staffCode sau inițiala
class UserBadge extends StatelessWidget {
  final String? userId;
  final double size;
  final Color? backgroundColor;

  const UserBadge({
    super.key,
    required this.userId,
    this.size = 32,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    if (userId == null || userId!.isEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: backgroundColor ?? const Color(0xFF2D3748),
          borderRadius: BorderRadius.circular(size / 2),
        ),
        child: const Icon(
          Icons.person_off,
          color: Color(0xFF94A3B8),
          size: 16,
        ),
      );
    }

    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData || !snapshot.data!.exists) {
          return Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              color: backgroundColor ?? const Color(0xFF2D3748),
              borderRadius: BorderRadius.circular(size / 2),
            ),
            child: const Icon(
              Icons.person,
              color: Color(0xFF94A3B8),
              size: 16,
            ),
          );
        }

        final data = snapshot.data!.data() as Map<String, dynamic>?;
        final staffCode = data?['staffCode'] as String? ?? '';
        final displayName = data?['displayName'] as String? ?? '?';
        final role = data?['role'] as String? ?? '';

        // Culoare în funcție de rol
        Color badgeColor;
        switch (role) {
          case 'animator':
            badgeColor = const Color(0xFF10B981);
            break;
          case 'sofer':
            badgeColor = const Color(0xFF3B82F6);
            break;
          case 'admin':
            badgeColor = const Color(0xFFDC2626);
            break;
          default:
            badgeColor = const Color(0xFF94A3B8);
        }

        final text = staffCode.isNotEmpty
            ? staffCode
            : displayName.isNotEmpty
                ? displayName[0].toUpperCase()
                : '?';

        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [badgeColor, badgeColor.withValues(alpha: 0.7)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(size / 2),
          ),
          child: Center(
            child: Text(
              text,
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: size * 0.4,
              ),
            ),
          ),
        );
      },
    );
  }
}
