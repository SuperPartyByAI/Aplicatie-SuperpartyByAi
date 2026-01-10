import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';

/// Code Modal - 4 opțiuni pentru filtrul "Ce cod am"
/// 100% identic cu HTML
/// Referință: kyc-app/kyc-app/public/evenimente.html (#codeModal)
class CodeModal extends StatelessWidget {
  final Function(String value) onOptionSelected;

  const CodeModal({
    super.key,
    required this.onOptionSelected,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Container(
        color: const Color(0x8C000000), // rgba(0,0,0,0.55)
        padding: const EdgeInsets.all(16),
        child: Center(
          child: GestureDetector(
            onTap: () {}, // Prevent closing when tapping sheet
            child: _buildSheet(context),
          ),
        ),
      ),
    );
  }

  Widget _buildSheet(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(maxWidth: 520),
          decoration: BoxDecoration(
            color: const Color(0xEB0B1220), // rgba(11,18,32,0.92)
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: const Color(0x1AFFFFFF), // rgba(255,255,255,0.1) - fixed from 9 to 8 hex digits
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0x8C000000), // rgba(0,0,0,0.55)
                blurRadius: 80,
                offset: const Offset(0, 24),
              ),
            ],
          ),
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildHeader(context),
              const SizedBox(height: 8),
              _buildHint(),
              const SizedBox(height: 8),
              _buildPicklist(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            'Filtru "Ce cod am"',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Gata button
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            backgroundColor: const Color(0x14FFFFFF),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          child: Text(
            'Gata',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHint() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
      child: Text(
        'Alege: scrii un cod (A1, BTRAINER) sau filtrezi dupa status.',
        style: TextStyle(
          fontSize: 11,
          color: const Color(0xFFEAF1FF).withOpacity(0.6),
        ),
      ),
    );
  }

  Widget _buildPicklist(BuildContext context) {
    return Column(
      children: [
        _buildPickButton(
          context,
          'Scriu cod',
          () {
            Navigator.of(context).pop();
            onOptionSelected('FOCUS_INPUT');
          },
        ),
        const SizedBox(height: 8),
        _buildPickButton(
          context,
          'Nerezolvate',
          () {
            Navigator.of(context).pop();
            onOptionSelected('NEREZOLVATE');
          },
        ),
        const SizedBox(height: 8),
        _buildPickButton(
          context,
          'Rezolvate',
          () {
            Navigator.of(context).pop();
            onOptionSelected('REZOLVATE');
          },
        ),
        const SizedBox(height: 8),
        _buildPickButton(
          context,
          'Toate',
          () {
            Navigator.of(context).pop();
            onOptionSelected('');
          },
        ),
      ],
    );
  }

  Widget _buildPickButton(BuildContext context, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0x0FFFFFFF), // rgba(255,255,255,0.06)
          border: Border.all(
            color: const Color(0x24FFFFFF), // rgba(255,255,255,0.14)
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: const Color(0xFFEAF1FF).withOpacity(0.9),
          ),
        ),
      ),
    );
  }
}
