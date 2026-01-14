import 'dart:ui';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../services/admin_service.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  final AdminService _admin = AdminService();
  final TextEditingController _searchCtrl = TextEditingController();

  bool _checking = true;
  bool _isAdmin = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _boot();
    _searchCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    setState(() {
      _checking = true;
      _error = '';
    });
    try {
      final ok = await _admin.isCurrentUserAdmin();
      setState(() {
        _checking = false;
        _isAdmin = ok;
      });
      if (!ok) {
        setState(() => _error = 'Nu ai permisiuni de admin.');
      }
    } catch (e) {
      setState(() {
        _checking = false;
        _isAdmin = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bg = const Color(0xFF0B1220);

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
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Admin',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFFEAF1FF)),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                  child: _checking
                      ? const Center(child: CircularProgressIndicator())
                      : !_isAdmin
                          ? _ErrorBox(text: _error.isNotEmpty ? _error : 'Nu ai permisiuni de admin.')
                          : Column(
                              children: [
                                TextField(
                                  controller: _searchCtrl,
                                  style: const TextStyle(color: Color(0xFFEAF1FF)),
                                  decoration: InputDecoration(
                                    hintText: 'Caută după nume / email / cod…',
                                    hintStyle: TextStyle(color: const Color(0xFFEAF1FF).withOpacity(0.58)),
                                    filled: true,
                                    fillColor: Colors.black.withOpacity(0.22),
                                    prefixIcon: const Icon(Icons.search, color: Color(0xFFEAF1FF)),
                                    enabledBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      borderSide: BorderSide(color: Colors.white.withOpacity(0.12)),
                                    ),
                                    focusedBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      borderSide: BorderSide(color: const Color.fromRGBO(78, 205, 196, 1).withOpacity(0.45)),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Expanded(
                                  child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                                    stream: _admin.streamStaffProfiles(limit: 300),
                                    builder: (context, snap) {
                                      if (snap.connectionState == ConnectionState.waiting) {
                                        return const Center(child: CircularProgressIndicator());
                                      }
                                      if (snap.hasError) {
                                        return _ErrorBox(text: 'Eroare: ${snap.error}');
                                      }

                                      final docs = snap.data?.docs ?? const [];
                                      final q = _searchCtrl.text.trim().toLowerCase();
                                      final filtered = q.isEmpty
                                          ? docs
                                          : docs.where((d) {
                                              final data = d.data();
                                              final email = (data['email'] as String?) ?? '';
                                              final nume = (data['nume'] as String?) ?? (data['name'] as String?) ?? '';
                                              final code = (data['assignedCode'] as String?) ?? (data['codIdentificare'] as String?) ?? '';
                                              return email.toLowerCase().contains(q) || nume.toLowerCase().contains(q) || code.toLowerCase().contains(q) || d.id.toLowerCase().contains(q);
                                            }).toList();

                                      if (filtered.isEmpty) {
                                        return const _NoticeBox(text: 'Nu există rezultate.');
                                      }

                                      return ListView.separated(
                                        itemCount: filtered.length,
                                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                                        itemBuilder: (context, i) {
                                          final doc = filtered[i];
                                          final data = doc.data();
                                          final email = (data['email'] as String?) ?? '';
                                          final nume = (data['nume'] as String?) ?? (data['name'] as String?) ?? '';
                                          final assigned = (data['assignedCode'] as String?) ?? (data['codIdentificare'] as String?) ?? '';
                                          final teamId = (data['teamId'] as String?) ?? '';
                                          final setupDone = (data['setupDone'] as bool?) ?? false;

                                          return InkWell(
                                            onTap: () {
                                              context.push('/admin/user/${doc.id}');
                                            },
                                            child: Container(
                                              padding: const EdgeInsets.all(12),
                                              decoration: BoxDecoration(
                                                color: Colors.white.withOpacity(0.06),
                                                borderRadius: BorderRadius.circular(14),
                                                border: Border.all(color: Colors.white.withOpacity(0.10)),
                                              ),
                                              child: Row(
                                                children: [
                                                  Container(
                                                    width: 40,
                                                    height: 40,
                                                    alignment: Alignment.center,
                                                    decoration: BoxDecoration(
                                                      color: const Color.fromRGBO(78, 205, 196, 1).withOpacity(0.15),
                                                      borderRadius: BorderRadius.circular(12),
                                                      border: Border.all(color: Colors.white.withOpacity(0.10)),
                                                    ),
                                                    child: Text(
                                                      (assigned.isNotEmpty ? assigned : '—'),
                                                      style: const TextStyle(color: Color(0xFFEAF1FF), fontWeight: FontWeight.w900, fontSize: 11),
                                                      overflow: TextOverflow.ellipsis,
                                                    ),
                                                  ),
                                                  const SizedBox(width: 12),
                                                  Expanded(
                                                    child: Column(
                                                      crossAxisAlignment: CrossAxisAlignment.start,
                                                      children: [
                                                        Text(
                                                          nume.isNotEmpty ? nume : '(fără nume)',
                                                          style: const TextStyle(color: Color(0xFFEAF1FF), fontWeight: FontWeight.w900),
                                                        ),
                                                        const SizedBox(height: 2),
                                                        Text(
                                                          email.isNotEmpty ? email : doc.id,
                                                          style: TextStyle(color: const Color(0xFFEAF1FF).withOpacity(0.65), fontSize: 12),
                                                          overflow: TextOverflow.ellipsis,
                                                        ),
                                                        const SizedBox(height: 4),
                                                        Text(
                                                          'teamId: ${teamId.isNotEmpty ? teamId : '—'} • setupDone: $setupDone',
                                                          style: TextStyle(color: const Color(0xFFEAF1FF).withOpacity(0.55), fontSize: 11),
                                                        ),
                                                      ],
                                                    ),
                                                  ),
                                                  const Icon(Icons.chevron_right, color: Color(0xFFEAF1FF)),
                                                ],
                                              ),
                                            ),
                                          );
                                        },
                                      );
                                    },
                                  ),
                                ),
                              ],
                            ),
                ),
              ),
            ],
          ),
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

