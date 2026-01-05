import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';
import '../../models/event_model.dart';
import '../../models/event_filters.dart';
import '../../services/event_service.dart';
import 'event_details_sheet.dart';

class EvenimenteScreen extends StatefulWidget {
  const EvenimenteScreen({super.key});

  @override
  State<EvenimenteScreen> createState() => _EvenimenteScreenState();
}

class _EvenimenteScreenState extends State<EvenimenteScreen> {
  final EventService _eventService = EventService();
  EventFilters _filters = EventFilters();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B1220),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFFE2E8F0)),
          onPressed: () => Navigator.pop(context),
        ),
        title: ShaderMask(
          shaderCallback: (bounds) => const LinearGradient(
            colors: [Color(0xFFDC2626), Color(0xFFF97316)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ).createShader(bounds),
          child: const Text(
            'Evenimente SuperParty',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.archive, color: Color(0xFF94A3B8)),
            tooltip: 'Vezi arhivate',
            onPressed: _showArchivedEvents,
          ),
          IconButton(
            icon: const Icon(Icons.filter_list, color: Color(0xFFDC2626)),
            onPressed: _showFiltersSheet,
          ),
        ],
      ),
      body: Column(
        children: [
          _buildSearchBar(),
          _buildDatePresets(),
          if (_filters.hasActiveFilters) _buildActiveFiltersChips(),
          Expanded(
            child: _buildEventsList(),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: TextField(
        onChanged: (value) {
          setState(() {
            _filters = _filters.copyWith(searchQuery: value);
          });
        },
        style: const TextStyle(color: Color(0xFFE2E8F0)),
        decoration: InputDecoration(
          hintText: 'Caută evenimente...',
          hintStyle: const TextStyle(color: Color(0xFF94A3B8)),
          filled: true,
          fillColor: const Color(0xFF1A2332),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFF2D3748)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFF2D3748)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFFDC2626)),
          ),
          prefixIcon: const Icon(Icons.search, color: Color(0xFF94A3B8)),
          suffixIcon: _filters.searchQuery != null && _filters.searchQuery!.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, color: Color(0xFF94A3B8)),
                  onPressed: () {
                    setState(() {
                      _filters = _filters.copyWith(clearSearch: true);
                    });
                  },
                )
              : null,
        ),
      ),
    );
  }

  Widget _buildDatePresets() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          _buildPresetChip(DatePreset.all, 'Toate'),
          _buildPresetChip(DatePreset.today, 'Astăzi'),
          _buildPresetChip(DatePreset.thisWeek, 'Săptămâna'),
          _buildPresetChip(DatePreset.thisMonth, 'Luna'),
          _buildCustomRangeButton(),
        ],
      ),
    );
  }

  Widget _buildPresetChip(DatePreset preset, String label) {
    final isSelected = _filters.preset == preset && 
                       _filters.customStartDate == null && 
                       _filters.customEndDate == null;
    
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: isSelected,
        onSelected: (selected) {
          setState(() {
            _filters = _filters.copyWith(
              preset: preset,
              clearCustomDates: true,
            );
          });
        },
        backgroundColor: const Color(0xFF1A2332),
        selectedColor: const Color(0xFFDC2626),
        labelStyle: TextStyle(
          color: isSelected ? Colors.white : const Color(0xFF94A3B8),
        ),
        side: BorderSide(
          color: isSelected ? const Color(0xFFDC2626) : const Color(0xFF2D3748),
        ),
      ),
    );
  }

  Widget _buildCustomRangeButton() {
    final hasCustomRange = _filters.customStartDate != null || _filters.customEndDate != null;
    
    return FilterChip(
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.date_range, size: 16, color: Colors.white),
          const SizedBox(width: 4),
          Text(hasCustomRange ? 'Custom' : 'Alege interval'),
        ],
      ),
      selected: hasCustomRange,
      onSelected: (selected) => _showDateRangePicker(),
      backgroundColor: const Color(0xFF1A2332),
      selectedColor: const Color(0xFFDC2626),
      labelStyle: TextStyle(
        color: hasCustomRange ? Colors.white : const Color(0xFF94A3B8),
      ),
      side: BorderSide(
        color: hasCustomRange ? const Color(0xFFDC2626) : const Color(0xFF2D3748),
      ),
    );
  }

  Widget _buildActiveFiltersChips() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Text(
            '${_filters.activeFilterCount} filtre active',
            style: const TextStyle(
              color: Color(0xFF94A3B8),
              fontSize: 12,
            ),
          ),
          const SizedBox(width: 8),
          TextButton.icon(
            onPressed: () {
              setState(() {
                _filters = _filters.reset();
              });
            },
            icon: const Icon(Icons.clear, size: 16, color: Color(0xFFDC2626)),
            label: const Text(
              'Reset',
              style: TextStyle(color: Color(0xFFDC2626)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEventsList() {
    return StreamBuilder<List<EventModel>>(
      stream: _eventService.getEventsStream(_filters),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, color: Colors.red, size: 48),
                const SizedBox(height: 16),
                Text(
                  'Eroare: ${snapshot.error}',
                  style: const TextStyle(color: Colors.white70),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          );
        }

        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        final events = snapshot.data!;

        if (events.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.event_busy, color: Color(0xFF94A3B8), size: 64),
                const SizedBox(height: 16),
                const Text(
                  'Niciun eveniment găsit',
                  style: TextStyle(
                    color: Color(0xFFE2E8F0),
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _filters.hasActiveFilters
                      ? 'Încearcă să modifici filtrele'
                      : 'Nu există evenimente în sistem',
                  style: const TextStyle(color: Color(0xFF94A3B8)),
                ),
              ],
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
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      color: const Color(0xFF1A2332),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFF2D3748)),
      ),
      child: InkWell(
        onTap: () => _openEventDetails(event.id),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      event.nume,
                      style: const TextStyle(
                        color: Color(0xFFE2E8F0),
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (event.requiresSofer)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFDC2626).withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.local_shipping, size: 14, color: Color(0xFFDC2626)),
                          SizedBox(width: 4),
                          Text(
                            'Șofer',
                            style: TextStyle(
                              color: Color(0xFFDC2626),
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(Icons.location_on, size: 16, color: Color(0xFF94A3B8)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      event.locatie,
                      style: const TextStyle(color: Color(0xFF94A3B8)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.calendar_today, size: 16, color: Color(0xFF94A3B8)),
                  const SizedBox(width: 8),
                  Text(
                    DateFormat('dd MMM yyyy, HH:mm').format(event.data),
                    style: const TextStyle(color: Color(0xFF94A3B8)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.event, size: 16, color: Color(0xFF94A3B8)),
                  const SizedBox(width: 8),
                  Text(
                    '${event.tipEveniment} • ${event.tipLocatie}',
                    style: const TextStyle(color: Color(0xFF94A3B8)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openEventDetails(String eventId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.9,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scrollController) => EventDetailsSheet(
          eventId: eventId,
          scrollController: scrollController,
        ),
      ),
    );
  }

  Future<void> _showDateRangePicker() async {
    final DateTimeRange? picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
      initialDateRange: _filters.customStartDate != null && _filters.customEndDate != null
          ? DateTimeRange(
              start: _filters.customStartDate!,
              end: _filters.customEndDate!,
            )
          : null,
      builder: (context, child) {
        return Theme(
          data: ThemeData.dark().copyWith(
            colorScheme: const ColorScheme.dark(
              primary: Color(0xFFDC2626),
              onPrimary: Colors.white,
              surface: Color(0xFF1A2332),
              onSurface: Color(0xFFE2E8F0),
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null) {
      setState(() {
        _filters = _filters.copyWith(
          preset: DatePreset.custom,
          customStartDate: picked.start,
          customEndDate: picked.end,
        );
      });
    }
  }

  void _showFiltersSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0B1220),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => _FiltersSheet(
        filters: _filters,
        onApply: (newFilters) {
          setState(() {
            _filters = newFilters;
          });
          Navigator.pop(context);
        },
      ),
    );
  }
}

class _FiltersSheet extends StatefulWidget {
  final EventFilters filters;
  final Function(EventFilters) onApply;

  const _FiltersSheet({
    required this.filters,
    required this.onApply,
  });

  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  late EventFilters _filters;

  @override
  void initState() {
    super.initState();
    _filters = widget.filters;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Filtre Avansate',
                style: TextStyle(
                  color: Color(0xFFE2E8F0),
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close, color: Color(0xFF94A3B8)),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 24),
          
          const Text(
            'Sortare',
            style: TextStyle(
              color: Color(0xFFE2E8F0),
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<SortBy>(
                  value: _filters.sortBy,
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: const Color(0xFF1A2332),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFF2D3748)),
                    ),
                  ),
                  dropdownColor: const Color(0xFF1A2332),
                  style: const TextStyle(color: Color(0xFFE2E8F0)),
                  items: SortBy.values.map((sortBy) {
                    return DropdownMenuItem(
                      value: sortBy,
                      child: Text(sortBy.label),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value != null) {
                      setState(() {
                        _filters = _filters.copyWith(sortBy: value);
                      });
                    }
                  },
                ),
              ),
              const SizedBox(width: 12),
              IconButton(
                icon: Icon(
                  _filters.sortDirection == SortDirection.asc
                      ? Icons.arrow_upward
                      : Icons.arrow_downward,
                  color: const Color(0xFFDC2626),
                ),
                onPressed: () {
                  setState(() {
                    _filters = _filters.copyWith(
                      sortDirection: _filters.sortDirection == SortDirection.asc
                          ? SortDirection.desc
                          : SortDirection.asc,
                    );
                  });
                },
              ),
            ],
          ),
          
          const SizedBox(height: 24),
          
          SwitchListTile(
            title: const Text(
              'Doar evenimente cu șofer',
              style: TextStyle(color: Color(0xFFE2E8F0)),
            ),
            value: _filters.requiresSofer ?? false,
            onChanged: (value) {
              setState(() {
                _filters = _filters.copyWith(
                  requiresSofer: value,
                  clearRequiresSofer: !value,
                );
              });
            },
            activeColor: const Color(0xFFDC2626),
            tileColor: const Color(0xFF1A2332),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          
          const SizedBox(height: 12),
          
          SwitchListTile(
            title: const Text(
              'Doar evenimentele mele',
              style: TextStyle(color: Color(0xFFE2E8F0)),
            ),
            subtitle: FirebaseAuth.instance.currentUser == null
                ? const Text(
                    'Trebuie să fii autentificat',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                  )
                : null,
            value: _filters.assignedToMe != null,
            onChanged: FirebaseAuth.instance.currentUser == null
                ? null // Disabled dacă nu e logat
                : (value) {
                    setState(() {
                      if (value) {
                        final currentUser = FirebaseAuth.instance.currentUser;
                        if (currentUser != null) {
                          _filters = _filters.copyWith(
                            assignedToMe: currentUser.uid,
                          );
                        }
                      } else {
                        _filters = _filters.copyWith(clearAssignedToMe: true);
                      }
                    });
                  },
            activeColor: const Color(0xFFDC2626),
            tileColor: const Color(0xFF1A2332),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          
          const SizedBox(height: 24),
          
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () {
                    setState(() {
                      _filters = _filters.reset();
                    });
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF94A3B8),
                    side: const BorderSide(color: Color(0xFF2D3748)),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  child: const Text('Reset'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: () => widget.onApply(_filters),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFDC2626),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  child: const Text('Aplică'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Afișează ecran cu evenimente arhivate
  void _showArchivedEvents() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const ArchivedEventsScreen(),
      ),
    );
  }
}

/// Ecran pentru evenimente arhivate
class ArchivedEventsScreen extends StatelessWidget {
  const ArchivedEventsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final eventService = EventService();

    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B1220),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFFE2E8F0)),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Evenimente Arhivate',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: Color(0xFFE2E8F0),
          ),
        ),
      ),
      body: StreamBuilder<List<EventModel>>(
        stream: eventService.getArchivedEventsStream(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(
                color: Color(0xFFDC2626),
              ),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Text(
                'Eroare: ${snapshot.error}',
                style: const TextStyle(color: Color(0xFFE2E8F0)),
              ),
            );
          }

          final events = snapshot.data ?? [];

          if (events.isEmpty) {
            return const Center(
              child: Text(
                'Nu există evenimente arhivate',
                style: TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 16,
                ),
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: events.length,
            itemBuilder: (context, index) {
              final event = events[index];
              return _buildArchivedEventCard(context, event, eventService);
            },
          );
        },
      ),
    );
  }

  Widget _buildArchivedEventCard(
    BuildContext context,
    EventModel event,
    EventService eventService,
  ) {
    return Card(
      color: const Color(0xFF1A2332),
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: const Icon(
          Icons.archive,
          color: Color(0xFF94A3B8),
        ),
        title: Text(
          event.nume,
          style: const TextStyle(
            color: Color(0xFFE2E8F0),
            fontWeight: FontWeight.bold,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              event.locatie,
              style: const TextStyle(color: Color(0xFF94A3B8)),
            ),
            if (event.archivedAt != null)
              Text(
                'Arhivat: ${DateFormat('dd MMM yyyy, HH:mm').format(event.archivedAt!)}',
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                ),
              ),
            if (event.archiveReason != null)
              Text(
                'Motiv: ${event.archiveReason}',
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                ),
              ),
          ],
        ),
        trailing: IconButton(
          icon: const Icon(Icons.unarchive, color: Color(0xFFDC2626)),
          tooltip: 'Dezarhivează',
          onPressed: () async {
            try {
              await eventService.unarchiveEvent(event.id);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Eveniment dezarhivat cu succes'),
                    backgroundColor: Color(0xFF10B981),
                  ),
                );
              }
            } catch (e) {
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Eroare: $e'),
                    backgroundColor: Color(0xFFDC2626),
                  ),
                );
              }
            }
          },
        ),
      ),
    );
  }
}
