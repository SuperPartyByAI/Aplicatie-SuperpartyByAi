import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/event_model.dart';
import '../../widgets/modals/range_modal.dart';
import '../../widgets/modals/code_modal.dart';
import '../../widgets/modals/assign_modal.dart';
import '../../widgets/modals/code_info_modal.dart';
import 'event_card_html.dart';
import '../evidence/evidence_screen.dart';

/// Evenimente Screen - 100% identic cu HTML (4522 linii)
/// Referință: kyc-app/kyc-app/public/evenimente.html
class EvenimenteScreen extends StatefulWidget {
  const EvenimenteScreen({super.key});

  @override
  State<EvenimenteScreen> createState() => _EvenimenteScreenState();
}

class _EvenimenteScreenState extends State<EvenimenteScreen> {
  final FocusNode _codeInputFocus = FocusNode();

  // Filtre - exact ca în HTML
  String _datePreset =
      'all'; // all, today, yesterday, last7, next7, next30, custom
  bool _sortAsc = false; // false = desc (↓), true = asc (↑)
  String _driverFilter = 'all'; // all, yes, open, no (conform HTML exact)
  String _codeFilter = '';
  String _notedByFilter = '';
  DateTime? _customStart;
  DateTime? _customEnd;

  // Removed _allEvents cache - events are passed directly to modals

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
          gradient: RadialGradient(
            center: Alignment(0.18, 0),
            radius: 1.5,
            colors: [
              Color(0x244ECDC4), // rgba(78,205,196,0.14) at 18% 0%
              Colors.transparent,
            ],
            stops: [0, 0.62],
          ),
        ),
        child: Container(
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0.86, 0.1),
              radius: 1.3,
              colors: [
                Color(0x1960A5FA), // rgba(96,165,250,0.10) at 86% 10%
                Colors.transparent,
              ],
              stops: [0, 0.58],
            ),
          ),
          child: Container(
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
            color: const Color(0xFF0B1220)
                .withOpacity(0.72), // rgba(11,18,32,0.72)
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
              // HTML: .appbar { padding: 14px 16px; }
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Center(
                // HTML: .appbar-inner { max-width: 920px; margin: 0 auto; }
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 920),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Evenimente',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.2,
                          color: Color(0xFFEAF1FF),
                        ),
                      ),
                      const SizedBox(height: 10),
                      ConstrainedBox(
                        // HTML: .filters-block { max-width: 640px; }
                        constraints: const BoxConstraints(maxWidth: 640),
                        child: _buildFiltersBlock(),
                      ),
                    ],
                  ),
                ),
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
              color: const Color(0xFFEAF1FF).withOpacity(0.65), // --muted
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFiltersDate() {
    return Row(
      children: [
        // Date preset dropdown
        _buildDatePresetDropdown(),
        const SizedBox(width: 0),

        // Sort button
        _buildSortButton(),
        const SizedBox(width: 0),

        // Driver button
        _buildDriverButton(),
      ],
    );
  }

  Widget _buildDatePresetDropdown() {
    return Container(
      width: 230,
      height: 36,
      padding: const EdgeInsets.only(left: 8, right: 28),
      decoration: BoxDecoration(
        color: const Color(0x14FFFFFF), // rgba(255,255,255,0.08)
        border: Border.all(
          color: const Color(0x2EFFFFFF), // rgba(255,255,255,0.18)
        ),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(12),
          bottomLeft: Radius.circular(12),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withOpacity(0.06),
            offset: const Offset(0, 1),
            blurRadius: 0,
          ),
        ],
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _datePreset,
          dropdownColor: const Color(0xFF0B1220),
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w900,
            color: Color(0xFFEAF1FF),
            letterSpacing: 0.1,
          ),
          icon: const Icon(
            Icons.arrow_drop_down,
            color: Color(0xB3EAF1FF),
            size: 18,
          ),
          items: const [
            DropdownMenuItem(value: 'all', child: Text('Toate')),
            DropdownMenuItem(value: 'today', child: Text('Azi')),
            DropdownMenuItem(value: 'yesterday', child: Text('Ieri')),
            DropdownMenuItem(value: 'last7', child: Text('Ultimele 7 zile')),
            DropdownMenuItem(value: 'next7', child: Text('Urmatoarele 7 zile')),
            DropdownMenuItem(
                value: 'next30', child: Text('Urmatoarele 30 zile')),
            DropdownMenuItem(
                value: 'custom', child: Text('Interval (aleg eu)')),
          ],
          onChanged: (value) {
            if (value == null) return;
            setState(() {
              _datePreset = value;
            });
            if (value == 'custom') {
              _openRangeModal();
            }
          },
        ),
      ),
    );
  }

  Widget _buildSortButton() {
    return GestureDetector(
      onTap: () {
        setState(() {
          _sortAsc = !_sortAsc;
        });
      },
      child: Container(
        width: 44,
        height: 36,
        decoration: BoxDecoration(
          color: const Color(0x14FFFFFF), // rgba(255,255,255,0.08)
          // HTML uses margin-left:-1px; simulate by removing left border.
          border: const Border(
            top: BorderSide(color: Color(0x24FFFFFF), width: 1),
            right: BorderSide(color: Color(0x24FFFFFF), width: 1),
            bottom: BorderSide(color: Color(0x24FFFFFF), width: 1),
            left: BorderSide.none,
          ),
          borderRadius: BorderRadius.zero,
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
                    : const Color(0xFFEAF1FF).withOpacity(0.45),
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
                    : const Color(0xFFEAF1FF).withOpacity(0.45),
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDriverButton() {
    // 4 states: all, yes, open, no (EXACT din HTML - lines 1695, 4213)
    // Badge text: T, NEC, NRZ, NU
    final badgeText = {
      'all': 'T',
      'yes': 'NEC',
      'open': 'NRZ',
      'no': 'NU',
    };

    final badgeColors = {
      'all': const Color(0x1FEAF1FF), // rgba(234,241,255,0.12)
      'yes': const Color(0x474ECDC4), // rgba(78,205,196,0.28)
      'open': const Color(0x244ECDC4), // rgba(78,205,196,0.14)
      'no': const Color(0x2E000000), // rgba(0,0,0,0.18)
    };

    final badgeBorderColors = {
      'all': const Color(0x2EFFFFFF), // rgba(255,255,255,0.18)
      'yes': const Color(0x804ECDC4), // rgba(78,205,196,0.5)
      'open': const Color(0x524ECDC4), // rgba(78,205,196,0.32)
      'no': const Color(0x42FFFFFF), // rgba(255,255,255,0.26)
    };

    return GestureDetector(
      onTap: () {
        setState(() {
          // Cycle: all → yes → open → no → all (EXACT din HTML nextDriverState)
          switch (_driverFilter) {
            case 'all':
              _driverFilter = 'yes';
              break;
            case 'yes':
              _driverFilter = 'open';
              break;
            case 'open':
              _driverFilter = 'no';
              break;
            case 'no':
              _driverFilter = 'all';
              break;
          }
        });
      },
      child: Container(
        width: 44,
        height: 36,
        decoration: BoxDecoration(
          color: const Color(0x14FFFFFF), // rgba(255,255,255,0.08)
          // HTML uses margin-left:-1px; simulate by removing left border.
          border: const Border(
            top: BorderSide(color: Color(0x24FFFFFF), width: 1),
            right: BorderSide(color: Color(0x24FFFFFF), width: 1),
            bottom: BorderSide(color: Color(0x24FFFFFF), width: 1),
            left: BorderSide.none,
          ),
          borderRadius: const BorderRadius.only(
            topRight: Radius.circular(12),
            bottomRight: Radius.circular(12),
          ),
        ),
        child: Stack(
          children: [
            // Steering wheel icon
            Center(
              child: Icon(
                Icons.directions_car_outlined,
                size: _driverFilter == 'all' ? 22 : 20,
                color: const Color(0xD1EAF1FF), // rgba(234,241,255,0.82)
              ),
            ),
            // Badge (top-right corner)
            Positioned(
              right: 6,
              top: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                decoration: BoxDecoration(
                  color: badgeColors[_driverFilter],
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: badgeBorderColors[_driverFilter]!,
                    width: 1,
                  ),
                ),
                child: Text(
                  badgeText[_driverFilter]!,
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.2,
                    color: Color(0xDBEAF1FF), // rgba(234,241,255,0.86)
                    height: 1,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFiltersExtra() {
    return Row(
      children: [
        // Input "Ce cod am"
        _buildCodeFilterInput(),
        const SizedBox(width: 2),

        // Separator
        Text(
          '–',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w900,
            color: const Color(0xFFEAF1FF).withOpacity(0.55),
          ),
        ),
        const SizedBox(width: 2),

        // Input "Cine noteaza"
        _buildNotedByFilterInput(),

        // Gap + spacer pentru aliniere cu sort button (HTML: .filters gap 12px + .btnspacer)
        const Spacer(),
        SizedBox(
          width: 44,
          child: Opacity(
            opacity: 0,
            child: _buildSortButton(),
          ),
        ),
      ],
    );
  }

  Widget _buildCodeFilterInput() {
    return GestureDetector(
      onTapDown: (_) {
        _openCodeModal();
      },
      child: Container(
        width: 150,
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          color: const Color(0x38000000), // rgba(0,0,0,0.22)
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0x24FFFFFF)), // rgba(255,255,255,0.14)
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
            letterSpacing: 0.1,
          ),
          decoration: InputDecoration(
            hintText: 'Ce cod am',
            hintStyle: TextStyle(
              fontSize: 12,
              color: const Color(0xFFEAF1FF).withOpacity(0.55),
            ),
            border: InputBorder.none,
            isDense: true,
            contentPadding: EdgeInsets.zero,
          ),
        ),
      ),
    );
  }

  Widget _buildNotedByFilterInput() {
    return Container(
      width: 150,
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: const Color(0x38000000), // rgba(0,0,0,0.22)
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x24FFFFFF)), // rgba(255,255,255,0.14)
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
          letterSpacing: 0.1,
        ),
        decoration: InputDecoration(
          hintText: 'Cine noteaza',
          hintStyle: TextStyle(
            fontSize: 12,
            color: const Color(0xFFEAF1FF).withOpacity(0.55),
          ),
          border: InputBorder.none,
          isDense: true,
          contentPadding: EdgeInsets.zero,
        ),
      ),
    );
  }

  Widget _buildEventsList() {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance.collection('evenimente').snapshots(),
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

        final events = snapshot.data?.docs.map((doc) {
              return EventModel.fromFirestore(doc);
            }).toList() ??
            [];
        final filteredEvents = _applyFilters(events);

        if (filteredEvents.isEmpty) {
          // HTML: inside .wrap { padding: 12px }, then .empty { margin-top: 14px; padding: 14px; }
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 920),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Container(
                  margin: const EdgeInsets.only(top: 14),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0x0DFFFFFF), // rgba(255,255,255,0.05)
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: const Color(0x1AFFFFFF), // rgba(255,255,255,0.10)
                    ),
                  ),
                  child: Text(
                    'Nu există evenimente pentru filtrele selectate.',
                    style: TextStyle(
                      fontSize: 14,
                      color: const Color(0xFFEAF1FF).withOpacity(0.75),
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          );
        }

        // HTML: .wrap { max-width: 920px; margin: 0 auto; padding: 12px; }
        // HTML: .cards { gap: 10px; padding-bottom: 24px; }
        return Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 920),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
              itemCount: filteredEvents.length,
              itemBuilder: (context, index) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _buildEventCard(filteredEvents[index], events),
                );
              },
            ),
          ),
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

    // Sort (HTML lines 2611-2617: sortEvents function)
    filtered.sort((a, b) {
      final dateA = _parseStart(a);
      final dateB = _parseStart(b);
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
        final eventDay =
            DateTime(eventDate.year, eventDate.month, eventDate.day);
        return eventDay == today;

      case 'yesterday':
        final yesterday = today.subtract(const Duration(days: 1));
        final eventDay =
            DateTime(eventDate.year, eventDate.month, eventDate.day);
        return eventDay == yesterday;

      case 'last7':
        final last7 = today.subtract(const Duration(days: 7));
        return eventDate.isAfter(last7) &&
            eventDate.isBefore(today.add(const Duration(days: 1)));

      case 'next7':
        final next7 = today.add(const Duration(days: 7));
        return eventDate.isAfter(today.subtract(const Duration(days: 1))) &&
            eventDate.isBefore(next7.add(const Duration(days: 1)));

      case 'next30':
        final next30 = today.add(const Duration(days: 30));
        return eventDate.isAfter(today.subtract(const Duration(days: 1))) &&
            eventDate.isBefore(next30.add(const Duration(days: 1)));

      case 'custom':
        if (_customStart != null && _customEnd != null) {
          return eventDate
                  .isAfter(_customStart!.subtract(const Duration(days: 1))) &&
              eventDate.isBefore(_customEnd!.add(const Duration(days: 1)));
        }
        return true;

      default:
        return true;
    }
  }

  bool _matchesDriverFilter(EventModel event) {
    switch (_driverFilter) {
      case 'all':
        return true;

      case 'yes':
        return event.needsDriver;

      case 'open':
        if (!event.needsDriver) return false;
        return !event.hasDriverAssigned;

      case 'no':
        return !event.needsDriver;

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
      final isoMatch = RegExp(r'^([0-9]{4})-([0-9]{2})-([0-9]{2})$').firstMatch(dateStr);
      if (isoMatch != null) {
        final year = int.parse(isoMatch.group(1)!);
        final month = int.parse(isoMatch.group(2)!);
        final day = int.parse(isoMatch.group(3)!);
        return DateTime(year, month, day);
      }
      final parts = dateStr.split('-');
      if (parts.length == 3) {
        final day = int.tryParse(parts[0]);
        final month = int.tryParse(parts[1]);
        final year = int.tryParse(parts[2]);
        if (day != null && month != null && year != null) {
          return DateTime(year, month, day);
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  DateTime? _parseStart(EventModel event) {
    // HTML lines 1930-1940: parseStart function
    String time = '00:00';
    if (event.roles.isNotEmpty && event.roles[0].time.isNotEmpty) {
      time = event.roles[0].time;
    }
    final dateStr = event.date;
    final isoMatch = RegExp(r'^([0-9]{4})-([0-9]{2})-([0-9]{2})$').firstMatch(dateStr);
    if (isoMatch != null) {
      final year = int.parse(isoMatch.group(1)!);
      final month = int.parse(isoMatch.group(2)!);
      final day = int.parse(isoMatch.group(3)!);
      final timeParts = time.split(':');
      final hour = timeParts.length >= 1 ? int.tryParse(timeParts[0]) ?? 0 : 0;
      final minute = timeParts.length >= 2 ? int.tryParse(timeParts[1]) ?? 0 : 0;
      return DateTime(year, month, day, hour, minute);
    }
    final date = _parseDate(dateStr);
    if (date != null) {
      final timeParts = time.split(':');
      final hour = timeParts.length >= 1 ? int.tryParse(timeParts[0]) ?? 0 : 0;
      final minute = timeParts.length >= 2 ? int.tryParse(timeParts[1]) ?? 0 : 0;
      return DateTime(date.year, date.month, date.day, hour, minute);
    }
    return null;
  }

  bool _isValidStaffCode(String code) {
    // HTML lines 1915-1920: isValidStaffCode function
    final normalized = code.trim().toUpperCase();
    if (normalized.isEmpty) return false;
    final trainerPattern = RegExp(r'^[A-Z]TRAINER$');
    final memberPattern = RegExp(r'^[A-Z]([1-9]|[1-4][0-9]|50)$');
    return trainerPattern.hasMatch(normalized) || memberPattern.hasMatch(normalized);
  }

  Widget _buildEventCard(EventModel event, List<EventModel> allEvents) {
    return EventCardHtml(
      event: event,
      codeFilter: _codeFilter, // Pass filter for buildVisibleRoles
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => EvidenceScreen(eventId: event.id),
          ),
        );
      },
      onSlotTap: (slot) {
        _openAssignModal(event, slot);
      },
      onStatusTap: (slot, code) {
        if (code != null && code.isNotEmpty) {
          _openCodeInfoModal(code, allEvents);
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
          if (value == 'FOCUS_INPUT') {
            setState(() {
              _codeFilter = '';
            });
            if (!mounted) return;
            if (_codeInputFocus.canRequestFocus) {
              _codeInputFocus.requestFocus();
            }
            return;
          }
          setState(() {
            // Set filter value (NEREZOLVATE, REZOLVATE, or empty)
            _codeFilter = value;
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

  void _openCodeInfoModal(String code, List<EventModel> events) {
    showDialog(
      context: context,
      barrierColor: Colors.transparent,
      builder: (context) => CodeInfoModal(
        code: code,
        events: events,
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

      final data = eventDoc.data();
      if (data == null || data is! Map<String, dynamic>) {
        print('[Evenimente] Event data is null');
        throw Exception('Event data is null');
      }
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

      final data = eventDoc.data();
      if (data == null || data is! Map<String, dynamic>) {
        print('[Evenimente] Event data is null');
        throw Exception('Event data is null');
      }

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
