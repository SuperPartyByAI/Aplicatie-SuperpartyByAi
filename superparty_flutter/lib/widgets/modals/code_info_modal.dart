import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';

/// Code Info Modal - Info despre cod staff
/// 100% identic cu HTML (demo version - tab cod dezactivat)
/// Referință: kyc-app/kyc-app/public/evenimente.html (#codeInfoModal)
class CodeInfoModal extends StatelessWidget {
  final String code;

  const CodeInfoModal({
    super.key,
    required this.code,
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
            border: Border.all(
              color: const Color(0x1AFFFFFFF), // rgba(255,255,255,0.1)
            ),
            borderRadius: BorderRadius.circular(18),
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
              const SizedBox(height: 12),
              _buildBody(),
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
            'Cod: $code',
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

  Widget _buildBody() {
    // Exact ca în HTML: "Demo: tab cod dezactivat in aceasta varianta."
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0x0FFFFFFF),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Center(
        child: Text(
          'Demo: tab cod dezactivat in aceasta varianta.',
          style: TextStyle(
            fontSize: 13,
            color: const Color(0xFFEAF1FF).withOpacity(0.7),
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
