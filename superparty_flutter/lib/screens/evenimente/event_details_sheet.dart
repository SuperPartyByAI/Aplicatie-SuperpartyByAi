import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import '../../models/event_model.dart';
import '../../services/event_service.dart';
import '../dovezi/dovezi_screen.dart';
import '../../widgets/user_selector_dialog.dart';
import '../../widgets/user_display_name.dart';

class EventDetailsSheet extends StatefulWidget {
  final String eventId;
  final ScrollController? scrollController;

  const EventDetailsSheet({
    super.key,
    required this.eventId,
    this.scrollController,
  });

  @override
  State<EventDetailsSheet> createState() => _EventDetailsSheetState();
}

class _EventDetailsSheetState extends State<EventDetailsSheet> {
  final EventService _eventService = EventService();
  EventModel? _event;
  bool _isLoading = true;
  String? _error;

  // Roluri disponibile
  final List<String> _roles = [
    'barman',
    'ospatar',
    'dj',
    'fotograf',
    'animator',
    'bucatar',
  ];

  @override
  void initState() {
    super.initState();
    _loadEvent();
  }

  Future<void> _loadEvent() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      final event = await _eventService.getEvent(widget.eventId);
      
      setState(() {
        _event = event;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0B1220),
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildHeader(),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? _buildError()
                    : _buildContent(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFDC2626), Color(0xFFF97316)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _event?.nume ?? 'Detalii Eveniment',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (_event != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    DateFormat('dd MMM yyyy, HH:mm').format(_event!.data),
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                    ),
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: Colors.red, size: 48),
            const SizedBox(height: 16),
            Text(
              _error ?? 'Eroare necunoscută',
              style: const TextStyle(color: Colors.white70),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadEvent,
              child: const Text('Reîncearcă'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    if (_event == null) return const SizedBox();

    return SingleChildScrollView(
      controller: widget.scrollController,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildInfoSection(),
          const SizedBox(height: 24),
          _buildRolesSection(),
          if (_event!.requiresSofer) ...[
            const SizedBox(height: 24),
            _buildDriverSection(),
          ],
          const SizedBox(height: 24),
          _buildDoveziButton(),
          const SizedBox(height: 16),
          _buildArchiveButton(),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildInfoSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A2332),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF2D3748)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildInfoRow(Icons.location_on, 'Locație', _event!.locatie),
          const SizedBox(height: 12),
          _buildInfoRow(Icons.event, 'Tip Eveniment', _event!.tipEveniment),
          const SizedBox(height: 12),
          _buildInfoRow(Icons.place, 'Tip Locație', _event!.tipLocatie),
        ],
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, color: const Color(0xFFDC2626), size: 20),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 12,
                ),
              ),
              Text(
                value,
                style: const TextStyle(
                  color: Color(0xFFE2E8F0),
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRolesSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Alocări Roluri',
          style: TextStyle(
            color: Color(0xFFE2E8F0),
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        ..._roles.map((role) => _buildRoleCard(role)),
      ],
    );
  }

  Widget _buildRoleCard(String role) {
    final assignment = _event!.alocari[role];
    final isAssigned = assignment?.status == AssignmentStatus.assigned;
    final userId = assignment?.userId;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A2332),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isAssigned ? const Color(0xFFDC2626) : const Color(0xFF2D3748),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: isAssigned
                  ? const Color(0xFFDC2626).withOpacity(0.2)
                  : const Color(0xFF2D3748),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              _getRoleIcon(role),
              color: isAssigned ? const Color(0xFFDC2626) : const Color(0xFF94A3B8),
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _getRoleLabel(role),
                  style: const TextStyle(
                    color: Color(0xFFE2E8F0),
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                isAssigned
                    ? Row(
                        children: [
                          const Text(
                            'Alocat: ',
                            style: TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 12,
                            ),
                          ),
                          Expanded(
                            child: UserDisplayName(
                              userId: userId,
                              style: const TextStyle(
                                color: Color(0xFFDC2626),
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                              showStaffCode: true,
                            ),
                          ),
                        ],
                      )
                    : const Text(
                        'Nealocat',
                        style: TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 12,
                        ),
                      ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(
              isAssigned ? Icons.person_remove : Icons.person_add,
              color: const Color(0xFFDC2626),
            ),
            onPressed: () => _handleRoleAssignment(role, isAssigned, userId),
          ),
        ],
      ),
    );
  }

  Widget _buildDriverSection() {
    final isAssigned = _event!.sofer.status == DriverStatus.assigned;
    final userId = _event!.sofer.userId;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Șofer',
          style: TextStyle(
            color: Color(0xFFE2E8F0),
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF1A2332),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isAssigned ? const Color(0xFFDC2626) : const Color(0xFF2D3748),
            ),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: isAssigned
                      ? const Color(0xFFDC2626).withOpacity(0.2)
                      : const Color(0xFF2D3748),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.local_shipping,
                  color: isAssigned ? const Color(0xFFDC2626) : const Color(0xFF94A3B8),
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Șofer Necesar',
                      style: TextStyle(
                        color: Color(0xFFE2E8F0),
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    isAssigned
                        ? Row(
                            children: [
                              const Text(
                                'Alocat: ',
                                style: TextStyle(
                                  color: Color(0xFF94A3B8),
                                  fontSize: 12,
                                ),
                              ),
                              Expanded(
                                child: UserDisplayName(
                                  userId: userId,
                                  style: const TextStyle(
                                    color: Color(0xFFDC2626),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  showStaffCode: true,
                                ),
                              ),
                            ],
                          )
                        : const Text(
                            'Nealocat',
                            style: TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 12,
                            ),
                          ),
                  ],
                ),
              ),
              IconButton(
                icon: Icon(
                  isAssigned ? Icons.person_remove : Icons.person_add,
                  color: const Color(0xFFDC2626),
                ),
                onPressed: () => _handleDriverAssignment(isAssigned, userId),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildDoveziButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () {
          Navigator.pop(context);
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => DoveziScreen(eventId: widget.eventId),
            ),
          );
        },
        icon: const Icon(Icons.photo_library),
        label: const Text('Vezi Dovezi'),
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFDC2626),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  IconData _getRoleIcon(String role) {
    switch (role) {
      case 'barman':
        return Icons.local_bar;
      case 'ospatar':
        return Icons.restaurant;
      case 'dj':
        return Icons.music_note;
      case 'fotograf':
        return Icons.camera_alt;
      case 'animator':
        return Icons.celebration;
      case 'bucatar':
        return Icons.restaurant_menu;
      default:
        return Icons.person;
    }
  }

  String _getRoleLabel(String role) {
    switch (role) {
      case 'barman':
        return 'Barman';
      case 'ospatar':
        return 'Ospătar';
      case 'dj':
        return 'DJ';
      case 'fotograf':
        return 'Fotograf';
      case 'animator':
        return 'Animator';
      case 'bucatar':
        return 'Bucătar';
      default:
        return role;
    }
  }

  Future<void> _handleRoleAssignment(String role, bool isAssigned, String? currentUserId) async {
    try {
      if (isAssigned) {
        // Unassign
        await _eventService.updateRoleAssignment(
          eventId: widget.eventId,
          role: role,
          userId: null,
        );
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${_getRoleLabel(role)} dezalocat')),
          );
        }
      } else {
        // Selector de useri
        final selectedUserId = await showUserSelectorDialog(
          context: context,
          currentUserId: assignment.userId,
          title: 'Alocă ${_getRoleLabel(role)}',
        );

        if (selectedUserId == null && assignment.userId == null) {
          // User a anulat sau a selectat "Nealocat" când era deja nealocat
          return;
        }

        await _eventService.updateRoleAssignment(
          eventId: widget.eventId,
          role: role,
          userId: selectedUserId, // null = unassign
        );
        
        if (mounted) {
          final message = selectedUserId == null
              ? '${_getRoleLabel(role)} dealocat'
              : '${_getRoleLabel(role)} alocat';
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(message)),
          );
        }
      }

      // Reload event
      await _loadEvent();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _handleDriverAssignment(bool isAssigned, String? currentUserId) async {
    try {
      if (isAssigned) {
        // Unassign
        await _eventService.updateDriverAssignment(
          eventId: widget.eventId,
          userId: null,
        );
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Șofer dezalocat')),
          );
        }
      } else {
        // Selector de useri pentru șofer
        final selectedUserId = await showUserSelectorDialog(
          context: context,
          currentUserId: currentUserId,
          title: 'Alocă Șofer',
        );

        if (selectedUserId == null && currentUserId == null) {
          // User a anulat sau a selectat "Nealocat" când era deja nealocat
          return;
        }

        await _eventService.updateDriverAssignment(
          eventId: widget.eventId,
          userId: selectedUserId, // null = unassign
        );
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Șofer alocat')),
          );
        }
      }

      // Reload event
      await _loadEvent();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// Buton pentru arhivare eveniment
  Widget _buildArchiveButton() {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: () => _showArchiveDialog(),
        icon: const Icon(Icons.archive),
        label: const Text('Arhivează Eveniment'),
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFFF97316),
          side: const BorderSide(color: Color(0xFFF97316)),
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
      ),
    );
  }

  /// Dialog pentru confirmare arhivare
  Future<void> _showArchiveDialog() async {
    final reasonController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A2332),
        title: const Text(
          'Arhivează Eveniment',
          style: TextStyle(color: Color(0xFFE2E8F0)),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Evenimentul va fi arhivat și nu va mai apărea în lista principală.',
              style: TextStyle(color: Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              style: const TextStyle(color: Color(0xFFE2E8F0)),
              decoration: InputDecoration(
                labelText: 'Motiv (opțional)',
                labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
                hintText: 'Ex: Eveniment anulat, Eveniment finalizat',
                hintStyle: const TextStyle(color: Color(0xFF64748B)),
                filled: true,
                fillColor: const Color(0xFF0B1220),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFF2D3748)),
                ),
              ),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text(
              'Anulează',
              style: TextStyle(color: Color(0xFF94A3B8)),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF97316),
            ),
            child: const Text('Arhivează'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await _eventService.archiveEvent(
          widget.eventId,
          reason: reasonController.text.trim().isEmpty
              ? null
              : reasonController.text.trim(),
        );

        if (mounted) {
          Navigator.pop(context); // Închide sheet-ul
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Eveniment arhivat cu succes'),
              backgroundColor: Color(0xFF10B981),
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Eroare: ${e.toString()}'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }

    reasonController.dispose();
  }
}
