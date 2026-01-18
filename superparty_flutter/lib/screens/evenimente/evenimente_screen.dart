import 'dart:ui' show ImageFilter;
import 'dart:io';
import 'dart:async'; // For TimeoutException
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/event_model.dart';
import '../../widgets/modals/range_modal.dart';
import '../../widgets/modals/code_modal.dart';
import '../../widgets/modals/assign_modal.dart';
import '../../widgets/modals/code_info_modal.dart';
import '../../services/firebase_service.dart';
import 'event_card_html.dart';
import 'dovezi_screen_html.dart';

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
  String _datePreset = 'all'; // all, today, yesterday, last7, next7, next30, custom
  bool _sortAsc = false; // false = desc (↓), true = asc (↑)
  String _driverFilter = 'all'; // all, yes, open, no (conform HTML exact)
  String _codeFilter = '';
  String _notedByFilter = '';
  DateTime? _customStart;
  DateTime? _customEnd;

  // Cache events for CodeInfoModal
  List<EventModel> _allEvents = [];

  @override
  void initState() {
    super.initState();
    // #region agent log
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    try {
      final user = FirebaseService.currentUser;
      final logEntry = {
        'id': 'ev_init_$timestamp',
        'timestamp': timestamp,
        'location': 'evenimente_screen.dart:initState',
        'message': '[EV] Enter EvenimenteScreen',
        'data': {
          'userIsNull': user == null,
          'userId': user?.uid,
          'userEmail': user?.email != null ? '${user!.email!.substring(0, 2)}***' : null,
        },
        'sessionId': 'debug-session',
        'runId': 'run1',
        'hypothesisId': 'C',
      };
      File('/Users/universparty/.cursor/debug.log').writeAsStringSync('${jsonEncode(logEntry)}\n', mode: FileMode.append);
    } catch (_) {}
    // #endregion
  }

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
            color: const Color(0xFF0B1220).withValues(alpha: 0.72), // rgba(11,18,32,0.72)
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
            'Filtrele sunt exclusive (NU se combină)',
            style: TextStyle(
              fontSize: 11,
              color: const Color(0xFFEAF1FF).withValues(alpha: 0.7), // --muted
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
    return GestureDetector(
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
          border: Border.all(color: const Color(0x24FFFFFF)),
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
                    : const Color(0xFFEAF1FF).withValues(alpha: 0.35),
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
                    : const Color(0xFFEAF1FF).withValues(alpha: 0.35),
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
          color: const Color(0x0FFFFFFF),
          border: Border.all(color: const Color(0x24FFFFFF)),
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
                Icons.local_shipping_outlined,
                size: _driverFilter == 'all' ? 22 : 20,
                color: const Color(0xF2EAF1FF), // rgba(234,241,255,0.95)
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
                  color: const Color(0xFFEAF1FF).withValues(alpha: 0.5),
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
        // Always open modal to show all filter options
        _openCodeModal();
      },
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: const Color(0x0FFFFFFF),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0x24FFFFFF)),
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
              color: const Color(0xFFEAF1FF).withValues(alpha: 0.55),
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
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x24FFFFFF)),
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
            color: const Color(0xFFEAF1FF).withValues(alpha: 0.55),
          ),
          border: InputBorder.none,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 10),
        ),
      ),
    );
  }

  Widget _buildEventsList() {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance.collection('evenimente').snapshots().timeout(
        const Duration(seconds: 30),
        onTimeout: (sink) {
          debugPrint('[EvenimenteScreen] ⚠️ Firestore stream timeout (30s) - showing error');
          sink.addError(TimeoutException('Firestore query timeout', const Duration(seconds: 30)));
        },
      ),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(
              color: Color(0xFF4ECDC4), // --accent
            ),
          );
        }

        if (snapshot.hasError) {
          debugPrint('[EvenimenteScreen] Firestore error: ${snapshot.error}');
          debugPrint('[EvenimenteScreen] Error stack: ${snapshot.error is Exception ? (snapshot.error as Exception).toString() : snapshot.error}');
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 64,
                    color: const Color(0xFFFF7878), // --bad
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Eroare: ${snapshot.error}',
                    style: const TextStyle(color: Color(0xFFFF7878)), // --bad
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => setState(() {}), // Retry
                    child: const Text('Reîncearcă'),
                  ),
                ],
              ),
            ),
          );
        }

        final events = snapshot.data?.docs.map((doc) {
          return EventModel.fromFirestore(doc);
        }).toList() ?? [];
        
        // Log query params for debugging (with correlation ID)
        final correlationId = 'evt_${DateTime.now().millisecondsSinceEpoch}';
        debugPrint('[EvenimenteScreen/$correlationId] Query params: datePreset=${_datePreset}, driverFilter=${_driverFilter}, codeFilter=${_codeFilter}, notedByFilter=${_notedByFilter}');
        debugPrint('[EvenimenteScreen/$correlationId] Loaded ${events.length} events from Firestore');
        debugPrint('[EvenimenteScreen/$correlationId] Events breakdown: total=${events.length}, isArchived=false=${events.where((e) => !e.isArchived).length}, isArchived=true=${events.where((e) => e.isArchived).length}');
        
        _allEvents = events; // Cache for CodeInfoModal
        final filteredEvents = _applyFilters(events);
        
        debugPrint('[EvenimenteScreen/$correlationId] Filtered events count: ${filteredEvents.length}');
        
        // Log filter breakdown for debugging
        if (filteredEvents.length < events.where((e) => !e.isArchived).length) {
          final excluded = events.where((e) => !e.isArchived).length - filteredEvents.length;
          debugPrint('[EvenimenteScreen/$correlationId] Filtered out $excluded events (date/driver/code/notedBy filters)');
        }

        if (filteredEvents.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.event_busy,
                  size: 64,
                  color: const Color(0xFFEAF1FF).withValues(alpha: 0.5),
                ),
                const SizedBox(height: 16),
                Text(
                  'Nu există evenimente',
                  style: TextStyle(
                    fontSize: 16,
                    color: const Color(0xFFEAF1FF).withValues(alpha: 0.7),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Total în Firestore: ${events.length} (arhivate: ${events.where((e) => e.isArchived).length})',
                  style: TextStyle(
                    fontSize: 12,
                    color: const Color(0xFFEAF1FF).withValues(alpha: 0.5),
                  ),
                ),
                if (events.isEmpty) ...[
                  const SizedBox(height: 16),
                  Text(
                    '💡 Creează evenimente din AI Chat sau folosește seed_evenimente.js',
                    style: TextStyle(
                      fontSize: 12,
                      color: const Color(0xFFEAF1FF).withValues(alpha: 0.5),
                      fontStyle: FontStyle.italic,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ],
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

      case 'yes': // necesită șofer (HTML: driverState === 'yes')
        return needsDriver;

      case 'open': // necesită șofer nerezolvat (HTML: driverState === 'open')
        if (!needsDriver) return false;
        final driverRole = event.roles.firstWhere(
          (r) => r.slot.toUpperCase() == 'S',
          orElse: () => RoleModel(slot: 'S', label: '', time: '', durationMin: 0),
        );
        final hasAssigned = driverRole.assignedCode != null &&
            driverRole.assignedCode!.isNotEmpty &&
            _isValidStaffCode(driverRole.assignedCode!);
        return !hasAssigned;

      case 'no': // nu necesită șofer (HTML: driverState === 'no')
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
      codeFilter: _codeFilter, // Pass filter for buildVisibleRoles
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => DoveziScreenHtml(event: event),
          ),
        );
      },
      onSlotTap: (slot) {
        _openAssignModal(event, slot);
      },
      onStatusTap: (slot, code) {
        if (code != null && code.isNotEmpty) {
          _openCodeInfoModal(code);
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

  void _openCodeInfoModal(String code) {
    showDialog(
      context: context,
      barrierColor: Colors.transparent,
      builder: (context) => CodeInfoModal(
        code: code,
        events: _allEvents,
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
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Evenimentul nu a fost găsit'),
              backgroundColor: Color(0xFFFF7878),
            ),
          );
        }
        return;
      }

      final data = eventDoc.data();
      if (data == null) {
        debugPrint('[Evenimente] Event data is null for eventId: $eventId');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Datele evenimentului sunt invalide. Te rog reîncarcă pagina.'),
              backgroundColor: Color(0xFFFF7878),
            ),
          );
        }
        return;
      }
      final roles = (data['roles'] as List<dynamic>?) ?? [];

      // Find role by slot
      final roleIndex = roles.indexWhere((r) => r['slot'] == slot);
      if (roleIndex == -1) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Rolul $slot nu a fost găsit'),
              backgroundColor: const Color(0xFFFF7878),
            ),
          );
        }
        return;
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
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Evenimentul nu a fost găsit'),
              backgroundColor: Color(0xFFFF7878),
            ),
          );
        }
        return;
      }

      final data = eventDoc.data();
      if (data == null) {
        debugPrint('[Evenimente] Event data is null for eventId: $eventId');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Datele evenimentului sunt invalide. Te rog reîncarcă pagina.'),
              backgroundColor: Color(0xFFFF7878),
            ),
          );
        }
        return;
      }

      final roles = (data['roles'] as List<dynamic>?) ?? [];

      // Find role by slot
      final roleIndex = roles.indexWhere((r) => r['slot'] == slot);
      if (roleIndex == -1) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Rolul $slot nu a fost găsit'),
              backgroundColor: const Color(0xFFFF7878),
            ),
          );
        }
        return;
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
