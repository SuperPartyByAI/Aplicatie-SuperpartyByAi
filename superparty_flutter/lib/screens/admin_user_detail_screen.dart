import 'dart:ui';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../models/staff_models.dart';
import '../services/admin_service.dart';
import '../services/staff_settings_service.dart';

class AdminUserDetailScreen extends StatefulWidget {
  final String uid;
  const AdminUserDetailScreen({super.key, required this.uid});

  @override
  State<AdminUserDetailScreen> createState() => _AdminUserDetailScreenState();
}

class _AdminUserDetailScreenState extends State<AdminUserDetailScreen> {
  final AdminService _admin = AdminService();
  final StaffSettingsService _staff = StaffSettingsService();

  bool _busy = false;
  String _info = '';
  String _error = '';

  List<TeamItem> _teams = [];

  @override
  void initState() {
    super.initState();
    _loadTeams();
  }

  Future<void> _loadTeams() async {
    try {
      final t = await _staff.listTeams();
      if (mounted) setState(() => _teams = t);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  void _setInfo(String msg) {
    setState(() {
      _info = msg;
      if (msg.isNotEmpty) _error = '';
    });
  }

  void _setError(String msg) {
    setState(() {
      _error = msg;
      if (msg.isNotEmpty) _info = '';
    });
  }

  String _prettyError(Object e) {
    final s = e.toString();
    return s.replaceFirst(RegExp(r'^(Exception|StateError):\s*'), '');
  }

  @override
  Widget build(BuildContext context) {
    final bg = const Color(0xFF0B1220);
    final accent = const Color.fromRGBO(78, 205, 196, 1);

    return Scaffold(
      backgroundColor: bg,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF111C35), Color(0xFF0B1220)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              ClipRect(
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: bg.withOpacity(0.72),
                      border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.08))),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Detalii utilizator',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFFEAF1FF)),
                        ),
                        Text(
                          widget.uid,
                          style: TextStyle(color: const Color(0xFFEAF1FF).withOpacity(0.6), fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                  child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                    stream: _admin.streamUserDoc(widget.uid),
                    builder: (context, userSnap) {
                      return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                        stream: _admin.streamStaffProfile(widget.uid),
                        builder: (context, staffSnap) {
                          final userData = userSnap.data?.data() ?? const <String, dynamic>{};
                          final staffData = staffSnap.data?.data() ?? const <String, dynamic>{};

                          final email = (staffData['email'] as String?) ?? (userData['email'] as String?) ?? '';
                          final nume = (staffData['nume'] as String?) ?? (userData['displayName'] as String?) ?? '';
                          final phone = (staffData['phone'] as String?) ?? (userData['phone'] as String?) ?? '';
                          final teamId = (staffData['teamId'] as String?) ?? '';
                          final assigned = (staffData['assignedCode'] as String?) ?? (staffData['codIdentificare'] as String?) ?? '';
                          final setupDone = (staffData['setupDone'] as bool?) ?? false;
                          final status = (userData['status'] as String?) ?? 'active';

                          return SingleChildScrollView(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _GlassCard(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      _MetaRow(label: 'Nume:', value: nume.isNotEmpty ? nume : '(—)'),
                                      _MetaRow(label: 'Email:', value: email.isNotEmpty ? email : '(—)'),
                                      _MetaRow(label: 'Telefon:', value: phone.isNotEmpty ? phone : '(—)'),
                                      _MetaRow(label: 'Team:', value: teamId.isNotEmpty ? teamId : '(—)'),
                                      _MetaRow(label: 'Cod:', value: assigned.isNotEmpty ? assigned : '(—)'),
                                      _MetaRow(label: 'Setup done:', value: '$setupDone'),
                                      _MetaRow(label: 'Status:', value: status),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 12),
                                _GlassCard(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const _FieldLabel('Schimbă echipa (re-alocă cod)'),
                                      const SizedBox(height: 8),
                                      DropdownButtonFormField<String>(
                                        value: teamId.isNotEmpty ? teamId : null,
                                        items: _teams
                                            .map(
                                              (t) => DropdownMenuItem<String>(
                                                value: t.id,
                                                child: Text(t.label, overflow: TextOverflow.ellipsis),
                                              ),
                                            )
                                            .toList(),
                                        onChanged: _busy
                                            ? null
                                            : (newTeamId) async {
                                                if (newTeamId == null || newTeamId.isEmpty) return;
                                                setState(() {
                                                  _busy = true;
                                                  _info = '';
                                                  _error = '';
                                                });
                                                try {
                                                  await _admin.changeUserTeam(uid: widget.uid, newTeamId: newTeamId);
                                                  _setInfo('Echipa a fost schimbată și codul a fost re-alocat.');
                                                } catch (e) {
                                                  _setError(_prettyError(e));
                                                } finally {
                                                  setState(() => _busy = false);
                                                }
                                              },
                                        decoration: _inputDecoration('Selectează echipa…'),
                                        dropdownColor: const Color(0xFF0B1220),
                                        style: const TextStyle(color: Color(0xFFEAF1FF)),
                                      ),
                                      const SizedBox(height: 10),
                                      SizedBox(
                                        width: double.infinity,
                                        height: 44,
                                        child: OutlinedButton(
                                          onPressed: (_busy || teamId.isEmpty)
                                              ? null
                                              : () async {
                                                  setState(() {
                                                    _busy = true;
                                                    _info = '';
                                                    _error = '';
                                                  });
                                                  try {
                                                    await _admin.changeUserTeam(uid: widget.uid, newTeamId: teamId, forceReallocate: true);
                                                    _setInfo('Codul a fost re-alocat în aceeași echipă.');
                                                  } catch (e) {
                                                    _setError(_prettyError(e));
                                                  } finally {
                                                    setState(() => _busy = false);
                                                  }
                                                },
                                          style: OutlinedButton.styleFrom(
                                            foregroundColor: const Color(0xFFEAF1FF),
                                            side: BorderSide(color: accent.withOpacity(0.35)),
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                          ),
                                          child: _busy ? const Text('Se procesează…') : const Text('Force reallocate (same team)'),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 12),
                                _GlassCard(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const _FieldLabel('Status utilizator'),
                                      const SizedBox(height: 8),
                                      Wrap(
                                        spacing: 10,
                                        runSpacing: 10,
                                        children: [
                                          _StatusButton(
                                            label: 'active',
                                            selected: status == 'active',
                                            busy: _busy,
                                            onTap: () => _setStatus('active'),
                                          ),
                                          _StatusButton(
                                            label: 'inactive',
                                            selected: status == 'inactive',
                                            busy: _busy,
                                            onTap: () => _setStatus('inactive'),
                                          ),
                                          _StatusButton(
                                            label: 'blocked',
                                            selected: status == 'blocked',
                                            busy: _busy,
                                            onTap: () => _setStatus('blocked'),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                if (_info.isNotEmpty) ...[
                                  const SizedBox(height: 12),
                                  _NoticeBox(text: _info),
                                ],
                                if (_error.isNotEmpty) ...[
                                  const SizedBox(height: 12),
                                  _ErrorBox(text: _error),
                                ],
                              ],
                            ),
                          );
                        },
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _setStatus(String status) async {
    setState(() {
      _busy = true;
      _info = '';
      _error = '';
    });
    try {
      await _admin.setUserStatus(uid: widget.uid, status: status);
      _setInfo('Status actualizat: $status');
    } catch (e) {
      _setError(_prettyError(e));
    } finally {
      setState(() => _busy = false);
    }
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: const Color(0xFFEAF1FF).withOpacity(0.58)),
      filled: true,
      fillColor: Colors.black.withOpacity(0.22),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.white.withOpacity(0.12)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: const Color.fromRGBO(78, 205, 196, 1).withOpacity(0.45)),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.white.withOpacity(0.10)),
      ),
    );
  }
}

class _StatusButton extends StatelessWidget {
  final String label;
  final bool selected;
  final bool busy;
  final VoidCallback onTap;

  const _StatusButton({
    required this.label,
    required this.selected,
    required this.busy,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final accent = const Color.fromRGBO(78, 205, 196, 1);
    return InkWell(
      onTap: busy ? null : onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? accent.withOpacity(0.18) : Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? accent.withOpacity(0.40) : Colors.white.withOpacity(0.10)),
        ),
        child: Text(
          label,
          style: const TextStyle(color: Color(0xFFEAF1FF), fontWeight: FontWeight.w900),
        ),
      ),
    );
  }
}

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 50, offset: const Offset(0, 18))],
      ),
      child: child,
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(text, style: const TextStyle(color: Color(0xFFEAF1FF), fontWeight: FontWeight.w800));
  }
}

class _MetaRow extends StatelessWidget {
  final String label;
  final String value;
  const _MetaRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: RichText(
        text: TextSpan(
          style: TextStyle(color: const Color(0xFFEAF1FF).withOpacity(0.70)),
          children: [
            TextSpan(text: label, style: const TextStyle(color: Color(0xFFEAF1FF), fontWeight: FontWeight.w800)),
            TextSpan(text: ' $value'),
          ],
        ),
      ),
    );
  }
}

class _NoticeBox extends StatelessWidget {
  final String text;
  const _NoticeBox({required this.text});

  @override
  Widget build(BuildContext context) {
    final border = const Color.fromRGBO(78, 205, 196, 1).withOpacity(0.25);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color.fromRGBO(78, 205, 196, 1).withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Text(text, style: const TextStyle(color: Color(0xFFEAF1FF))),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  final String text;
  const _ErrorBox({required this.text});

  @override
  Widget build(BuildContext context) {
    final border = const Color.fromRGBO(255, 120, 120, 1).withOpacity(0.35);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color.fromRGBO(255, 120, 120, 1).withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Text(text, style: const TextStyle(color: Color(0xFFEAF1FF))),
    );
  }
}

