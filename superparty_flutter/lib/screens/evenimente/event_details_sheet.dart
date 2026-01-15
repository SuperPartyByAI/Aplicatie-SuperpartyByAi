import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:provider/provider.dart';
import '../../models/event_model.dart';
import '../../services/event_service.dart';
import '../../providers/app_state_provider.dart';
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

  // Roluri disponibile (servicii reale oferite)
  final List<String> _roles = [
    'animator',
    'ursitoare',
    'vata',
    'popcorn',
    'vata_popcorn',
    'decoratiuni',
    'baloane',
    'baloane_heliu',
    'aranjamente_masa',
    'mos_craciun',
    'gheata_carbonica',
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
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFDC2626), Color(0xFFF97316)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _event?.sarbatoritNume ?? 'Detalii Eveniment',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (_event != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    _event!.date, // Use date string directly (DD-MM-YYYY)
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                    ),
                  ),
                ],
              ],
            ),
          ),
          // Employee/GM buttons
          Consumer<AppStateProvider>(
            builder: (context, appState, _) {
              // All employees can edit/archive
              if (!appState.isEmployee) {
                return const SizedBox.shrink();
              }
              
              return Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // View AI Logic button (GM/Admin only)
                  if (appState.isGmOrAdmin)
                    IconButton(
                      icon: const Icon(Icons.psychology, color: Colors.amber),
                      tooltip: 'Vezi Logica AI',
                      onPressed: _showAILogic,
                    ),
                  // Edit button (all employees)
                  IconButton(
                    icon: const Icon(Icons.edit, color: Colors.white),
                    tooltip: 'Editează Eveniment',
                    onPressed: _showEditDialog,
                  ),
                  // Archive button (all employees)
                  if (_event != null && !_event!.isArchived)
                    IconButton(
                      icon: const Icon(Icons.archive, color: Colors.orange),
                      tooltip: 'Arhivează Eveniment',
                      onPressed: _showArchiveDialog,
                    ),
                ],
              );
            },
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
          if (_event!.needsDriver) ...[
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
          _buildInfoRow(Icons.location_on, 'Locație', _event!.address),
          const SizedBox(height: 12),
          // Note: tipEveniment and tipLocatie not available in v2 schema
          // _buildInfoRow(Icons.event, 'Tip Eveniment', _event!.tipEveniment),
          // const SizedBox(height: 12),
          // _buildInfoRow(Icons.place, 'Tip Locație', _event!.tipLocatie),
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
    // Find role by label
    final roleModel = _event!.roles.firstWhere(
      (r) => r.label.toLowerCase() == role.toLowerCase(),
      orElse: () => throw Exception('Rol $role nu există'),
    );
    final isAssigned = roleModel.status == RoleStatus.assigned;
    final userId = roleModel.assignedCode;

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
                  ? const Color(0xFFDC2626).withValues(alpha: 0.2)
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
    final isAssigned = _event!.hasDriverAssigned;
    final userId = _event!.sofer;

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
                      ? const Color(0xFFDC2626).withValues(alpha: 0.2)
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
      case 'animator':
        return Icons.celebration;
      case 'ursitoare':
        return Icons.auto_awesome;
      case 'vata':
        return Icons.cloud;
      case 'popcorn':
        return Icons.local_movies;
      case 'vata_popcorn':
        return Icons.fastfood;
      case 'decoratiuni':
        return Icons.auto_fix_high;
      case 'baloane':
        return Icons.bubble_chart;
      case 'baloane_heliu':
        return Icons.air;
      case 'aranjamente_masa':
        return Icons.table_restaurant;
      case 'mos_craciun':
        return Icons.card_giftcard;
      case 'gheata_carbonica':
        return Icons.ac_unit;
      default:
        return Icons.star;
    }
  }

  String _getRoleLabel(String role) {
    switch (role) {
      case 'animator':
        return 'Animator';
      case 'ursitoare':
        return 'Ursitoare';
      case 'vata':
        return 'Vată de zahăr';
      case 'popcorn':
        return 'Popcorn';
      case 'vata_popcorn':
        return 'Vată + Popcorn';
      case 'decoratiuni':
        return 'Decorațiuni';
      case 'baloane':
        return 'Baloane';
      case 'baloane_heliu':
        return 'Baloane cu heliu';
      case 'aranjamente_masa':
        return 'Aranjamente de masă';
      case 'mos_craciun':
        return 'Moș Crăciun';
      case 'gheata_carbonica':
        return 'Gheață carbonică';
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
        // Find role model for current userId
        final roleModel = _event!.roles.firstWhere(
          (r) => r.label.toLowerCase() == role.toLowerCase(),
          orElse: () => throw Exception('Rol $role nu există'),
        );
        final currentUserId = roleModel.assignedCode;

        // Selector de useri
        final selectedUserId = await showUserSelectorDialog(
          context: context,
          currentUserId: currentUserId,
          title: 'Alocă ${_getRoleLabel(role)}',
        );

        if (selectedUserId == null && currentUserId == null) {
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
      final currentDriverId = _event!.sofer;
      
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
          currentUserId: currentDriverId,
          title: 'Alocă Șofer',
        );

        if (selectedUserId == null && currentDriverId == null) {
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

  /// Show AI Logic dialog - displays prompts used for event creation
  void _showAILogic() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.psychology, color: Colors.amber),
            SizedBox(width: 8),
            Text('Logica AI - Notare Evenimente'),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildAILogicSection(
                'Detectare Comandă',
                '''Comenzi detectate:
- "creează eveniment"
- "notează petrecere"
- "notez petrecere"
- "vreau să notez"
- "adaugă eveniment"
- "adauga eveniment"
- "creaza eveniment"''',
              ),
              const Divider(),
              _buildAILogicSection(
                'Extragere Date',
                '''Model: llama-3.3-70b-versatile
Prompt: "Extrage din text: data, adresa, nume sărbătorit, vârstă"
Exemple:
- "Nuntă pe 15 ianuarie la Hotel Central pentru Maria 25 ani"
- "Botez duminică la Restaurant pentru Alex"''',
              ),
              const Divider(),
              _buildAILogicSection(
                'Validare',
                '''Verificări:
✓ Data trebuie să fie în viitor
✓ Adresa obligatorie
✓ Nume sărbătorit obligatoriu
✓ Vârstă validă (0-120)''',
              ),
              const Divider(),
              _buildAILogicSection(
                'Salvare Firestore',
                '''Colecție: evenimente
Schema v2:
- date (DD-MM-YYYY)
- address
- sarbatoritNume
- sarbatoritVarsta
- roles (array A-J)
- incasare (total, avans, rest)
- createdBy, updatedBy''',
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Închide'),
          ),
        ],
      ),
    );
  }

  Widget _buildAILogicSection(String title, String content) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          content,
          style: const TextStyle(fontSize: 14, height: 1.5),
        ),
      ],
    );
  }

  /// Show edit dialog with all fields
  void _showEditDialog() {
    if (_event == null) return;

    // Controllers for all fields
    final dateController = TextEditingController(text: _event!.date);
    final addressController = TextEditingController(text: _event!.address);
    final numeController = TextEditingController(text: _event!.sarbatoritNume);
    final varstaController = TextEditingController(text: _event!.sarbatoritVarsta.toString());
    final totalController = TextEditingController(text: (_event!.incasare.suma ?? 0.0).toString());
    final avansController = TextEditingController(text: '0.0'); // avans not available in v2

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Editează Eveniment'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: dateController,
                decoration: const InputDecoration(
                  labelText: 'Data (DD-MM-YYYY)',
                  prefixIcon: Icon(Icons.calendar_today),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: addressController,
                decoration: const InputDecoration(
                  labelText: 'Adresa',
                  prefixIcon: Icon(Icons.location_on),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: numeController,
                decoration: const InputDecoration(
                  labelText: 'Sărbătorit Nume',
                  prefixIcon: Icon(Icons.person),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: varstaController,
                decoration: const InputDecoration(
                  labelText: 'Sărbătorit Vârstă',
                  prefixIcon: Icon(Icons.cake),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: totalController,
                decoration: const InputDecoration(
                  labelText: 'Total Încasare',
                  prefixIcon: Icon(Icons.attach_money),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: avansController,
                decoration: const InputDecoration(
                  labelText: 'Avans',
                  prefixIcon: Icon(Icons.payment),
                ),
                keyboardType: TextInputType.number,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Anulează'),
          ),
          ElevatedButton(
            onPressed: () async {
              // Save context-dependent objects before async operation
              if (!mounted) return;
              final navigator = Navigator.of(context);
              final messenger = ScaffoldMessenger.of(context);
              
              try {
                // Validate inputs
                final date = dateController.text.trim();
                final address = addressController.text.trim();
                final nume = numeController.text.trim();
                final varsta = int.tryParse(varstaController.text.trim()) ?? 0;
                final total = double.tryParse(totalController.text.trim()) ?? 0;
                // Note: avans not in v2 schema, but we can add it if needed
                // final avans = double.tryParse(avansController.text.trim()) ?? 0;

                if (date.isEmpty || address.isEmpty || nume.isEmpty) {
                  throw Exception('Toate câmpurile sunt obligatorii');
                }

                // Update event in Firestore
                final user = FirebaseAuth.instance.currentUser;
                if (user == null) throw Exception('Nu ești autentificat');

                await FirebaseFirestore.instance
                    .collection('evenimente')
                    .doc(_event!.id)
                    .update({
                  'date': date,
                  'address': address,
                  'sarbatoritNume': nume,
                  'sarbatoritVarsta': varsta,
                  'incasare.suma': total,
                  // Note: avans not in v2 schema, but we can add it if needed
                  // 'incasare.avans': avans,
                  // 'incasare.restDePlata': total - avans,
                  'updatedAt': FieldValue.serverTimestamp(),
                  'updatedBy': user.uid,
                });

                if (!mounted) return;
                navigator.pop();
                if (!mounted) return;
                messenger.showSnackBar(
                  const SnackBar(
                    content: Text('✅ Eveniment actualizat cu succes!'),
                    backgroundColor: Colors.green,
                  ),
                );
                _loadEvent(); // Reload event
              } catch (e) {
                // Use messenger saved before async operation
                if (!mounted) return;
                messenger.showSnackBar(
                  SnackBar(
                    content: Text('❌ Eroare: ${e.toString()}'),
                    backgroundColor: Colors.red,
                  ),
                );
              }
            },
            child: const Text('Salvează'),
          ),
        ],
      ),
    );
  }

  // Removed duplicate _showArchiveDialog - keeping only the Future<void> version at line 710
}
