import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/event_model.dart';

/// Code Info Modal - REAL implementation (non-demo)
/// Shows all events where code is used (assigned or pending)
/// Allows ACCEPT/REFUZ for pending requests
class CodeInfoModal extends StatefulWidget {
  final String code;
  final List<EventModel> events;

  const CodeInfoModal({
    super.key,
    required this.code,
    required this.events,
  });

  @override
  State<CodeInfoModal> createState() => _CodeInfoModalState();
}

class _CodeInfoModalState extends State<CodeInfoModal> {
  List<Map<String, dynamic>> _getCodeUsage() {
    final usage = <Map<String, dynamic>>[];
    final normalizedCode = widget.code.trim().toUpperCase();

    for (final event in widget.events) {
      for (final role in event.roles) {
        final assigned = (role.assignedCode ?? '').trim().toUpperCase();
        final pending = (role.pendingCode ?? '').trim().toUpperCase();

        if (assigned == normalizedCode) {
          usage.add({
            'eventId': event.id,
            'date': event.date,
            'name': event.sarbatoritNume,
            'address': event.address,
            'slot': role.slot,
            'label': role.label,
            'type': 'assigned',
          });
        } else if (pending == normalizedCode) {
          usage.add({
            'eventId': event.id,
            'date': event.date,
            'name': event.sarbatoritNume,
            'address': event.address,
            'slot': role.slot,
            'label': role.label,
            'type': 'pending',
          });
        }
      }
    }

    return usage;
  }

  Future<void> _handleAccept(String eventId, String slot) async {
    try {
      final db = FirebaseFirestore.instance;
      await db.runTransaction((transaction) async {
        final eventRef = db.collection('evenimente').doc(eventId);
        final eventDoc = await transaction.get(eventRef);

        if (!eventDoc.exists) {
          throw Exception('Event not found');
        }

        final data = eventDoc.data();
        if (data == null || data is! Map<String, dynamic>) {
          throw Exception('Invalid event data');
        }
        final roles = List<Map<String, dynamic>>.from(data['roles'] ?? []);

        bool found = false;
        for (var i = 0; i < roles.length; i++) {
          if (roles[i]['slot'] == slot) {
            // SAFETY: Verify pendingCode matches widget.code before accepting
            final pendingCode =
                (roles[i]['pendingCode'] ?? '').toString().trim().toUpperCase();
            final expectedCode = widget.code.trim().toUpperCase();

            if (pendingCode != expectedCode) {
              throw Exception(
                  'Pending code mismatch: expected $expectedCode, got $pendingCode');
            }

            roles[i]['assignedCode'] = widget.code;
            roles[i]['pendingCode'] = null;
            found = true;
            break;
          }
        }

        if (!found) {
          throw Exception('Role slot not found');
        }

        transaction.update(eventRef, {
          'roles': roles,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cerere acceptată')),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Eroare: $e')),
        );
      }
    }
  }

  Future<void> _handleRefuz(String eventId, String slot) async {
    try {
      final db = FirebaseFirestore.instance;
      await db.runTransaction((transaction) async {
        final eventRef = db.collection('evenimente').doc(eventId);
        final eventDoc = await transaction.get(eventRef);

        if (!eventDoc.exists) {
          throw Exception('Event not found');
        }

        final data = eventDoc.data();
        if (data == null || data is! Map<String, dynamic>) {
          throw Exception('Invalid event data');
        }
        final roles = List<Map<String, dynamic>>.from(data['roles'] ?? []);

        for (var i = 0; i < roles.length; i++) {
          if (roles[i]['slot'] == slot) {
            roles[i]['pendingCode'] = null;
            break;
          }
        }

        transaction.update(eventRef, {
          'roles': roles,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cerere refuzată')),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Eroare: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Container(
        color: const Color(0x8C000000), // rgba(0,0,0,0.55)
        padding: const EdgeInsets.all(16),
        child: Center(
          child: GestureDetector(
            onTap: () {}, // Prevent closing when tapping sheet
            child: _buildSheet(context),
          ),
        ),
      ),
    );
  }

  Widget _buildSheet(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(maxWidth: 520),
          decoration: BoxDecoration(
            color: const Color(0xEB0B1220), // rgba(11,18,32,0.92)
            border: Border.all(
              color: const Color(0x1AFFFFFF), // rgba(255,255,255,0.1)
            ),
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: const Color(0x8C000000), // rgba(0,0,0,0.55)
                blurRadius: 80,
                offset: const Offset(0, 24),
              ),
            ],
          ),
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildHeader(context),
              const SizedBox(height: 12),
              _buildBody(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            'Cod: ${widget.code}',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Gata button
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            backgroundColor: const Color(0x14FFFFFF),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          child: Text(
            'Gata',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBody() {
    final usage = _getCodeUsage();

    if (usage.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0x0FFFFFFF),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(
            'Codul ${widget.code} nu este folosit în niciun eveniment.',
            style: TextStyle(
              fontSize: 13,
              color: const Color(0xFFEAF1FF).withOpacity(0.7),
            ),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return Container(
      constraints: const BoxConstraints(maxHeight: 400),
      child: ListView.separated(
        shrinkWrap: true,
        itemCount: usage.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final item = usage[index];
          return _buildUsageItem(item);
        },
      ),
    );
  }

  Widget _buildUsageItem(Map<String, dynamic> item) {
    final isPending = item['type'] == 'pending';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isPending
            ? const Color(0x14FFBE5C) // rgba(255,190,92,0.08) - pending
            : const Color(0x0FFFFFFF), // rgba(255,255,255,0.06) - assigned
        border: Border.all(
          color: isPending
              ? const Color(0x47FFBE5C) // rgba(255,190,92,0.28)
              : const Color(0x1FFFFFFF), // rgba(255,255,255,0.12)
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Event info
          Text(
            '${item['date']} • ${item['name']}',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFFEAF1FF),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            item['address'] ?? '',
            style: TextStyle(
              fontSize: 12,
              color: const Color(0xFFEAF1FF).withOpacity(0.7),
            ),
          ),
          const SizedBox(height: 8),
          // Role info
          Text(
            'Slot ${item['slot']}: ${item['label']}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: const Color(0xFFEAF1FF).withOpacity(0.85),
            ),
          ),
          const SizedBox(height: 8),
          // Status + Actions
          if (isPending)
            Row(
              children: [
                Text(
                  'CERERE PENDING',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    color: const Color(0xFFFFBE5C).withOpacity(0.9),
                  ),
                ),
                const Spacer(),
                // REFUZ button
                TextButton(
                  onPressed: () => _handleRefuz(item['eventId'], item['slot']),
                  style: TextButton.styleFrom(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    backgroundColor: const Color(0x14FF7878),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                      side: const BorderSide(color: Color(0x42FF7878)),
                    ),
                  ),
                  child: const Text(
                    'REFUZ',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFFFF7878),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // ACCEPT button
                TextButton(
                  onPressed: () => _handleAccept(item['eventId'], item['slot']),
                  style: TextButton.styleFrom(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    backgroundColor: const Color(0x144ECDC4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                      side: const BorderSide(color: Color(0x474ECDC4)),
                    ),
                  ),
                  child: const Text(
                    'ACCEPT',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF4ECDC4),
                    ),
                  ),
                ),
              ],
            )
          else
            Text(
              'ALOCAT',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                color: const Color(0xFF4ECDC4).withOpacity(0.9),
              ),
            ),
        ],
      ),
    );
  }
}
