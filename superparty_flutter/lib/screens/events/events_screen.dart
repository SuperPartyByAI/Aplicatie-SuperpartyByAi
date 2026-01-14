import 'package:flutter/material.dart';
import '../../models/event_model.dart';
import '../../services/mock_event_service.dart';
import '../evidence/evidence_screen.dart';

/// Events Screen - versiune simplificată cu mock data
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  // Mock data
  List<EventModel> _allEvents = [];
  List<EventModel> _filteredEvents = [];

  // Filters
  String _datePreset = 'all'; // all, today, yesterday, last7, next7, next30, custom
  bool _sortAsc = false; // false = desc (↓), true = asc (↑)
  String _driverFilter = 'all'; // all, yes, open, no
  String _codeFilter = '';
  String _notedByFilter = '';
  DateTime? _customStart;
  DateTime? _customEnd;

  @override
  void initState() {
    super.initState();
    _loadEvents();
  }

  void _loadEvents() {
    setState(() {
      _allEvents = MockEventService.getMockEvents();
      _applyFilters();
    });
  }

  void _applyFilters() {
    var filtered = List<EventModel>.from(_allEvents);

    // Date filter
    if (_datePreset != 'all') {
      final now = DateTime.now();
      DateTime? startDate;
      DateTime? endDate;

      switch (_datePreset) {
        case 'today':
          startDate = DateTime(now.year, now.month, now.day);
          endDate = DateTime(now.year, now.month, now.day, 23, 59, 59);
          break;
        case 'yesterday':
          final yesterday = now.subtract(const Duration(days: 1));
          startDate = DateTime(yesterday.year, yesterday.month, yesterday.day);
          endDate = DateTime(yesterday.year, yesterday.month, yesterday.day, 23, 59, 59);
          break;
        case 'last7':
          endDate = now;
          startDate = now.subtract(const Duration(days: 7));
          break;
        case 'next7':
          startDate = now;
          endDate = now.add(const Duration(days: 7));
          break;
        case 'next30':
          startDate = now;
          endDate = now.add(const Duration(days: 30));
          break;
        case 'custom':
          if (_customStart != null && _customEnd != null) {
            startDate = _customStart;
            endDate = _customEnd;
          }
          break;
      }

      if (startDate != null && endDate != null) {
        filtered = filtered.where((event) {
          try {
            final parts = event.date.split('-');
            if (parts.length == 3) {
              final eventDate = DateTime(
                int.parse(parts[2]),
                int.parse(parts[1]),
                int.parse(parts[0]),
              );
              return eventDate.isAfter(startDate!.subtract(const Duration(days: 1))) &&
                     eventDate.isBefore(endDate!.add(const Duration(days: 1)));
            }
          } catch (e) {
            return false;
          }
          return false;
        }).toList();
      }
    }

    // Driver filter
    if (_driverFilter != 'all') {
      filtered = filtered.where((event) {
        switch (_driverFilter) {
          case 'yes':
            return event.hasDriverAssigned;
          case 'open':
            return event.needsDriver && !event.hasDriverAssigned;
          case 'no':
            return !event.needsDriver;
          default:
            return true;
        }
      }).toList();
    }

    // Code filter
    if (_codeFilter.isNotEmpty) {
      final codeUpper = _codeFilter.toUpperCase();
      if (codeUpper == 'REZOLVATE') {
        filtered = filtered.where((e) => e.incasare.status == 'INCASAT').toList();
      } else if (codeUpper == 'NEREZOLVATE') {
        filtered = filtered.where((e) => e.incasare.status != 'INCASAT').toList();
      } else {
        filtered = filtered.where((event) {
          // Check in roles
          for (var role in event.roles) {
            if (role.assignedCode?.toUpperCase() == codeUpper ||
                role.pendingCode?.toUpperCase() == codeUpper) {
              return true;
            }
          }
          return false;
        }).toList();
      }
    }

    // NotedBy filter (exclusive with code filter)
    if (_notedByFilter.isNotEmpty && _codeFilter.isEmpty) {
      final notedByUpper = _notedByFilter.toUpperCase();
      filtered = filtered.where((event) {
        return event.cineNoteaza?.toUpperCase() == notedByUpper;
      }).toList();
    }

    // Sort
    filtered.sort((a, b) {
      try {
        final aParts = a.date.split('-');
        final bParts = b.date.split('-');
        if (aParts.length == 3 && bParts.length == 3) {
          final aDate = DateTime(
            int.parse(aParts[2]),
            int.parse(aParts[1]),
            int.parse(aParts[0]),
          );
          final bDate = DateTime(
            int.parse(bParts[2]),
            int.parse(bParts[1]),
            int.parse(bParts[0]),
          );
          return _sortAsc ? aDate.compareTo(bDate) : bDate.compareTo(aDate);
        }
      } catch (e) {
        return 0;
      }
      return 0;
    });

    setState(() {
      _filteredEvents = filtered;
    });
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
              Color(0xFF111C35),
              Color(0xFF0B1220),
            ],
          ),
        ),
        child: Column(
          children: [
            // Sticky AppBar with filters
            _buildAppBar(),
            // Event list
            Expanded(
              child: _filteredEvents.isEmpty
                  ? Center(
                      child: Container(
                        margin: const EdgeInsets.all(14),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1A2332).withOpacity(0.5),
                          border: Border.all(
                            color: Colors.white.withOpacity(0.1),
                          ),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Text(
                          'Nu există evenimente pentru filtrele selectate.',
                          style: TextStyle(color: Color(0xFFEAF1FF)),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: _filteredEvents.length,
                      itemBuilder: (context, index) {
                        return _buildEventCard(_filteredEvents[index]);
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAppBar() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0B1220).withOpacity(0.72),
        border: Border(
          bottom: BorderSide(
            color: Colors.white.withOpacity(0.08),
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
              const Text(
                'Evenimente',
                style: TextStyle(
                  color: Color(0xFFEAF1FF),
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.2,
                ),
              ),
              const SizedBox(height: 10),
              _buildFilters(),
              const SizedBox(height: 2),
              const Padding(
                padding: EdgeInsets.only(left: 2, top: 2),
                child: Text(
                  'Click pe card deschide pagina de dovezi.',
                  style: TextStyle(
                    color: Color(0xFFEAF1FF),
                    fontSize: 11,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilters() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Date preset + Sort + Driver row
        Row(
          children: [
            Expanded(
              child: Container(
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.08),
                  border: Border.all(
                    color: Colors.white.withOpacity(0.18),
                  ),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(12),
                    bottomLeft: Radius.circular(12),
                  ),
                ),
                child: DropdownButton<String>(
                  value: _datePreset,
                  isExpanded: true,
                  isDense: true,
                  dropdownColor: const Color(0xFF0B1220),
                  style: const TextStyle(
                    color: Color(0xFFEAF1FF),
                    fontSize: 12,
                    letterSpacing: 0.1,
                  ),
                  underline: const SizedBox(),
                  icon: const Icon(Icons.arrow_drop_down, color: Color(0xFFEAF1FF)),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  items: const [
                    DropdownMenuItem(value: 'all', child: Text('Toate')),
                    DropdownMenuItem(value: 'today', child: Text('Azi')),
                    DropdownMenuItem(value: 'yesterday', child: Text('Ieri')),
                    DropdownMenuItem(value: 'last7', child: Text('Ultimele 7 zile')),
                    DropdownMenuItem(value: 'next7', child: Text('Următoarele 7 zile')),
                    DropdownMenuItem(value: 'next30', child: Text('Următoarele 30 zile')),
                    DropdownMenuItem(value: 'custom', child: Text('Interval (aleg eu)')),
                  ],
                  onChanged: (value) {
                    setState(() {
                      _datePreset = value ?? 'all';
                      _applyFilters();
                    });
                  },
                ),
              ),
            ),
            Container(
              width: 44,
              height: 36,
              margin: const EdgeInsets.only(left: -1),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                border: Border.all(
                  color: Colors.white.withOpacity(0.14),
                ),
              ),
              child: IconButton(
                padding: EdgeInsets.zero,
                icon: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      '↑',
                      style: TextStyle(
                        color: _sortAsc
                            ? const Color(0xFFEAF1FF)
                            : const Color(0xFFEAF1FF).withOpacity(0.45),
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '↓',
                      style: TextStyle(
                        color: !_sortAsc
                            ? const Color(0xFFEAF1FF)
                            : const Color(0xFFEAF1FF).withOpacity(0.45),
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
                onPressed: () {
                  setState(() {
                    _sortAsc = !_sortAsc;
                    _applyFilters();
                  });
                },
              ),
            ),
            Container(
              width: 44,
              height: 36,
              margin: const EdgeInsets.only(left: -1),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                border: Border.all(
                  color: Colors.white.withOpacity(0.14),
                ),
                borderRadius: const BorderRadius.only(
                  topRight: Radius.circular(12),
                  bottomRight: Radius.circular(12),
                ),
              ),
              child: IconButton(
                padding: EdgeInsets.zero,
                icon: const Icon(
                  Icons.directions_car,
                  size: 20,
                  color: Color(0xFFEAF1FF),
                ),
                onPressed: () {
                  setState(() {
                    final states = ['all', 'yes', 'open', 'no'];
                    final currentIndex = states.indexOf(_driverFilter);
                    _driverFilter = states[(currentIndex + 1) % states.length];
                    _applyFilters();
                  });
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        // Code + NotedBy row
        Row(
          children: [
            Expanded(
              child: SizedBox(
                height: 36,
                child: TextField(
                  style: const TextStyle(
                    color: Color(0xFFEAF1FF),
                    fontSize: 12,
                    letterSpacing: 0.1,
                  ),
                  decoration: InputDecoration(
                    hintText: 'Ce cod am',
                    hintStyle: TextStyle(
                      color: const Color(0xFFEAF1FF).withOpacity(0.55),
                    ),
                    filled: true,
                    fillColor: Colors.black.withOpacity(0.22),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Colors.white.withOpacity(0.14),
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Colors.white.withOpacity(0.14),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: const Color(0xFF4ECDC4).withOpacity(0.55),
                      ),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 0,
                    ),
                  ),
                  textCapitalization: TextCapitalization.characters,
                  onChanged: (value) {
                    setState(() {
                      _codeFilter = value.toUpperCase();
                      if (value.isNotEmpty) {
                        _notedByFilter = ''; // Exclusive
                      }
                      _applyFilters();
                    });
                  },
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 4),
              child: Text(
                '–',
                style: TextStyle(
                  color: Color(0xFFEAF1FF),
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            Expanded(
              child: SizedBox(
                height: 36,
                child: TextField(
                  style: const TextStyle(
                    color: Color(0xFFEAF1FF),
                    fontSize: 12,
                    letterSpacing: 0.1,
                  ),
                  enabled: _codeFilter.isEmpty,
                  decoration: InputDecoration(
                    hintText: 'Cine noteaza',
                    hintStyle: TextStyle(
                      color: const Color(0xFFEAF1FF).withOpacity(0.55),
                    ),
                    filled: true,
                    fillColor: _codeFilter.isEmpty
                        ? Colors.black.withOpacity(0.22)
                        : Colors.black.withOpacity(0.1),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Colors.white.withOpacity(0.14),
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: Colors.white.withOpacity(0.14),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: const Color(0xFF4ECDC4).withOpacity(0.55),
                      ),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 0,
                    ),
                  ),
                  textCapitalization: TextCapitalization.characters,
                  onChanged: (value) {
                    setState(() {
                      _notedByFilter = value.toUpperCase();
                      _applyFilters();
                    });
                  },
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildEventCard(EventModel event) {
    // Format date: DD-MM-YYYY -> DD.MM.YYYY
    String formattedDate = event.date.replaceAll('-', '.');
    
    // Get driver status text
    String driverText = 'Sofer: ${event.driverStatusText}';
    
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        border: Border.all(
          color: Colors.white.withOpacity(0.12),
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => EvidenceScreen(eventId: event.id),
            ),
          );
        },
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Badge (ID)
              Container(
                width: 46,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0xFF4ECDC4).withOpacity(0.16),
                  border: Border.all(
                    color: const Color(0xFF4ECDC4).withOpacity(0.22),
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Text(
                    event.id,
                    style: const TextStyle(
                      color: Color(0xFFEAF1FF),
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Main content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Address
                    Text(
                      event.address,
                      style: const TextStyle(
                        color: Color(0xFFEAF1FF),
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 6),
                    // Roles list
                    if (event.roles.isNotEmpty)
                      ...event.roles.map((role) {
                        final assigned = role.assignedCode?.isNotEmpty ?? false;
                        final pending = !assigned && (role.pendingCode?.isNotEmpty ?? false);
                        final statusText = assigned
                            ? role.assignedCode!
                            : pending
                                ? role.pendingCode!
                                : '!';
                        final statusColor = assigned
                            ? const Color(0xFF4ECDC4)
                            : pending
                                ? const Color(0xFFFFBE5C)
                                : const Color(0xFFEAF1FF).withOpacity(0.6);
                        
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            children: [
                              Container(
                                width: 22,
                                height: 18,
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.08),
                                  border: Border.all(
                                    color: Colors.white.withOpacity(0.12),
                                  ),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Center(
                                  child: Text(
                                    role.slot,
                                    style: const TextStyle(
                                      color: Color(0xFFEAF1FF),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 0.3,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Row(
                                  children: [
                                    Text(
                                      role.label,
                                      style: TextStyle(
                                        color: const Color(0xFFEAF1FF).withOpacity(0.58),
                                        fontSize: 12,
                                      ),
                                    ),
                                    if (role.time.isNotEmpty) ...[
                                      const SizedBox(width: 8),
                                      Text(
                                        role.time,
                                        style: const TextStyle(
                                          color: Color(0xFFEAF1FF),
                                          fontSize: 12,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ],
                                    if (role.durationMin > 0) ...[
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 0,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.white.withOpacity(0.06),
                                          border: Border.all(
                                            color: Colors.white.withOpacity(0.10),
                                          ),
                                          borderRadius: BorderRadius.circular(999),
                                        ),
                                        child: Text(
                                          _formatDuration(role.durationMin),
                                          style: const TextStyle(
                                            color: Color(0xFFEAF1FF),
                                            fontSize: 12,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: 0.12,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 7,
                                  vertical: 0,
                                ),
                                decoration: BoxDecoration(
                                  color: assigned
                                      ? const Color(0xFF4ECDC4).withOpacity(0.14)
                                      : pending
                                          ? const Color(0xFFFFBE5C).withOpacity(0.10)
                                          : const Color(0xFF4ECDC4).withOpacity(0.14),
                                  border: Border.all(
                                    color: assigned
                                        ? const Color(0xFF4ECDC4).withOpacity(0.32)
                                        : pending
                                            ? const Color(0xFFFFBE5C).withOpacity(0.30)
                                            : const Color(0xFF4ECDC4).withOpacity(0.32),
                                  ),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  statusText,
                                  style: TextStyle(
                                    color: statusColor,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              // Right column (date, meta)
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    formattedDate,
                    style: const TextStyle(
                      color: Color(0xFFEAF1FF),
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  if (event.cineNoteaza != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Cine noteaza: ${event.cineNoteaza}',
                      style: TextStyle(
                        color: const Color(0xFFEAF1FF).withOpacity(0.6),
                        fontSize: 11,
                      ),
                    ),
                  ],
                  const SizedBox(height: 4),
                  Text(
                    driverText,
                    style: TextStyle(
                      color: const Color(0xFFEAF1FF).withOpacity(0.6),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDuration(int minutes) {
    if (minutes <= 0) return '';
    final h = minutes ~/ 60;
    final m = minutes % 60;
    if (h == 0) return '${m}m';
    if (m == 0) return '${h}h';
    return '${h}h${m}m';
  }
}
