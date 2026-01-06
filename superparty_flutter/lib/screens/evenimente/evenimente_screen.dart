import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/event_model.dart';
import '../../models/event_filters.dart';
import '../../services/event_service.dart';
import '../../utils/code_validator.dart';
import '../../widgets/code_filter_modal.dart';
import '../../widgets/assign_role_sheet.dart';
import '../dovezi/dovezi_screen.dart';

class EvenimenteScreen extends StatefulWidget {
  const EvenimenteScreen({super.key});

  @override
  State<EvenimenteScreen> createState() => _EvenimenteScreenState();
}

class _EvenimenteScreenState extends State<EvenimenteScreen> {
  final EventService _eventService = EventService();
  DatePreset _preset = DatePreset.all;
  SortDirection _sortDir = SortDirection.desc;
  DriverFilter _driverFilter = DriverFilter.all;
  String? _staffCode;
  String? _notedBy;
  DateTime? _customStart;
  DateTime? _customEnd;

  EventFilters get _filters {
    return EventFilters(
      preset: _preset,
      customStartDate: _customStart,
      customEndDate: _customEnd,
      sortDirection: _sortDir,
      driverFilter: _driverFilter,
      staffCode: _staffCode,
      notedBy: _notedBy,
    );
  }

  Stream<List<EventModel>> get _eventsStream {
    return _eventService.getEventsStream(_filters);
  }

  List<EventModel> _applyClientFilters(List<EventModel> events) {
    var filtered = List<EventModel>.from(events);

    // Date filter
    if (_preset != DatePreset.all || _customStart != null || _customEnd != null) {
      final now = DateTime.now();
      DateTime? start, end;

      switch (_preset) {
        case DatePreset.today:
          start = DateTime(now.year, now.month, now.day);
          end = DateTime(now.year, now.month, now.day, 23, 59, 59);
          break;
        case DatePreset.yesterday:
          final yesterday = now.subtract(const Duration(days: 1));
          start = DateTime(yesterday.year, yesterday.month, yesterday.day);
          end = DateTime(yesterday.year, yesterday.month, yesterday.day, 23, 59, 59);
          break;
        case DatePreset.last7:
          start = now.subtract(const Duration(days: 7));
          end = now;
          break;
        case DatePreset.next7:
          start = now;
          end = now.add(const Duration(days: 7));
          break;
        case DatePreset.next30:
          start = now;
          end = now.add(const Duration(days: 30));
          break;
        case DatePreset.custom:
          start = _customStart;
          end = _customEnd;
          break;
        case DatePreset.all:
          break;
      }

      if (start != null || end != null) {
        events = events.where((e) {
          final eventDate = DateTime.parse(e.date);
          if (start != null && eventDate.isBefore(start)) return false;
          if (end != null && eventDate.isAfter(end)) return false;
          return true;
        }).toList();
      }
    }

    // Driver filter
    switch (_driverFilter) {
      case DriverFilter.yes:
        events = events.where((e) => e.needsDriver).toList();
        break;
      case DriverFilter.open:
        events = events.where((e) => e.needsDriver && !e.hasDriverAssigned).toList();
        break;
      case DriverFilter.no:
        events = events.where((e) => !e.needsDriver).toList();
        break;
      case DriverFilter.all:
        break;
    }

    // Staff code filter
    if (_staffCode != null && _staffCode!.isNotEmpty) {
      final code = CodeValidator.normalize(_staffCode!);
      events = events.where((e) {
        return e.roles.any((r) => r.assignedCode == code || r.pendingCode == code);
      }).toList();
    }

    // Noted by filter
    if (_notedBy != null && _notedBy!.isNotEmpty) {
      final code = CodeValidator.normalize(_notedBy!);
      events = events.where((e) => e.cineNoteaza == code).toList();
    }

    // Sort
    events.sort((a, b) {
      final comparison = a.date.compareTo(b.date);
      return _sortDir == SortDirection.asc ? comparison : -comparison;
    });

    return events;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF111C35),
              Color(0xFF0B1220),
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

  Widget _buildAppBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 16),
      decoration: BoxDecoration(
        color: const Color(0xFF0B1220).withOpacity(0.72),
        border: const Border(
          bottom: BorderSide(color: Color(0x14FFFFFF)),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Evenimente',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: Color(0xFFEAF1FF),
            ),
          ),
          const SizedBox(height: 16),
          _buildFiltersRow(),
          const SizedBox(height: 8),
          _buildExtraFiltersRow(),
          const SizedBox(height: 8),
          const Text(
            'Click pe card deschide pagina de dovezi. Click pe slot sau pe cod pastreaza alocarea/tab cod.',
            style: TextStyle(
              fontSize: 12,
              color: Color(0xB3EAF1FF),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFiltersRow() {
    return Row(
      children: [
        Expanded(
          child: Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: const Color(0x14FFFFFF),
              border: Border.all(color: const Color(0x1FFFFFFF)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<DatePreset>(
                value: _preset,
                dropdownColor: const Color(0xFF1A2332),
                style: const TextStyle(color: Color(0xFFEAF1FF), fontSize: 14),
                items: DatePreset.values.map((p) {
                  return DropdownMenuItem(value: p, child: Text(p.label));
                }).toList(),
                onChanged: (value) {
                  if (value == DatePreset.custom) {
                    _showCustomDatePicker();
                  } else {
                    setState(() {
                      _preset = value!;
                      _customStart = null;
                      _customEnd = null;
                    });
                  }
                },
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        _buildSortButton(),
        const SizedBox(width: 8),
        _buildDriverButton(),
      ],
    );
  }

  Widget _buildSortButton() {
    return InkWell(
      onTap: () {
        setState(() {
          _sortDir = _sortDir == SortDirection.asc ? SortDirection.desc : SortDirection.asc;
        });
      },
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: const Color(0x14FFFFFF),
          border: Border.all(color: const Color(0x1FFFFFFF)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '↑',
              style: TextStyle(
                color: _sortDir == SortDirection.asc ? const Color(0xFFEAF1FF) : const Color(0x73EAF1FF),
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              '↓',
              style: TextStyle(
                color: _sortDir == SortDirection.desc ? const Color(0xFFEAF1FF) : const Color(0x73EAF1FF),
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDriverButton() {
    return InkWell(
      onTap: () {
        setState(() {
          _driverFilter = _driverFilter.next;
        });
      },
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: const Color(0x14FFFFFF),
          border: Border.all(color: const Color(0x1FFFFFFF)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Stack(
          children: [
            const Center(
              child: Icon(Icons.directions_car, color: Color(0xD1EAF1FF), size: 20),
            ),
            Positioned(
              right: 6,
              top: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                decoration: BoxDecoration(
                  color: _driverFilter == DriverFilter.yes ? const Color(0x474ECDC4) : const Color(0x1FEAF1FF),
                  border: Border.all(
                    color: _driverFilter == DriverFilter.yes ? const Color(0x804ECDC4) : const Color(0x2DEAF1FF),
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  _driverFilter.badgeText,
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    color: Color(0xDBEAF1FF),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExtraFiltersRow() {
    return Row(
      children: [
        Expanded(
          child: InkWell(
            onTap: (_notedBy == null || _notedBy!.isEmpty) ? _showCodeFilterModal : null,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                color: (_notedBy == null || _notedBy!.isEmpty) ? const Color(0x14FFFFFF) : const Color(0x08FFFFFF),
                border: Border.all(color: const Color(0x1FFFFFFF)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _staffCode ?? 'Ce cod am',
                style: TextStyle(
                  color: _staffCode != null ? const Color(0xFFEAF1FF) : const Color(0x8CEAF1FF),
                  fontSize: 14,
                ),
              ),
            ),
          ),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 8),
          child: Text('–', style: TextStyle(color: Color(0x8CEAF1FF), fontWeight: FontWeight.w900)),
        ),
        Expanded(
          child: TextField(
            enabled: _staffCode == null || _staffCode!.isEmpty,
            onChanged: (value) {
              setState(() {
                _notedBy = value.isEmpty ? null : value;
                if (_notedBy != null) _staffCode = null;
              });
            },
            style: const TextStyle(color: Color(0xFFEAF1FF)),
            decoration: InputDecoration(
              hintText: 'Cine noteaza',
              hintStyle: const TextStyle(color: Color(0x8CEAF1FF)),
              filled: true,
              fillColor: (_staffCode == null || _staffCode!.isEmpty) ? const Color(0x14FFFFFF) : const Color(0x08FFFFFF),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0x1FFFFFFF)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0x1FFFFFFF)),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0x0AFFFFFF)),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildEventsList() {
    return StreamBuilder<List<EventModel>>(
      stream: _eventsStream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF4ECDC4)),
          );
        }

        if (snapshot.hasError) {
          return Center(
            child: Text(
              'Eroare: ${snapshot.error}',
              style: const TextStyle(color: Color(0xFFFF7878), fontSize: 16),
            ),
          );
        }

        final events = snapshot.data ?? [];

        if (events.isEmpty) {
          return const Center(
            child: Text(
              'Nu există evenimente',
              style: TextStyle(color: Color(0x94EAF1FF), fontSize: 16),
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: events.length,
          itemBuilder: (context, index) => _buildEventCard(events[index]),
        );
      },
    );
  }

  Widget _buildEventCard(EventModel event) {
    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => DoveziScreen(eventId: event.id),
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0x0FFFFFFF),
          border: Border.all(color: const Color(0x1FFFFFFF)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getIncasareColor(event.incasare.status),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    event.incasare.status,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFFEAF1FF),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '#${event.id}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: Color(0xB3EAF1FF),
                  ),
                ),
                const Spacer(),
                Text(
                  DateFormat('dd MMM yyyy').format(DateTime.parse(event.date)),
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xB3EAF1FF),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${event.sarbatoritNume} - ${event.sarbatoritVarsta} ani',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Color(0xFFEAF1FF),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              event.address,
              style: const TextStyle(
                fontSize: 14,
                color: Color(0xB3EAF1FF),
              ),
            ),
            if (event.roles.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: event.roles.map((role) => _buildRoleChip(role, event)).toList(),
              ),
            ],
            if (event.needsDriver) ...[
              const SizedBox(height: 8),
              _buildDriverChip(event),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildRoleChip(RoleModel role, EventModel event) {
    Color bgColor;
    Color borderColor;
    switch (role.status) {
      case RoleStatus.assigned:
        bgColor = const Color(0x2810B981);
        borderColor = const Color(0x5010B981);
        break;
      case RoleStatus.pending:
        bgColor = const Color(0x28FFBE5C);
        borderColor = const Color(0x50FFBE5C);
        break;
      case RoleStatus.unassigned:
        bgColor = const Color(0x14FFFFFF);
        borderColor = const Color(0x1FFFFFFF);
        break;
    }

    return InkWell(
      onTap: () => _showAssignRoleSheet(event, role),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: bgColor,
          border: Border.all(color: borderColor),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              role.slot,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w900,
                color: Color(0xFFEAF1FF),
              ),
            ),
            const SizedBox(width: 4),
            Text(
              role.assignedCode ?? role.pendingCode ?? '!',
              style: const TextStyle(
                fontSize: 12,
                color: Color(0xDBEAF1FF),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showAssignRoleSheet(EventModel event, RoleModel role) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => AssignRoleSheet(
        eventId: event.id,
        slot: role.slot,
        roleLabel: role.label,
        currentAssigned: role.assignedCode,
        currentPending: role.pendingCode,
        onAssign: (code) async {
          await _eventService.assignRole(
            eventId: event.id,
            slot: role.slot,
            staffCode: code,
          );
        },
        onUnassign: role.assignedCode != null
            ? () async {
                await _eventService.unassignRole(
                  eventId: event.id,
                  slot: role.slot,
                );
              }
            : null,
        onAcceptPending: role.pendingCode != null
            ? () async {
                await _eventService.acceptPendingRole(
                  eventId: event.id,
                  slot: role.slot,
                );
              }
            : null,
        onRejectPending: role.pendingCode != null
            ? () async {
                await _eventService.rejectPendingRole(
                  eventId: event.id,
                  slot: role.slot,
                );
              }
            : null,
      ),
    );
  }

  Widget _buildDriverChip(EventModel event) {
    String text = 'S: ${event.driverStatusText}';
    Color bgColor = const Color(0x14FFFFFF);
    Color borderColor = const Color(0x1FFFFFFF);

    if (event.hasDriverAssigned) {
      bgColor = const Color(0x2810B981);
      borderColor = const Color(0x5010B981);
    } else if (event.hasDriverPending) {
      bgColor = const Color(0x28FFBE5C);
      borderColor = const Color(0x50FFBE5C);
    } else if (event.needsDriver) {
      bgColor = const Color(0x28FF7878);
      borderColor = const Color(0x50FF7878);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w900,
          color: Color(0xFFEAF1FF),
        ),
      ),
    );
  }

  Color _getIncasareColor(String status) {
    switch (status) {
      case 'INCASAT':
        return const Color(0x5010B981);
      case 'ANULAT':
        return const Color(0x50FF7878);
      default:
        return const Color(0x50FFBE5C);
    }
  }

  void _showCustomDatePicker() async {
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
      builder: (context, child) {
        return Theme(
          data: ThemeData.dark().copyWith(
            colorScheme: const ColorScheme.dark(
              primary: Color(0xFF4ECDC4),
              surface: Color(0xFF1A2332),
            ),
          ),
          child: child!,
        );
      },
    );

    if (range != null) {
      setState(() {
        _preset = DatePreset.custom;
        _customStart = range.start;
        _customEnd = range.end;
      });
    }
  }

  void _showCodeFilterModal() {
    showDialog(
      context: context,
      builder: (context) => CodeFilterModal(
        currentCode: _staffCode,
        onApply: (code, option) {
          setState(() {
            _staffCode = code;
            _notedBy = null;
          });
        },
      ),
    );
  }
}
