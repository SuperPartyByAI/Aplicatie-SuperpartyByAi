import 'package:flutter/material.dart';
import '../utils/code_validator.dart';

/// Sheet pentru alocare rol
class AssignRoleSheet extends StatefulWidget {
  final String eventId;
  final String slot;
  final String roleLabel;
  final String? currentAssigned;
  final String? currentPending;
  final Function(String code) onAssign;
  final Function()? onUnassign;
  final Function()? onAcceptPending;
  final Function()? onRejectPending;

  const AssignRoleSheet({
    super.key,
    required this.eventId,
    required this.slot,
    required this.roleLabel,
    this.currentAssigned,
    this.currentPending,
    required this.onAssign,
    this.onUnassign,
    this.onAcceptPending,
    this.onRejectPending,
  });

  @override
  State<AssignRoleSheet> createState() => _AssignRoleSheetState();
}

class _AssignRoleSheetState extends State<AssignRoleSheet> {
  final _codeController = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 24,
          bottom: MediaQuery.of(context).viewInsets.bottom + 24,
        ),
        decoration: const BoxDecoration(
          color: Color(0xFF1A2332),
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Alocare ${widget.roleLabel} (${widget.slot})',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFFEAF1FF),
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: Color(0xFFEAF1FF)),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 24),
          
          // Current status
          if (widget.currentAssigned != null) ...[
            _buildStatusCard(
              'Alocat curent',
              widget.currentAssigned!,
              const Color(0x2810B981),
              const Color(0x5010B981),
            ),
            const SizedBox(height: 12),
            if (widget.onUnassign != null)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _isLoading ? null : () async {
                    if (!mounted) return;
                    final navigator = Navigator.of(context);
                    setState(() => _isLoading = true);
                    await widget.onUnassign!();
                    if (!mounted) return;
                    setState(() => _isLoading = false);
                    if (!mounted) return;
                    navigator.pop();
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFFF7878),
                    side: const BorderSide(color: Color(0xFFFF7878)),
                  ),
                  child: const Text('Dealocă'),
                ),
              ),
            const SizedBox(height: 24),
          ],
          
          if (widget.currentPending != null) ...[
            _buildStatusCard(
              'Cerere pending',
              widget.currentPending!,
              const Color(0x28FFBE5C),
              const Color(0x50FFBE5C),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                if (widget.onAcceptPending != null)
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : () async {
                        if (!mounted) return;
                        final navigator = Navigator.of(context);
                        setState(() => _isLoading = true);
                        await widget.onAcceptPending!();
                        if (!mounted) return;
                        setState(() => _isLoading = false);
                        if (!mounted) return;
                        navigator.pop();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF10B981),
                      ),
                      child: const Text('Acceptă'),
                    ),
                  ),
                if (widget.onAcceptPending != null && widget.onRejectPending != null)
                  const SizedBox(width: 12),
                if (widget.onRejectPending != null)
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _isLoading ? null : () async {
                        if (!mounted) return;
                        final navigator = Navigator.of(context);
                        setState(() => _isLoading = true);
                        await widget.onRejectPending!();
                        if (!mounted) return;
                        setState(() => _isLoading = false);
                        if (!mounted) return;
                        navigator.pop();
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFFF7878),
                        side: const BorderSide(color: Color(0xFFFF7878)),
                      ),
                      child: const Text('Respinge'),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 24),
          ],
          
          // Assign new
          const Text(
            'Alocă cod nou',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFFEAF1FF),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _codeController,
            autofocus: widget.currentAssigned == null && widget.currentPending == null,
            style: const TextStyle(color: Color(0xFFEAF1FF)),
            decoration: InputDecoration(
              hintText: 'Ex: A1, B2, ATRAINER',
              hintStyle: const TextStyle(color: Color(0x8CEAF1FF)),
              filled: true,
              fillColor: const Color(0x14FFFFFF),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0x1FFFFFFF)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0x1FFFFFFF)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0xFF4ECDC4)),
              ),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _assignCode,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4ECDC4),
                foregroundColor: const Color(0xFF0B1220),
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Color(0xFF0B1220),
                      ),
                    )
                  : const Text('Alocă'),
            ),
          ),
        ],
      ),
      ),
    );
  }

  Widget _buildStatusCard(String label, String code, Color bgColor, Color borderColor) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),

        border: Border.all(color: borderColor),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xB3EAF1FF),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  code,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFFEAF1FF),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _assignCode() async {
    final code = _codeController.text.trim();
    
    if (code.isEmpty) {
      _showError('Introdu un cod');
      return;
    }
    
    if (!CodeValidator.isValidStaffCode(code)) {
      _showError('Cod invalid. Format: A1-A50, ATRAINER, etc.');
      return;
    }
    
    setState(() => _isLoading = true);
    try {
      await widget.onAssign(CodeValidator.normalize(code));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      _showError(e.toString());
      setState(() => _isLoading = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: const Color(0xFFFF7878),
      ),
    );
  }
}
