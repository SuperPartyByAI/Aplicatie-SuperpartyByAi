import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

class EvenimenteScreen extends StatefulWidget {
  const EvenimenteScreen({super.key});

  @override
  State<EvenimenteScreen> createState() => _EvenimenteScreenState();
}

class _EvenimenteScreenState extends State<EvenimenteScreen> {
  String _searchQuery = '';
  String _statusFilter = 'toate';
  String _sortBy = 'data-desc';

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
      ),
      body: Column(
        children: [
          _buildFilters(),
          Expanded(
            child: _buildEventsList(),
          ),
        ],
      ),
    );
  }

  Widget _buildFilters() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(
            onChanged: (value) => setState(() => _searchQuery = value),
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
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildDropdown(
                  value: _statusFilter,
                  items: const [
                    {'value': 'toate', 'label': 'Toate statusurile'},
                    {'value': 'activ', 'label': 'Active'},
                    {'value': 'viitor', 'label': 'Viitoare'},
                    {'value': 'trecut', 'label': 'Trecute'},
                  ],
                  onChanged: (value) => setState(() => _statusFilter = value!),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildDropdown(
                  value: _sortBy,
                  items: const [
                    {'value': 'data-desc', 'label': 'Data (Desc)'},
                    {'value': 'data-asc', 'label': 'Data (Asc)'},
                    {'value': 'nume', 'label': 'Nume'},
                  ],
                  onChanged: (value) => setState(() => _sortBy = value!),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDropdown({
    required String value,
    required List<Map<String, String>> items,
    required ValueChanged<String?> onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1A2332),
        border: Border.all(color: const Color(0xFF2D3748)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isExpanded: true,
          dropdownColor: const Color(0xFF1A2332),
          style: const TextStyle(color: Color(0xFFE2E8F0), fontSize: 14),
          icon: const Icon(Icons.arrow_drop_down, color: Color(0xFF94A3B8)),
          items: items.map((item) {
            return DropdownMenuItem<String>(
              value: item['value'],
              child: Text(item['label']!),
            );
          }).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }

  Widget _buildEventsList() {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('evenimente')
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
            child: Text(
              'Eroare: ${snapshot.error}',
              style: const TextStyle(color: Color(0xFF94A3B8)),
            ),
          );
        }

        if (!snapshot.hasData) {
          return const Center(
            child: CircularProgressIndicator(
              color: Color(0xFFDC2626),
            ),
          );
        }

        List<Map<String, dynamic>> events = snapshot.data!.docs.map((doc) {
          final data = doc.data() as Map<String, dynamic>;
          return {
            'id': doc.id,
            ...data,
          };
        }).toList();

        // Apply filters
        events = _filterEvents(events);

        // Apply sorting
        events = _sortEvents(events);

        if (events.isEmpty) {
          return const Center(
            child: Text(
              'Nu s-au găsit evenimente',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 16),
            ),
          );
        }

        return GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: MediaQuery.of(context).size.width > 768 ? 2 : 1,
            childAspectRatio: MediaQuery.of(context).size.width > 768 ? 1.5 : 1.2,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
          ),
          itemCount: events.length,
          itemBuilder: (context, index) => _buildEventCard(events[index]),
        );
      },
    );
  }

  List<Map<String, dynamic>> _filterEvents(List<Map<String, dynamic>> events) {
    return events.where((event) {
      final matchesSearch = _searchQuery.isEmpty ||
          (event['nume']?.toString().toLowerCase().contains(_searchQuery.toLowerCase()) ?? false) ||
          (event['locatie']?.toString().toLowerCase().contains(_searchQuery.toLowerCase()) ?? false);

      final matchesStatus = _statusFilter == 'toate' ||
          (event['status']?.toString() == _statusFilter);

      return matchesSearch && matchesStatus;
    }).toList();
  }

  List<Map<String, dynamic>> _sortEvents(List<Map<String, dynamic>> events) {
    events.sort((a, b) {
      if (_sortBy == 'data-desc') {
        final dateA = _parseDate(a['data']);
        final dateB = _parseDate(b['data']);
        return dateB.compareTo(dateA);
      } else if (_sortBy == 'data-asc') {
        final dateA = _parseDate(a['data']);
        final dateB = _parseDate(b['data']);
        return dateA.compareTo(dateB);
      } else if (_sortBy == 'nume') {
        return (a['nume']?.toString() ?? '').compareTo(b['nume']?.toString() ?? '');
      }
      return 0;
    });
    return events;
  }

  DateTime _parseDate(dynamic date) {
    if (date == null) return DateTime.now();
    if (date is Timestamp) return date.toDate();
    if (date is String) return DateTime.tryParse(date) ?? DateTime.now();
    return DateTime.now();
  }

  Widget _buildEventCard(Map<String, dynamic> event) {
    final status = event['status']?.toString() ?? 'viitor';
    final date = _parseDate(event['data']);
    
    // Format date without locale to avoid initialization issues
    String formattedDate;
    try {
      formattedDate = DateFormat('dd MMMM yyyy, HH:mm').format(date);
    } catch (e) {
      // Fallback to simple format if DateFormat fails
      formattedDate = '${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute.toString().padLeft(2, '0')}';
    }

    return GestureDetector(
      onTap: () => _viewEvent(event),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1A2332),
          border: Border.all(color: const Color(0xFF2D3748)),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => _viewEvent(event),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          event['nume']?.toString() ?? 'Eveniment',
                          style: const TextStyle(
                            color: Color(0xFFE2E8F0),
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      _buildStatusBadge(status),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _buildInfoRow(Icons.calendar_today, formattedDate),
                  const SizedBox(height: 8),
                  _buildInfoRow(Icons.location_on, event['locatie']?.toString() ?? 'Locație necunoscută'),
                  const SizedBox(height: 8),
                  _buildInfoRow(Icons.people, '${event['participanti'] ?? 0} participanți'),
                  const Spacer(),
                  const Divider(color: Color(0xFF2D3748), height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () => _editEvent(event),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFDC2626),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: const Text(
                            'Editează',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => _viewDetails(event),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFFE2E8F0),
                            side: const BorderSide(color: Color(0xFF2D3748)),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: const Text(
                            'Detalii',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    String label;

    switch (status) {
      case 'activ':
        color = const Color(0xFF10B981);
        label = 'ACTIV';
        break;
      case 'viitor':
        color = const Color(0xFF3B82F6);
        label = 'VIITOR';
        break;
      case 'trecut':
        color = const Color(0xFF6B7280);
        label = 'TRECUT';
        break;
      default:
        color = const Color(0xFF6B7280);
        label = 'NECUNOSCUT';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(9999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 16, color: const Color(0xFF94A3B8)),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              color: Color(0xFF94A3B8),
              fontSize: 14,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  void _viewEvent(Map<String, dynamic> event) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A2332),
        title: Text(
          event['nume']?.toString() ?? 'Eveniment',
          style: const TextStyle(color: Color(0xFFE2E8F0)),
        ),
        content: Text(
          'Vizualizare eveniment #${event['id']}',
          style: const TextStyle(color: Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Închide', style: TextStyle(color: Color(0xFFDC2626))),
          ),
        ],
      ),
    );
  }

  void _editEvent(Map<String, dynamic> event) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A2332),
        title: const Text(
          'Editare eveniment',
          style: TextStyle(color: Color(0xFFE2E8F0)),
        ),
        content: Text(
          'Editare eveniment #${event['id']}',
          style: const TextStyle(color: Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Închide', style: TextStyle(color: Color(0xFFDC2626))),
          ),
        ],
      ),
    );
  }

  void _viewDetails(Map<String, dynamic> event) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A2332),
        title: const Text(
          'Detalii eveniment',
          style: TextStyle(color: Color(0xFFE2E8F0)),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Nume: ${event['nume']}',
              style: const TextStyle(color: Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 8),
            Text(
              'Locație: ${event['locatie']}',
              style: const TextStyle(color: Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 8),
            Text(
              'Participanți: ${event['participanti']}',
              style: const TextStyle(color: Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 8),
            Text(
              'Status: ${event['status']}',
              style: const TextStyle(color: Color(0xFF94A3B8)),
            ),
            if (event['descriere'] != null) ...[
              const SizedBox(height: 8),
              Text(
                'Descriere: ${event['descriere']}',
                style: const TextStyle(color: Color(0xFF94A3B8)),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Închide', style: TextStyle(color: Color(0xFFDC2626))),
          ),
        ],
      ),
    );
  }
}
