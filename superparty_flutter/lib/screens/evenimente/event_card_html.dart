import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/event_model.dart';

/// Event Card Widget - 100% identic cu HTML
/// Referință: kyc-app/kyc-app/public/evenimente.html (buildEventCard)
class EventCardHtml extends StatelessWidget {
  final EventModel event;
  final VoidCallback onTap;
  final Function(String slot) onSlotTap;
  final Function(String slot, String? code) onStatusTap;
  final VoidCallback? onDriverTap;
  final String? codeFilter; // Pentru buildVisibleRoles

  const EventCardHtml({
    super.key,
    required this.event,
    required this.onTap,
    required this.onSlotTap,
    required this.onStatusTap,
    this.onDriverTap,
    this.codeFilter,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0x0FFFFFFF), // rgba(255,255,255,0.06) --card
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: const Color(0x1FFFFFFF), // rgba(255,255,255,0.12) --border
          ),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            // Mobile layout: 3 rows (gap: 10px vertical)
            if (constraints.maxWidth < 600) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Row 1: Badge + Main (gap: 12px horizontal)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildBadge(),
                      const SizedBox(width: 12), // gap horizontal
                      Expanded(child: _buildMain()),
                    ],
                  ),
                  const SizedBox(height: 10), // gap vertical

                  // Row 2: Rolelist
                  if (event.roles.isNotEmpty) ...[
                    _buildRoleList(),
                    const SizedBox(height: 10), // gap vertical
                  ],

                  // Row 3: Right
                  _buildRight(),
                ],
              );
            }

            // Desktop layout: CSS Grid (3 columns: 46px 1fr auto)
            // HTML lines 856-866: grid-template-columns: 46px 1fr auto
            return _buildDesktopGrid();
          },
        ),
      ),
    );
  }

  Widget _buildDesktopGrid() {
    // Simulate CSS Grid with 3 columns: 46px, 1fr, auto
    // Gap: 10px vertical, 12px horizontal
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Row 1: Badge (col 1) + Main (col 2) + Right (col 3)
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Column 1: Badge (46px width)
            _buildBadge(),
            const SizedBox(width: 12), // gap horizontal
            
            // Column 2: Main (flexible)
            Expanded(child: _buildMain()),
            const SizedBox(width: 12), // gap horizontal
            
            // Column 3: Right (auto width)
            _buildRight(),
          ],
        ),
        
        // Row 2: Rolelist (spans columns 1-2)
        if (event.roles.isNotEmpty) ...[
          const SizedBox(height: 10), // gap vertical
          _buildRoleList(),
        ],
      ],
    );
  }

  Widget _buildBadge() {
    // Parse date DD-MM-YYYY and format as "DD\nMMM"
    String badgeText = '';
    try {
      final parts = event.date.split('-');
      if (parts.length == 3) {
        final day = parts[0];
        final month = int.parse(parts[1]);
        final monthNames = ['', 'Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];
        badgeText = '$day\n${monthNames[month]}';
      } else {
        badgeText = event.id.substring(0, 4);
      }
    } catch (e) {
      badgeText = event.id.substring(0, 4);
    }

    return Container(
      width: 46,
      height: 34,
      decoration: BoxDecoration(
        color: const Color(0x294ECDC4), // rgba(78,205,196,0.16)
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0x384ECDC4), // rgba(78,205,196,0.22)
        ),
      ),
      child: Center(
        child: Text(
          badgeText,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.8,
            height: 1.1,
            color: Color(0xF2EAF1FF), // rgba(234,241,255,0.95)
          ),
        ),
      ),
    );
  }

  Widget _buildMain() {
    // HTML lines 889-897: .main { gap: 6px }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ID + Date + Name
        Text(
          '${event.id} • ${event.date} • ${event.sarbatoritNume}',
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Color(0xFFEAF1FF),
          ),
        ),
        const SizedBox(height: 6), // gap from .main
        // Address
        if (event.address.isNotEmpty) ...[
          Text(
            event.address,
            style: const TextStyle(
              fontSize: 12,
              color: Color(0xB3EAF1FF), // rgba(234,241,255,0.7) --muted
            ),
          ),
          const SizedBox(height: 6), // gap from .main
        ],
        // Cine notează (ALWAYS show, even if null)
        Text(
          'Cine notează: ${event.cineNoteaza ?? '—'}',
          style: const TextStyle(
            fontSize: 12,
            color: Color(0x94EAF1FF), // rgba(234,241,255,0.58) --muted2
          ),
        ),
        // Șofer (ALWAYS show if needsDriver)
        if (event.needsDriver) ...[
          const SizedBox(height: 6), // gap from .main
          GestureDetector(
            onTap: () {
              if (onDriverTap != null) onDriverTap!();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: event.hasDriverAssigned
                    ? const Color(0x144ECDC4) // rgba(78,205,196,0.08)
                    : const Color(0x14FFBE5C), // rgba(255,190,92,0.08)
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: event.hasDriverAssigned
                      ? const Color(0x384ECDC4) // rgba(78,205,196,0.22)
                      : const Color(0x47FFBE5C), // rgba(255,190,92,0.28)
                ),
              ),
              child: Text(
                'Șofer: ${event.driverStatusText}',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  color: Color(0xEBEAF1FF), // rgba(234,241,255,0.92)
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildRoleList() {
    // buildVisibleRoles - filter roles by codeFilter
    final visibleRoles = _buildVisibleRoles();
    
    if (visibleRoles.isEmpty) {
      return const SizedBox.shrink();
    }

    // HTML lines 901-908: .rolelist
    // grid-template-columns: 46px 1fr
    // gap: 4px 8px (vertical horizontal)
    // This spans grid-column: 1 / 3 (badge + main columns)
    return Wrap(
      spacing: 0,
      runSpacing: 4, // gap vertical
      children: visibleRoles.map((role) {
        return SizedBox(
          width: double.infinity,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Slot column (46px width to match badge)
              SizedBox(
                width: 46,
                child: _buildSlot(role),
              ),
              const SizedBox(width: 8), // gap horizontal
              // Label column (flexible)
              Expanded(
                child: _buildRoleLabel(role),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  List<RoleModel> _buildVisibleRoles() {
    var roles = event.roles;

    // Filter by codeFilter (exact ca în HTML)
    if (codeFilter != null && codeFilter!.isNotEmpty) {
      final code = codeFilter!.trim().toUpperCase();
      
      // Special values
      if (code == 'NEREZOLVATE') {
        roles = roles.where((r) {
          final hasAssigned = r.assignedCode != null &&
              r.assignedCode!.isNotEmpty &&
              _isValidStaffCode(r.assignedCode!);
          final hasPending = !hasAssigned &&
              r.pendingCode != null &&
              r.pendingCode!.isNotEmpty &&
              _isValidStaffCode(r.pendingCode!);
          return !hasAssigned && !hasPending;
        }).toList();
      } else if (code == 'REZOLVATE') {
        roles = roles.where((r) {
          final hasAssigned = r.assignedCode != null &&
              r.assignedCode!.isNotEmpty &&
              _isValidStaffCode(r.assignedCode!);
          final hasPending = !hasAssigned &&
              r.pendingCode != null &&
              r.pendingCode!.isNotEmpty &&
              _isValidStaffCode(r.pendingCode!);
          return hasAssigned || hasPending;
        }).toList();
      } else {
        // Filter by specific code
        roles = roles.where((r) {
          final assigned = (r.assignedCode ?? '').trim().toUpperCase();
          final pending = (r.pendingCode ?? '').trim().toUpperCase();
          return assigned == code || pending == code;
        }).toList();
      }
    }

    return roles;
  }

  Widget _buildSlot(RoleModel role) {
    return GestureDetector(
      onTap: () => onSlotTap(role.slot),
      child: Container(
        width: 22,
        height: 18,
        decoration: BoxDecoration(
          color: const Color(0x14FFFFFF), // rgba(255,255,255,0.08)
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: const Color(0x1FFFFFFF), // rgba(255,255,255,0.12)
          ),
        ),
        child: Center(
          child: Text(
            role.slot,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.3,
              color: Color(0xF2EAF1FF),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildRoleLabel(RoleModel role) {
    final hasAssigned = role.assignedCode != null &&
        role.assignedCode!.isNotEmpty &&
        _isValidStaffCode(role.assignedCode!);
    final hasPending = !hasAssigned &&
        role.pendingCode != null &&
        role.pendingCode!.isNotEmpty &&
        _isValidStaffCode(role.pendingCode!);

    final statusText = hasAssigned
        ? role.assignedCode!
        : hasPending
            ? role.pendingCode!
            : '!';
    final statusType = hasAssigned
        ? _StatusType.assigned
        : hasPending
            ? _StatusType.pending
            : _StatusType.unassigned;

    return GestureDetector(
      onTap: () => onStatusTap(
        role.slot,
        hasAssigned ? role.assignedCode : hasPending ? role.pendingCode : null,
      ),
      child: Row(
        children: [
          // Role name
          Flexible(
            child: Text(
              role.label,
              style: const TextStyle(
                fontSize: 12,
                color: Color(0x94EAF1FF), // rgba(234,241,255,0.58) --muted2
              ),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ),

          // Time
          if (role.time.isNotEmpty) ...[
            const SizedBox(width: 8),
            Text(
              role.time,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w900,
                color: Color(0xB3EAF1FF), // rgba(234,241,255,0.7) --muted
              ),
            ),
          ],

          // Duration
          if (role.durationMin > 0) ...[
            const SizedBox(width: 6),
            Container(
              height: 18,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: const Color(0x0FFFFFFF), // rgba(255,255,255,0.06)
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: const Color(0x1AFFFFFFF), // rgba(255,255,255,0.1)
                ),
              ),
              child: Center(
                child: Text(
                  _formatDuration(role.durationMin),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.12,
                    color: Color(0xC7EAF1FF), // rgba(234,241,255,0.78)
                  ),
                ),
              ),
            ),
          ],

          // Status
          const SizedBox(width: 8),
          _buildStatus(statusText, statusType),
        ],
      ),
    );
  }

  Widget _buildStatus(String text, _StatusType type) {
    Color bgColor;
    Color borderColor;
    Color textColor;

    switch (type) {
      case _StatusType.assigned:
        // Normal assigned - no special styling
        return Text(
          text,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w900,
            color: const Color(0xFFEAF1FF).withOpacity(0.6),
          ),
        );

      case _StatusType.pending:
        bgColor = const Color(0x1AFFBE5C); // rgba(255,190,92,0.1)
        borderColor = const Color(0x4DFFBE5C); // rgba(255,190,92,0.3)
        textColor = const Color(0xEBEAF1FF); // rgba(234,241,255,0.92)
        break;

      case _StatusType.unassigned:
        bgColor = const Color(0x244ECDC4); // rgba(78,205,196,0.14)
        borderColor = const Color(0x524ECDC4); // rgba(78,205,196,0.32)
        textColor = const Color(0xEBEAF1FF);
        break;
    }

    return Container(
      constraints: const BoxConstraints(minWidth: 18),
      height: 18,
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: borderColor),
      ),
      child: Stack(
        children: [
          // Inset shadow simulation (top highlight)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              height: 1,
              decoration: BoxDecoration(
                color: const Color(0x0FFFFFFF), // rgba(255,255,255,0.06)
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(999),
                  topRight: Radius.circular(999),
                ),
              ),
            ),
          ),
          // Text
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 7),
              child: Text(
                text,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                  color: textColor,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRight() {
    // HTML lines 985-993: .right { gap: 4px, padding-top: 2px }
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Date
          Text(
            _formatDate(event.date),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w900, // HTML: font-weight: 900
              color: Color(0xDBEAF1FF), // rgba(234,241,255,0.86)
            ),
          ),

          // Cine noteaza
          if (event.cineNoteaza != null && event.cineNoteaza!.isNotEmpty) ...[
            const SizedBox(height: 4), // gap from .right
            Text(
              'Cine noteaza: ${event.cineNoteaza}',
              style: TextStyle(
                fontSize: 11,
                color: const Color(0xFFEAF1FF).withOpacity(0.6),
              ),
            ),
          ],

          // Șofer
          const SizedBox(height: 4), // gap from .right
          GestureDetector(
            onTap: _needsDriver() ? onDriverTap : null,
            child: Text(
              _driverText(),
              style: TextStyle(
                fontSize: 11,
                color: const Color(0xFFEAF1FF).withOpacity(0.6),
                decoration: _needsDriver() ? TextDecoration.underline : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(String dateStr) {
    // dateStr is DD-MM-YYYY
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

  String _formatDuration(int minutes) {
    if (minutes >= 60) {
      final hours = minutes ~/ 60;
      final mins = minutes % 60;
      if (mins == 0) return '${hours}h';
      return '${hours}h${mins}min';
    }
    return '${minutes}min';
  }

  bool _isValidStaffCode(String code) {
    final normalized = code.trim().toUpperCase();
    if (normalized.isEmpty) return false;
    // Valid patterns: A1, B2, BTRAINER, etc.
    return RegExp(r'^[A-Z][A-Z0-9]*$').hasMatch(normalized);
  }

  bool _needsDriver() {
    // Check if any role has slot 'S' (Șofer)
    return event.roles.any((r) => r.slot.toUpperCase() == 'S');
  }

  String _driverText() {
    final driverRole = event.roles.firstWhere(
      (r) => r.slot.toUpperCase() == 'S',
      orElse: () => RoleModel(
        slot: 'S',
        label: '',
        time: '',
        durationMin: 0,
      ),
    );

    if (driverRole.label.isEmpty) {
      return 'Șofer: nu necesită';
    }

    final hasAssigned = driverRole.assignedCode != null &&
        driverRole.assignedCode!.isNotEmpty &&
        _isValidStaffCode(driverRole.assignedCode!);
    final hasPending = !hasAssigned &&
        driverRole.pendingCode != null &&
        driverRole.pendingCode!.isNotEmpty &&
        _isValidStaffCode(driverRole.pendingCode!);

    if (hasAssigned) {
      return 'Șofer: ${driverRole.assignedCode}';
    } else if (hasPending) {
      return 'Șofer: ${driverRole.pendingCode} (pending)';
    } else {
      return 'Șofer: nerezervat';
    }
  }
}

enum _StatusType {
  assigned,
  pending,
  unassigned,
}
