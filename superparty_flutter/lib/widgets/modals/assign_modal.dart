import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/event_model.dart';

/// Assign Modal - Alocare rol/șofer
/// 100% identic cu HTML
/// Referință: kyc-app/kyc-app/public/evenimente.html (#assignModal)
class AssignModal extends StatefulWidget {
  final EventModel event;
  final String slot;
  final Function(String? code) onAssign;
  final VoidCallback onClear;

  const AssignModal({
    super.key,
    required this.event,
    required this.slot,
    required this.onAssign,
    required this.onClear,
  });

  @override
  State<AssignModal> createState() => _AssignModalState();
}

class _AssignModalState extends State<AssignModal> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    // Auto-focus input after modal opens
    Future.delayed(const Duration(milliseconds: 100), () {
      if (mounted) {
        _focusNode.requestFocus();
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

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
            child: _buildSheet(),
          ),
        ),
      ),
    );
  }

  Widget _buildSheet() {
    final role = _getRole();
    final roleLabel = role?.label ?? (widget.slot == 'S' ? 'Sofer' : '');
    final roleTime = role?.time ?? '';
    final currentAssigned = role?.assignedCode ?? '';
    final currentPending = role?.pendingCode ?? '';

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Material(
          color: Colors.transparent,
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(maxWidth: 520),
            decoration: BoxDecoration(
              color: const Color(0xEB0B1220), // rgba(11,18,32,0.92)
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: const Color(0x1AFFFFFF), // rgba(255,255,255,0.1)
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
                _buildHeader(roleLabel),
                const SizedBox(height: 12),
                _buildAssignBox(roleTime, currentAssigned, currentPending),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(String roleLabel) {
    return Row(
      children: [
        Expanded(
          child: Text(
            'Alocare ${widget.slot}${roleLabel.isNotEmpty ? ' - $roleLabel' : ''}',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Clear button (!)
        TextButton(
          onPressed: () {
            widget.onClear();
            Navigator.of(context).pop();
          },
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            backgroundColor: const Color(0x29FF7878), // rgba(255,120,120,0.16)
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          child: Text(
            '!',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w900,
              color: const Color(0xFFFF7878).withOpacity(0.9), // --bad
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Gata button
        TextButton(
          onPressed: () {
            final code = _controller.text.trim().toUpperCase();
            if (code.isNotEmpty) {
              widget.onAssign(code);
            }
            Navigator.of(context).pop();
          },
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

  Widget _buildAssignBox(
      String roleTime, String currentAssigned, String currentPending) {
    final hasAssigned =
        currentAssigned.isNotEmpty && _isValidStaffCode(currentAssigned);
    final hasPending =
        currentPending.isNotEmpty && _isValidStaffCode(currentPending);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Meta (date + address + time)
        Text(
          '${_formatDate(widget.event.date)} • ${widget.event.address}${roleTime.isNotEmpty ? ' • $roleTime' : ''}',
          style: TextStyle(
            fontSize: 12,
            color: const Color(0xFFEAF1FF).withOpacity(0.7),
          ),
        ),

        // Swap hint (current assigned/pending)
        if (hasAssigned || hasPending) ...[
          const SizedBox(height: 8),
          Text(
            [
                  if (hasAssigned) 'Curent: $currentAssigned',
                  if (hasPending) 'In asteptare: $currentPending',
                ].join(' • ') +
                ' • scrie codul ca sa trimiti o cerere noua',
            style: TextStyle(
              fontSize: 11,
              color: const Color(0xFFEAF1FF).withOpacity(0.6),
            ),
          ),
        ],

        const SizedBox(height: 12),

        // Input
        TextField(
          controller: _controller,
          focusNode: _focusNode,
          textCapitalization: TextCapitalization.characters,
          style: const TextStyle(
            fontSize: 14,
            color: Color(0xFFEAF1FF),
            fontWeight: FontWeight.w500,
          ),
          decoration: InputDecoration(
            hintText: 'Cod (ex: A1, BTRAINER)',
            hintStyle: TextStyle(
              fontSize: 14,
              color: const Color(0xFFEAF1FF).withOpacity(0.55),
            ),
            filled: true,
            fillColor: const Color(0x0FFFFFFF),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(
                color: Color(0x24FFFFFF),
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(
                color: Color(0x24FFFFFF),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(
                color: Color(0x4DFFFFFF),
              ),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
          onChanged: (value) {
            // Auto-uppercase
            final cursorPos = _controller.selection.base.offset;
            _controller.value = _controller.value.copyWith(
              text: value.toUpperCase(),
              selection: TextSelection.collapsed(offset: cursorPos),
            );
          },
        ),

        const SizedBox(height: 8),

        // Hint
        Text(
          'Se trimite cerere, apoi omul accepta sau refuza din tabul codului.',
          style: TextStyle(
            fontSize: 11,
            color: const Color(0xFFEAF1FF).withOpacity(0.6),
          ),
        ),
      ],
    );
  }

  RoleModel? _getRole() {
    try {
      return widget.event.roles.firstWhere(
        (r) => r.slot.toUpperCase() == widget.slot.toUpperCase(),
      );
    } catch (e) {
      return null;
    }
  }

  String _formatDate(String dateStr) {
    try {
      final parts = dateStr.split('-');
      if (parts.length != 3) return dateStr;
      final day = int.parse(parts[0]);
      final month = int.parse(parts[1]);
      final year = int.parse(parts[2]);
      final date = DateTime(year, month, day);
      return DateFormat('dd MMM yyyy', 'ro').format(date);
    } catch (e) {
      return dateStr;
    }
  }

  bool _isValidStaffCode(String code) {
    final normalized = code.trim().toUpperCase();
    if (normalized.isEmpty) return false;
    return RegExp(r'^[A-Z][A-Z0-9]*$').hasMatch(normalized);
  }
}
