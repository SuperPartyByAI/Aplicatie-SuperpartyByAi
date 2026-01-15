import 'dart:ui';
import 'dart:math';

import 'package:flutter/material.dart';

import '../core/errors/app_exception.dart';
import '../models/staff_models.dart';
import '../services/staff_settings_service.dart';

class StaffSettingsScreen extends StatefulWidget {
  const StaffSettingsScreen({super.key});

  @override
  State<StaffSettingsScreen> createState() => _StaffSettingsScreenState();
}

class _StaffSettingsScreenState extends State<StaffSettingsScreen> {
  final StaffSettingsService _service = StaffSettingsService();

  bool _loading = true;
  bool _busy = false;

  String _info = '';
  String _error = '';

  String _email = '';
  String _fullName = '';
  bool _kycDone = false;

  List<TeamItem> _teams = [];
  String? _selectedTeamId;

  bool _teamLocked = false; // setupDone == true

  // Temporary allocation during initial setup only.
  String? _tempAllocatedTeamId;
  int? _tempAllocatedNumber;
  String? _tempAllocatedPrefix;

  int _allocRequestToken = 0;

  /// Generate unique request token for idempotency
  String _generateRequestToken() {
    return '${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(10000)}';
  }

  final _phoneCtrl = TextEditingController();
  final _assignedCodeCtrl = TextEditingController();
  final _ceCodAiCtrl = TextEditingController();
  final _cineNoteazaCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _assignedCodeCtrl.dispose();
    _ceCodAiCtrl.dispose();
    _cineNoteazaCtrl.dispose();
    super.dispose();
  }

  void _setError(String msg) {
    setState(() {
      _error = msg;
      if (msg.isNotEmpty) _info = '';
    });
  }

  void _setInfo(String msg) {
    setState(() {
      _info = msg;
      if (msg.isNotEmpty) _error = '';
    });
  }

  String _prettyError(Object e) {
    if (e is AppException) {
      return e.message;
    }
    final s = e.toString();
    return s.replaceFirst(RegExp(r'^(Exception|StateError|Error):\s*'), '');
  }

  void _applyAssignedCode(String code) {
    final val = code.trim();
    _assignedCodeCtrl.text = val;
    _ceCodAiCtrl.text = val;
    _cineNoteazaCtrl.text = val;
  }

  Future<void> _boot() async {
    setState(() {
      _loading = true;
      _error = '';
      _info = '';
    });

    final user = _service.currentUser;
    if (user == null) {
      setState(() => _loading = false);
      _setError('Nu ești autentificat.');
      return;
    }

    _email = user.email ?? '';

    try {
      final userDoc = await _service.fetchUserDoc(user.uid, emailFallback: _email);
      final staff = await _service.fetchStaffProfile(user.uid);
      final teams = await _service.listTeams();

      _fullName = userDoc.fullName;
      _kycDone = userDoc.kycDone;

      _teams = teams;
      _selectedTeamId = staff.teamId;
      _teamLocked = staff.setupDone;

      final phone = staff.phone ?? userDoc.phone ?? '';
      if (phone.isNotEmpty) _phoneCtrl.text = phone;

      final existingCode = (staff.assignedCode ?? '').trim();
      _applyAssignedCode(existingCode);

      // If still initial setup but already has allocated code, track it as temp allocation.
      if (!_teamLocked && (staff.teamId ?? '').isNotEmpty && existingCode.isNotEmpty) {
        final parsed = StaffSettingsService.tryParseAssignedCode(existingCode);
        if (parsed != null) {
          _tempAllocatedTeamId = staff.teamId;
          _tempAllocatedPrefix = parsed.prefix;
          _tempAllocatedNumber = parsed.number;
        }
      }

      setState(() => _loading = false);

      if (!_kycDone) {
        _setError('KYC nu este complet. Completează KYC și revino.');
        return;
      }

      if (_teamLocked) {
        _setInfo('Profilul staff este deja configurat. ECHIPA este blocată aici și poate fi schimbată doar din Admin.');
      }
    } catch (e) {
      setState(() => _loading = false);
      _setError(_prettyError(e));
    }
  }

  Future<void> _onTeamChanged(String? teamId) async {
    if (_teamLocked) return;
    if (_busy) return;

    final prevSelected = _selectedTeamId;
    setState(() {
      _selectedTeamId = teamId;
      _error = '';
      _info = '';
    });

    if (teamId == null || teamId.isEmpty) {
      _applyAssignedCode('');
      _tempAllocatedTeamId = null;
      _tempAllocatedNumber = null;
      _tempAllocatedPrefix = null;
      return;
    }

    if (prevSelected == teamId) return;

    final user = _service.currentUser;
    if (user == null) {
      _setError('Nu ești autentificat.');
      return;
    }

    final myToken = ++_allocRequestToken;
    final requestToken = _generateRequestToken();
    setState(() => _busy = true); // disable dropdown immediately

    try {
      final res = await _service.allocateStaffCode(
        teamId: teamId,
        prevTeamId: _tempAllocatedTeamId,
        prevCodeNumber: _tempAllocatedNumber,
        requestToken: requestToken,
      );

      if (myToken != _allocRequestToken) return;

      _applyAssignedCode(res.assignedCode);
      _tempAllocatedTeamId = res.teamId;
      _tempAllocatedPrefix = res.prefix;
      _tempAllocatedNumber = res.number;
    } catch (e) {
      if (myToken != _allocRequestToken) return;
      _applyAssignedCode('');
      _tempAllocatedTeamId = null;
      _tempAllocatedNumber = null;
      _tempAllocatedPrefix = null;
      _setError(_prettyError(e));
    } finally {
      if (myToken == _allocRequestToken) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _onSave() async {
    // Guard: prevent double-submit
    if (_busy) return;
    
    final user = _service.currentUser;
    if (user == null) {
      _setError('Nu ești autentificat.');
      return;
    }

    if (!_kycDone) {
      _setError('KYC nu este complet. Completează KYC și revino.');
      return;
    }

    final teamId = _selectedTeamId;
    if (teamId == null || teamId.isEmpty) {
      _setError('Selectează echipa.');
      return;
    }

    final phoneRaw = _phoneCtrl.text.trim();
    if (!StaffSettingsService.isPhoneValid(phoneRaw)) {
      _setError('Numărul de telefon nu este valid (format RO: 07xx… sau +40…).');
      return;
    }
    final phone = StaffSettingsService.normalizePhone(phoneRaw);

    var assigned = _assignedCodeCtrl.text.trim();

    try {
      setState(() => _busy = true);

      if (_teamLocked) {
        await _service.updateStaffPhone(phone: phone);
      } else {
        final requestToken = _generateRequestToken();
        
        if (assigned.isEmpty) {
          final res = await _service.allocateStaffCode(
            teamId: teamId,
            prevTeamId: _tempAllocatedTeamId,
            prevCodeNumber: _tempAllocatedNumber,
            requestToken: requestToken,
          );
          assigned = res.assignedCode;
          _applyAssignedCode(assigned);
          _tempAllocatedTeamId = res.teamId;
          _tempAllocatedPrefix = res.prefix;
          _tempAllocatedNumber = res.number;
        }

        if (assigned.isEmpty) {
          _setError('Nu s-a putut aloca un cod. Încearcă din nou.');
          return;
        }

        await _service.finalizeStaffSetup(
          phone: phone,
          teamId: teamId,
          assignedCode: assigned,
          requestToken: requestToken,
        );
      }

      _setInfo('Setările staff au fost salvate.');
      setState(() {
        _teamLocked = true;
        _tempAllocatedTeamId = null;
        _tempAllocatedNumber = null;
        _tempAllocatedPrefix = null;
      });
    } catch (e) {
      _setError(_prettyError(e));
    } finally {
      setState(() => _busy = false);
    }
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
                          'Setări Staff',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFFEAF1FF)),
                        ),
                        Container(
                          constraints: const BoxConstraints(maxWidth: 240),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.04),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: Colors.white.withOpacity(0.10)),
                          ),
                          child: Text(
                            (_fullName.isNotEmpty ? _fullName : _email).isNotEmpty ? (_fullName.isNotEmpty ? _fullName : _email) : '(—)',
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Color(0xFFEAF1FF), fontWeight: FontWeight.w900, fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
                  child: _loading
                      ? const _NoticeBox(text: 'Se încarcă…')
                      : (!_kycDone)
                          ? _buildKycBlocked()
                          : _buildCard(accent),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildKycBlocked() {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _MetaRow(label: 'Email:', value: _email.isNotEmpty ? _email : '(—)'),
          const SizedBox(height: 12),
          if (_error.isNotEmpty) _ErrorBox(text: _error) else const _ErrorBox(text: 'KYC nu este complet. Completează KYC și revino.'),
        ],
      ),
    );
  }

  Widget _buildCard(Color accent) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _MetaRow(label: 'Email:', value: _email.isNotEmpty ? _email : '(—)'),
          _MetaRow(label: 'Nume:', value: _fullName.isNotEmpty ? _fullName : '(lipsește)'),
          _MetaRow(label: 'Cod alocat:', value: _assignedCodeCtrl.text.isNotEmpty ? _assignedCodeCtrl.text : '(nelocat)'),
          const SizedBox(height: 10),
          const _FieldLabel('Număr de telefon'),
          TextField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            enabled: !_busy,
            style: const TextStyle(color: Color(0xFFEAF1FF)),
            decoration: _inputDecoration('07xx xxx xxx'),
          ),
          const SizedBox(height: 12),
          const _FieldLabel('Echipă'),
          DropdownButtonFormField<String>(
            value: (_selectedTeamId != null && _selectedTeamId!.isNotEmpty) ? _selectedTeamId : null,
            items: _teams
                .map(
                  (t) => DropdownMenuItem<String>(
                    value: t.id,
                    child: Text(t.label, overflow: TextOverflow.ellipsis),
                  ),
                )
                .toList(),
            onChanged: (_busy || _teamLocked) ? null : _onTeamChanged,
            decoration: _inputDecoration('Selectează echipa…'),
            dropdownColor: const Color(0xFF0B1220),
            style: const TextStyle(color: Color(0xFFEAF1FF)),
          ),
          const SizedBox(height: 12),
          const _FieldLabel('Cod identificare'),
          TextField(
            controller: _assignedCodeCtrl,
            readOnly: true,
            enabled: false,
            style: const TextStyle(color: Color(0xFFEAF1FF)),
            decoration: _inputDecoration(''),
          ),
          const SizedBox(height: 12),
          const _FieldLabel('Ce cod ai'),
          TextField(
            controller: _ceCodAiCtrl,
            readOnly: true,
            enabled: false,
            style: const TextStyle(color: Color(0xFFEAF1FF)),
            decoration: _inputDecoration(''),
          ),
          const SizedBox(height: 12),
          const _FieldLabel('Cine notează'),
          TextField(
            controller: _cineNoteazaCtrl,
            readOnly: true,
            enabled: false,
            style: const TextStyle(color: Color(0xFFEAF1FF)),
            decoration: _inputDecoration(''),
          ),
          if (_info.isNotEmpty) ...[
            const SizedBox(height: 12),
            _NoticeBox(text: _info),
          ],
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 12),
            _ErrorBox(text: _error),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: _busy ? null : _onSave,
              style: ElevatedButton.styleFrom(
                backgroundColor: accent.withOpacity(0.18),
                foregroundColor: const Color(0xFFEAF1FF),
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                side: BorderSide(color: accent.withOpacity(0.35)),
              ),
              child: _busy
                  ? const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                        SizedBox(width: 10),
                        Text('Se procesează…', style: TextStyle(fontWeight: FontWeight.w900)),
                      ],
                    )
                  : const Text('Salvează', style: TextStyle(fontWeight: FontWeight.w900)),
            ),
          ),
        ],
      ),
    );
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

