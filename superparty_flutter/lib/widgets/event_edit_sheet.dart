import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../models/event_model.dart';
import '../services/event_service.dart';

/// Bottom sheet for editing basic event fields
/// Editable fields: date, address, sarbatoritNume, sarbatoritVarsta, incasare
class EventEditSheet extends StatefulWidget {
  final EventModel event;

  const EventEditSheet({
    super.key,
    required this.event,
  });

  @override
  State<EventEditSheet> createState() => _EventEditSheetState();
}

class _EventEditSheetState extends State<EventEditSheet> {
  final _formKey = GlobalKey<FormState>();
  final EventService _eventService = EventService();

  late TextEditingController _dateController;
  late TextEditingController _addressController;
  late TextEditingController _numeController;
  late TextEditingController _varstaController;
  late TextEditingController _sumaController;

  String _incasareStatus = 'NEINCASAT';
  String? _incasareMetoda;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _dateController = TextEditingController(text: widget.event.date);
    _addressController = TextEditingController(text: widget.event.address);
    _numeController = TextEditingController(text: widget.event.sarbatoritNume);
    _varstaController = TextEditingController(
      text: widget.event.sarbatoritVarsta.toString(),
    );

    // Initialize incasare fields from IncasareModel
    final incasare = widget.event.incasare;
    _incasareStatus = incasare.status;
    _incasareMetoda = incasare.metoda;
    _sumaController = TextEditingController(
      text: incasare.suma?.toString() ?? '',
    );
  }

  @override
  void dispose() {
    _dateController.dispose();
    _addressController.dispose();
    _numeController.dispose();
    _varstaController.dispose();
    _sumaController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mediaQuery = MediaQuery.of(context);

    return Material(
      color: Colors.transparent,
      child: Container(
        padding: EdgeInsets.only(
          bottom: mediaQuery.viewInsets.bottom,
          left: 16,
          right: 16,
          top: 24,
        ),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Editează Eveniment',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Date field
              TextFormField(
                controller: _dateController,
                decoration: const InputDecoration(
                  labelText: 'Data (DD-MM-YYYY)',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.calendar_today),
                ),
                readOnly: true,
                onTap: () => _selectDate(context),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Data este obligatorie';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),

              // Address field
              TextFormField(
                controller: _addressController,
                decoration: const InputDecoration(
                  labelText: 'Adresă',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.location_on),
                ),
                maxLines: 2,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Adresa este obligatorie';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),

              // Sarbatorit nume
              TextFormField(
                controller: _numeController,
                decoration: const InputDecoration(
                  labelText: 'Nume Sărbătorit',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.person),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Numele este obligatoriu';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),

              // Sarbatorit varsta
              TextFormField(
                controller: _varstaController,
                decoration: const InputDecoration(
                  labelText: 'Vârstă Sărbătorit',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.cake),
                ),
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              ),
              const SizedBox(height: 16),

              // Incasare section
              Text(
                'Încasare',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),

              // Incasare status
              DropdownButtonFormField<String>(
                value: _incasareStatus,
                decoration: const InputDecoration(
                  labelText: 'Status Încasare',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'NEINCASAT', child: Text('Neîncasat')),
                  DropdownMenuItem(value: 'INCASAT', child: Text('Încasat')),
                  DropdownMenuItem(value: 'ANULAT', child: Text('Anulat')),
                ],
                onChanged: (value) {
                  setState(() {
                    _incasareStatus = value!;
                  });
                },
              ),
              const SizedBox(height: 12),

              // Incasare metoda (only if INCASAT)
              if (_incasareStatus == 'INCASAT') ...[
                DropdownButtonFormField<String>(
                  value: _incasareMetoda,
                  decoration: const InputDecoration(
                    labelText: 'Metodă Plată',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                    DropdownMenuItem(value: 'CARD', child: Text('Card')),
                    DropdownMenuItem(value: 'TRANSFER', child: Text('Transfer')),
                  ],
                  onChanged: (value) {
                    setState(() {
                      _incasareMetoda = value;
                    });
                  },
                ),
                const SizedBox(height: 12),

                // Suma
                TextFormField(
                  controller: _sumaController,
                  decoration: const InputDecoration(
                    labelText: 'Sumă (RON)',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.attach_money),
                  ),
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}')),
                  ],
                ),
                const SizedBox(height: 12),
              ],

              // Save button
              ElevatedButton(
                onPressed: _isLoading ? null : _saveChanges,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Salvează Modificările'),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
      ),
    );
  }

  Future<void> _selectDate(BuildContext context) async {
    final currentDate = DateTime.tryParse(_dateController.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: currentDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );

    if (picked != null) {
      setState(() {
        _dateController.text = DateFormat('dd-MM-yyyy').format(picked);
      });
    }
  }

  Future<void> _saveChanges() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Build incasare object
      final incasare = <String, dynamic>{
        'status': _incasareStatus,
      };

      if (_incasareStatus == 'INCASAT') {
        if (_incasareMetoda != null) {
          incasare['metoda'] = _incasareMetoda;
        }
        final sumaText = _sumaController.text.trim();
        if (sumaText.isNotEmpty) {
          incasare['suma'] = double.tryParse(sumaText) ?? 0.0;
        }
      }

      // Build update patch
      final patch = <String, dynamic>{
        'date': _dateController.text.trim(),
        'address': _addressController.text.trim(),
        'sarbatoritNume': _numeController.text.trim(),
        'incasare': incasare,
      };

      // Add varsta if provided
      final varstaText = _varstaController.text.trim();
      if (varstaText.isNotEmpty) {
        patch['sarbatoritVarsta'] = int.tryParse(varstaText) ?? 0;
      }

      await _eventService.updateEvent(widget.event.id, patch);

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Eveniment actualizat cu succes'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare la salvare: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }
}
