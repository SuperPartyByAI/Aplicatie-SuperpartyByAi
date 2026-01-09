import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/event_model.dart';
import '../../services/event_service.dart';
import '../../widgets/modals/range_modal.dart';
import '../../widgets/modals/code_modal.dart';
import '../../widgets/modals/assign_modal.dart';
import 'event_card_html.dart';

/// Evenimente Screen - 100% identic cu HTML (4522 linii)
/// Referință: kyc-app/kyc-app/public/evenimente.html
class EvenimenteScreenHtml extends StatefulWidget {
  const EvenimenteScreenHtml({super.key});

  @override
  State<EvenimenteScreenHtml> createState() => _EvenimenteScreenHtmlState();
}

class _EvenimenteScreenHtmlState extends State<EvenimenteScreenHtml> {
  final EventService _eventService = EventService();
  final FocusNode _codeInputFocus = FocusNode();

  // Filtre - exact ca în HTML
  String _datePreset = 'all'; // all, today, yesterday, last7, next7, next30, custom
  bool _sortAsc = false; // false = desc (↓), true = asc (↑)
  String _driverFilter = 'all'; // all, needs, needsUnassigned, noNeed
  String _codeFilter = '';
  String _notedByFilter = '';
  DateTime? _customStart;
  DateTime? _customEnd;

  @override
  void dispose() {
    _codeInputFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFF111C35), // --bg2
              Color(0xFF0B1220), // --bg
            ],
          ),
        ),
        child: Column(
          children: [
            _buildAppBar(),
            Expanded(
              child: _buildEventsList(),
            ),
          ],
        ),
      ),
    );
  }

  /// AppBar sticky cu filtre - identic cu HTML
  Widget _buildAppBar() {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF0B1220).withOpacity(0.72), // rgba(11,18,32,0.72)
            border: const Border(
              bottom: BorderSide(
                color: Color(0x14FFFFFF), // rgba(255,255,255,0.08)
                width: 1,
              ),
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Titlu
                  const Text(
                    'Evenimente',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.2,
                      color: Color(0xFFEAF1FF), // --text
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Filters block
                  _buildFiltersBlock(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFiltersBlock() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Filtru dată (preset + sort + driver)
        _buildFiltersDate(),
        const SizedBox(height: 4),

        // Filtru extra (cod + cine noteaza)
        _buildFiltersExtra(),
        const SizedBox(height: 4),

        // Hint text
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
          child: Text(
            'Click pe card deschide pagina de dovezi. Click pe slot sau pe cod pastreaza alocarea/tab cod.',
            style: TextStyle(
              fontSize: 11,
              color: const Color(0xFFEAF1FF).withOpacity(0.7), // --muted
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFiltersDate() {
    return Row(
      children: [
        Expanded(
          child: Row(
            children: [
              // Date preset dropdown
              Expanded(
                child: _buildDatePresetDropdown(),
              ),
              const SizedBox(width: 0),

              // Sort button
              _buildSortButton(),
              const SizedBox(width: 0),

              // Driver button
              _buildDriverButton(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildDatePresetDropdown() {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: const Color(0x0FFFFFFF), // rgba(255,255,255,0.06)
        border: Border.all(
          color: const Color(0x24FFFFFF), // rgba(255,255,255,0.14)
        ),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(12),
          bottomLeft: Radius.circular(12),
        ),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _datePreset,
          dropdownColor: const Color(0xFF111C35),
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w900,
            color: Color(0xFFEAF1FF),
            letterSpacing: 0.15,
          ),
          icon: const Icon(
            Icons.arrow_drop_down,
            color: Color(0xB3EAF1FF),
            size: 20,
          ),
          items: const [
            DropdownMenuItem(value: 'all', child: Text('Toate')),
            DropdownMenuItem(value: 'today', child: Text('Azi')),
            DropdownMenuItem(value: 'yesterday', child: Text('Ieri')),
            DropdownMenuItem(value: 'last7', child: Text('Ultimele 7 zile')),
            DropdownMenuItem(value: 'next7', child: Text('Urmatoarele 7 zile')),
            DropdownMenuItem(value: 'next30', child: Text('Urmatoarele 30 zile')),
            DropdownMenuItem(value: 'custom', child: Text('Interval (aleg eu)')),
          ],
          onChanged: (value) {
            if (value != null) {
              setState(() {
                _datePreset = value;
                if (value == 'custom') {
                  _openRangeModal();
                }
              });
            }
          },
        ),
      ),
    );
  }

  Widget _buildSortButton() {
    return InkWell(
      onTap: () {
        setState(() {
          _sortAsc = !_sortAsc;
        });
      },
      child: Container(
        width: 52,
        height: 36,
        decoration: BoxDecoration(
          color: const Color(0x0FFFFFFF),
          border: const Border(
            top: BorderSide(color: Color(0x24FFFFFF)),
            bottom: BorderSide(color: Color(0x24FFFFFF)),
            left: BorderSide(color: Color(0x1FFFFFFF)),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '↑',
              style: TextStyle(
                fontSize: 14,
                color: _sortAsc
                    ? const Color(0xFFEAF1FF)
                    : const Color(0xFFEAF1FF).withOpacity(0.35),
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '↓',
              style: TextStyle(
                fontSize: 14,
                color: !_sortAsc
                    ? const Color(0xFFEAF1FF)
                    : const Color(0xFFEAF1FF).withOpacity(0.35),
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDriverButton() {
    // 4 states: all, needs, needsUnassigned, noNeed
    final icons = {
      'all': Icons.local_shipping_outlined,
      'needs': Icons.local_shipping,
      'needsUnassigned': Icons.local_shipping_outlined,
      'noNeed': Icons.block,
    };

    final labels = {
      'all': 'Toate',
      'needs': 'Necesită',
      'needsUnassigned': 'Necesită nerezervat',
      'noNeed': 'Nu necesită',
    };

    return InkWell(
      onTap: () {
        setState(() {
          // Cycle through states
          switch (_driverFilter) {
            case 'all':
              _driverFilter = 'needs';
              break;
            case 'needs':
              _driverFilter = 'needsUnassigned';
              break;
            case 'needsUnassigned':
              _driverFilter = 'noNeed';
              break;
            case 'noNeed':
              _driverFilter = 'all';
              break;
          }
        });
      },
      child: Container(
        width: 44,
        height: 36,
        decoration: BoxDecoration(
          color: const Color(0x0FFFFFFF),
          border: const Border(
            top: BorderSide(color: Color(0x24FFFFFF)),
            bottom: BorderSide(color: Color(0x24FFFFFF)),
            right: BorderSide(color: Color(0x24FFFFFF)),
            left: BorderSide(color: Color(0x1FFFFFFF)),
          ),
          borderRadius: const BorderRadius.only(
            topRight: Radius.circular(12),
            bottomRight: Radius.circular(12),
          ),
        ),
        child: Icon(
          icons[_driverFilter],
          size: 18,
          color: const Color(0xD1EAF1FF), // rgba(234,241,255,0.82)
        ),
      ),
    );
  }

  Widget _buildFiltersExtra() {
    return Row(
      children: [
        Expanded(
          child: Row(
            children: [
              // Input "Ce cod am"
              Expanded(
                child: _buildCodeFilterInput(),
              ),
              const SizedBox(width: 8),

              // Separator
              Text(
                '–',
                style: TextStyle(
                  fontSize: 14,
                  color: const Color(0xFFEAF1FF).withOpacity(0.5),
                ),
              ),
              const SizedBox(width: 8),

              // Input "Cine noteaza"
              Expanded(
                child: _buildNotedByFilterInput(),
              ),
            ],
          ),
        ),

        // Spacer pentru aliniere cu sort button
        const SizedBox(width: 52),
      ],
    );
  }

  Widget _buildCodeFilterInput() {
    return GestureDetector(
      onTap: () {
        // If input has valid code, don't open modal (let user edit)
        if (_codeFilter.isNotEmpty && _isValidStaffCode(_codeFilter)) {
          _codeInputFocus.requestFocus();
          return;
        }
        // Otherwise open modal
        _openCodeModal();
      },
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: const Color(0x0FFFFFFF),
          border: Border.all(color: const Color(0x24FFFFFF)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: TextField(
          focusNode: _codeInputFocus,
          onChanged: (value) {
            setState(() {
              _codeFilter = value.trim().toUpperCase();
            });
          },
          style: const TextStyle(
            fontSize: 12,
            color: Color(0xFFEAF1FF),
            fontWeight: FontWeight.w500,
          ),
          decoration: InputDecoration(
            hintText: 'Ce cod am',
            hintStyle: TextStyle(
              fontSize: 12,
              color: const Color(0xFFEAF1FF).withOpacity(0.55),
            ),
            border: InputBorder.none,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(vertical: 10),
          ),
        ),
      ),
    );
  }

  Widget _buildNotedByFilterInput() {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: const Color(0x0FFFFFFF),
        border: Border.all(color: const Color(0x24FFFFFF)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: TextField(
        onChanged: (value) {
          setState(() {
            _notedByFilter = value.trim().toUpperCase();
          });
        },
        style: const TextStyle(
          fontSize: 12,
          color: Color(0xFFEAF1FF),
          fontWeight: FontWeight.w500,
        ),
        decoration: InputDecoration(
          hintText: 'Cine noteaza',
          hintStyle: TextStyle(
            fontSize: 12,
            color: const Color(0xFFEAF1FF).withOpacity(0.55),
          ),
          border: InputBorder.none,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 10),
        ),
      ),
    );
  }

  Widget _buildEventsList() {
    return StreamBuilder<List<EventModel>>(
      stream: _eventService.getEventsStream(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(
              color: Color(0xFF4ECDC4), // --accent
            ),
          );
        }

        if (snapshot.hasError) {
          return Center(
            child: Text(
              'Eroare: ${snapshot.error}',
              style: const TextStyle(color: Color(0xFFFF7878)), // --bad
            ),
          );
        }

        final events = snapshot.data ?? [];
        final filteredEvents = _applyFilters(events);

        if (filteredEvents.isEmpty) {
          return Center(
            child: Text(
              'Nu există evenimente',
              style: TextStyle(
                fontSize: 14,
                color: const Color(0xFFEAF1FF).withOpacity(0.7),
              ),
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: filteredEvents.length,
          itemBuilder: (context, index) {
            return _buildEventCard(filteredEvents[index]);
          },
        );
      },
    );
  }

  List<EventModel> _applyFilters(List<EventModel> events) {
    var filtered = events.where((e) => !e.isArchived).toList();

    // Filter by date preset
    filtered = filtered.where((e) => _matchesDateFilter(e)).toList();

    // Filter by driver
    filtered = filtered.where((e) => _matchesDriverFilter(e)).toList();

    // Filter by notedBy
    if (_notedByFilter.isNotEmpty) {
      filtered = filtered.where((e) {
        final notedBy = _notedByFilter.trim().toUpperCase();
        if (!_isValidStaffCode(notedBy)) return false;
        return (e.cineNoteaza ?? '').trim().toUpperCase() == notedBy;
      }).toList();
    }

    // Filter by code
    if (_codeFilter.isNotEmpty) {
      filtered = filtered.where((e) => _matchesCodeFilter(e)).toList();
    }

    // Sort
    filtered.sort((a, b) {
      final dateA = _parseDate(a.date);
      final dateB = _parseDate(b.date);
      if (dateA == null || dateB == null) return 0;
      final comparison = dateA.compareTo(dateB);
      return _sortAsc ? comparison : -comparison;
    });

    return filtered;
  }

  bool _matchesDateFilter(EventModel event) {
    final eventDate = _parseDate(event.date);
    if (eventDate == null) return false;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    switch (_datePreset) {
      case 'all':
        return true;

      case 'today':
        final eventDay = DateTime(eventDate.year, eventDate.month, eventDate.day);
        return eventDay == today;

      case 'yesterday':
        final yesterday = today.subtract(const Duration(days: 1));
        final eventDay = DateTime(eventDate.year, eventDate.month, eventDate.day);
        return eventDay == yesterday;

      case 'last7':
        final last7 = today.subtract(const Duration(days: 7));
        return eventDate.isAfter(last7) && eventDate.isBefore(today.add(const Duration(days: 1)));

      case 'next7':
        final next7 = today.add(const Duration(days: 7));
        return eventDate.isAfter(today.subtract(const Duration(days: 1))) && eventDate.isBefore(next7.add(const Duration(days: 1)));

      case 'next30':
        final next30 = today.add(const Duration(days: 30));
        return eventDate.isAfter(today.subtract(const Duration(days: 1))) && eventDate.isBefore(next30.add(const Duration(days: 1)));

      case 'custom':
        if (_customStart != null && _customEnd != null) {
          return eventDate.isAfter(_customStart!.subtract(const Duration(days: 1))) &&
              eventDate.isBefore(_customEnd!.add(const Duration(days: 1)));
        }
        return true;

      default:
        return true;
    }
  }

  bool _matchesDriverFilter(EventModel event) {
    final needsDriver = event.roles.any((r) => r.slot.toUpperCase() == 'S');

    switch (_driverFilter) {
      case 'all':
        return true;

      case 'needs':
        return needsDriver;

      case 'needsUnassigned':
        if (!needsDriver) return false;
        final driverRole = event.roles.firstWhere(
          (r) => r.slot.toUpperCase() == 'S',
          orElse: () => RoleModel(slot: 'S', label: '', time: '', durationMin: 0),
        );
        final hasAssigned = driverRole.assignedCode != null &&
            driverRole.assignedCode!.isNotEmpty &&
            _isValidStaffCode(driverRole.assignedCode!);
        return !hasAssigned;

      case 'noNeed':
        return !needsDriver;

      default:
        return true;
    }
  }

  bool _matchesCodeFilter(EventModel event) {
    final code = _codeFilter.trim().toUpperCase();
    if (code.isEmpty) return true;

    // Special values
    if (code == 'NEREZOLVATE') {
      // Has at least one unassigned role (!)
      return event.roles.any((r) {
        final hasAssigned = r.assignedCode != null &&
            r.assignedCode!.isNotEmpty &&
            _isValidStaffCode(r.assignedCode!);
        final hasPending = !hasAssigned &&
            r.pendingCode != null &&
            r.pendingCode!.isNotEmpty &&
            _isValidStaffCode(r.pendingCode!);
        return !hasAssigned && !hasPending;
      });
    }

    if (code == 'REZOLVATE') {
      // All roles are assigned or pending
      return event.roles.every((r) {
        final hasAssigned = r.assignedCode != null &&
            r.assignedCode!.isNotEmpty &&
            _isValidStaffCode(r.assignedCode!);
        final hasPending = !hasAssigned &&
            r.pendingCode != null &&
            r.pendingCode!.isNotEmpty &&
            _isValidStaffCode(r.pendingCode!);
        return hasAssigned || hasPending;
      });
    }

    // Search for specific code in roles
    return event.roles.any((r) {
      final assigned = (r.assignedCode ?? '').trim().toUpperCase();
      final pending = (r.pendingCode ?? '').trim().toUpperCase();
      return assigned == code || pending == code;
    });
  }

  DateTime? _parseDate(String dateStr) {
    try {
      final parts = dateStr.split('-');
      if (parts.length != 3) return null;
      final day = int.tryParse(parts[0]);
      final month = int.tryParse(parts[1]);
      final year = int.tryParse(parts[2]);
      if (day == null || month == null || year == null) return null;
      return DateTime(year, month, day);
    } catch (e) {
      return null;
    }
  }

  bool _isValidStaffCode(String code) {
    final normalized = code.trim().toUpperCase();
    if (normalized.isEmpty) return false;
    return RegExp(r'^[A-Z][A-Z0-9]*$').hasMatch(normalized);
  }

  Widget _buildEventCard(EventModel event) {
    return EventCardHtml(
      event: event,
      onTap: () {
        // TODO: Open evidence page (Faza 6)
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Pagina dovezi - în implementare'),
            duration: Duration(seconds: 1),
          ),
        );
      },
      onSlotTap: (slot) {
        _openAssignModal(event, slot);
      },
      onStatusTap: (slot, code) {
        if (code != null && code.isNotEmpty) {
          // TODO: Open code info modal (Faza 5.4)
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Info cod: $code - în implementare'),
              duration: const Duration(seconds: 1),
            ),
          );
        } else {
          _openAssignModal(event, slot);
        }
      },
      onDriverTap: () {
        _openAssignModal(event, 'S');
      },
    );
  }

  void _openRangeModal() {
    showDialog(
      context: context,
      barrierColor: Colors.transparent,
      builder: (context) => RangeModal(
        initialStart: _customStart,
        initialEnd: _customEnd,
        onRangeSelected: (start, end) {
          setState(() {
            _customStart = start;
            _customEnd = end;
            if (start == null && end == null) {
              _datePreset = 'all';
            }
          });
        },
      ),
    );
  }

  void _openCodeModal() {
    showDialog(
      context: context,
      barrierColor: Colors.transparent,
      builder: (context) => CodeModal(
        onOptionSelected: (value) {
          setState(() {
            if (value == 'FOCUS_INPUT') {
              // Clear and focus input
              _codeFilter = '';
              Future.delayed(const Duration(milliseconds: 100), () {
                _codeInputFocus.requestFocus();
              });
            } else {
              // Set filter value (NEREZOLVATE, REZOLVATE, or empty)
              _codeFilter = value;
            }
          });
        },
      ),
    );
  }

  void _openAssignModal(EventModel event, String slot) {
    showDialog(
      context: context,
      barrierColor: Colors.transparent,
      builder: (context) => AssignModal(
        event: event,
        slot: slot,
        onAssign: (code) async {
          if (code != null && code.isNotEmpty) {
            await _saveAssignment(event.id, slot, code);
          }
        },
        onClear: () async {
          await _clearAssignment(event.id, slot);
        },
      ),
    );
  }

  Future<void> _saveAssignment(String eventId, String slot, String code) async {
    try {
      final db = FirebaseFirestore.instance;
      final eventRef = db.collection('evenimente').doc(eventId);

      // Get current event data
      final eventDoc = await eventRef.get();
      if (!eventDoc.exists) {
        throw Exception('Event not found');
      }

      final data = eventDoc.data()!;
      final roles = (data['roles'] as List<dynamic>?) ?? [];

      // Find role by slot
      final roleIndex = roles.indexWhere((r) => r['slot'] == slot);
      if (roleIndex == -1) {
        throw Exception('Role not found');
      }

      // Update role with pendingCode (not assignedCode - needs approval)
      roles[roleIndex]['pendingCode'] = code;

      // Save to Firestore
      await eventRef.update({
        'roles': roles,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Cerere trimisă pentru $slot: $code'),
            backgroundColor: const Color(0xFF4ECDC4),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: $e'),
            backgroundColor: const Color(0xFFFF7878),
          ),
        );
      }
    }
  }

  Future<void> _clearAssignment(String eventId, String slot) async {
    try {
      final db = FirebaseFirestore.instance;
      final eventRef = db.collection('evenimente').doc(eventId);

      // Get current event data
      final eventDoc = await eventRef.get();
      if (!eventDoc.exists) {
        throw Exception('Event not found');
      }

      final data = eventDoc.data()!;
      final roles = (data['roles'] as List<dynamic>?) ?? [];

      // Find role by slot
      final roleIndex = roles.indexWhere((r) => r['slot'] == slot);
      if (roleIndex == -1) {
        throw Exception('Role not found');
      }

      // Clear both assignedCode and pendingCode
      roles[roleIndex]['assignedCode'] = null;
      roles[roleIndex]['pendingCode'] = null;

      // Save to Firestore
      await eventRef.update({
        'roles': roles,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Alocare ștearsă pentru $slot'),
            backgroundColor: const Color(0xFF4ECDC4),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: $e'),
            backgroundColor: const Color(0xFFFF7878),
          ),
        );
      }
    }
  }
}
