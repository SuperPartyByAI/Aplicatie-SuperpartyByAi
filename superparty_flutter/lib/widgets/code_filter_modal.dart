import 'package:flutter/material.dart';

/// Modal "Ce cod am" cu opțiuni
class CodeFilterModal extends StatefulWidget {
  final String? currentCode;
  final Function(String? code, CodeFilterOption option) onApply;

  const CodeFilterModal({
    super.key,
    this.currentCode,
    required this.onApply,
  });

  @override
  State<CodeFilterModal> createState() => _CodeFilterModalState();
}

class _CodeFilterModalState extends State<CodeFilterModal> {
  CodeFilterOption _selectedOption = CodeFilterOption.writeCode;
  final _codeController = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.currentCode != null) {
      _codeController.text = widget.currentCode!;
    }
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: const Color(0xFF1A2332),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        padding: const EdgeInsets.all(24),
        constraints: const BoxConstraints(maxWidth: 400),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Filtru "Ce cod am"',
                    style: TextStyle(
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
            _buildOption(
              CodeFilterOption.writeCode,
              'Scriu cod',
              'Introdu codul tău (ex: A1, B2, ATRAINER)',
            ),
            if (_selectedOption == CodeFilterOption.writeCode) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _codeController,
                autofocus: true,
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
            ],
            const SizedBox(height: 16),
            _buildOption(
              CodeFilterOption.unresolved,
              'Nerezolvate',
              'Evenimente cu cereri pending pentru codul meu',
            ),
            const SizedBox(height: 16),
            _buildOption(
              CodeFilterOption.resolved,
              'Rezolvate',
              'Evenimente unde sunt deja alocat',
            ),
            const SizedBox(height: 16),
            _buildOption(
              CodeFilterOption.all,
              'Toate',
              'Toate evenimentele cu codul meu (alocat sau pending)',
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text(
                    'Anulează',
                    style: TextStyle(color: Color(0xB3EAF1FF)),
                  ),
                ),
                const SizedBox(width: 12),
                ElevatedButton(
                  onPressed: _applyFilter,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF4ECDC4),
                    foregroundColor: const Color(0xFF0B1220),
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  ),
                  child: const Text('Aplică'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOption(CodeFilterOption option, String title, String subtitle) {
    final isSelected = _selectedOption == option;
    return GestureDetector(
      onTap: () => setState(() => _selectedOption = option),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0x284ECDC4) : const Color(0x0AFFFFFF),
          border: Border.all(
            color: isSelected ? const Color(0x504ECDC4) : const Color(0x1FFFFFFF),
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(
              isSelected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              color: isSelected ? const Color(0xFF4ECDC4) : const Color(0x8CEAF1FF),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isSelected ? const Color(0xFFEAF1FF) : const Color(0xDBEAF1FF),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xB3EAF1FF),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _applyFilter() {
    String? code;
    if (_selectedOption == CodeFilterOption.writeCode) {
      code = _codeController.text.trim();
      if (code.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Introdu un cod valid'),
            backgroundColor: Color(0xFFFF7878),
          ),
        );
        return;
      }
    }
    
    widget.onApply(code, _selectedOption);
    Navigator.pop(context);
  }
}

enum CodeFilterOption {
  writeCode,
  unresolved,
  resolved,
  all,
}
