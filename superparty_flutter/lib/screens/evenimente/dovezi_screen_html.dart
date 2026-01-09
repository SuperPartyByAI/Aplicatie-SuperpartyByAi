import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../../models/event_model.dart';

/// Dovezi Screen - 100% identic cu HTML
/// Referință: kyc-app/kyc-app/public/evenimente.html (#pageEvidence)
class DoveziScreenHtml extends StatefulWidget {
  final EventModel event;

  const DoveziScreenHtml({
    super.key,
    required this.event,
  });

  @override
  State<DoveziScreenHtml> createState() => _DoveziScreenHtmlState();
}

class _DoveziScreenHtmlState extends State<DoveziScreenHtml> {
  final ImagePicker _picker = ImagePicker();
  
  // 4 categorii exact ca în HTML
  final Map<String, List<String>> _photos = {
    'onTime': [],
    'luggage': [],
    'accessories': [],
    'laundry': [],
  };

  final Map<String, bool> _locked = {
    'onTime': false,
    'luggage': false,
    'accessories': false,
    'laundry': false,
  };

  @override
  void initState() {
    super.initState();
    _loadEvidence();
  }

  Future<void> _loadEvidence() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      for (final cat in _photos.keys) {
        final key = 'evidence_${widget.event.id}_$cat';
        final data = prefs.getString(key);
        if (data != null) {
          _photos[cat] = List<String>.from(jsonDecode(data));
        }
        
        final lockKey = 'lock_${widget.event.id}_$cat';
        _locked[cat] = prefs.getBool(lockKey) ?? false;
      }
    });
  }

  Future<void> _saveEvidence(String category) async {
    final prefs = await SharedPreferences.getInstance();
    final key = 'evidence_${widget.event.id}_$category';
    await prefs.setString(key, jsonEncode(_photos[category]));
  }

  Future<void> _saveLockState(String category) async {
    final prefs = await SharedPreferences.getInstance();
    final lockKey = 'lock_${widget.event.id}_$category';
    await prefs.setBool(lockKey, _locked[category]!);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFF111C35),
              Color(0xFF0B1220),
            ],
          ),
        ),
        child: Column(
          children: [
            _buildAppBar(),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _buildMeta(),
                    const SizedBox(height: 16),
                    _buildEvidenceCard(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAppBar() {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF0B1220).withOpacity(0.72),
            border: const Border(
              bottom: BorderSide(
                color: Color(0x14FFFFFF),
                width: 1,
              ),
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Back button
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      backgroundColor: const Color(0x0FFFFFFF),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: const BorderSide(color: Color(0x24FFFFFF)),
                      ),
                    ),
                    child: Text(
                      'Inapoi',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: const Color(0xFFEAF1FF).withOpacity(0.9),
                      ),
                    ),
                  ),
                  // Title
                  const Text(
                    'Dovezi',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.2,
                      color: Color(0xFFEAF1FF),
                    ),
                  ),
                  // Spacer (same width as back button)
                  const SizedBox(width: 90),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMeta() {
    return Text(
      '${_formatDate(widget.event.date)} • ${widget.event.address}',
      style: TextStyle(
        fontSize: 13,
        color: const Color(0xFFEAF1FF).withOpacity(0.7),
      ),
      textAlign: TextAlign.center,
    );
  }

  Widget _buildEvidenceCard() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0x0DFFFFFF), // rgba(255,255,255,0.05)
        border: Border.all(
          color: const Color(0x1AFFFFFFF), // rgba(255,255,255,0.1)
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title
          const Text(
            'Dovezi (incarci cate poze vrei)',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Color(0xFFEAF1FF),
            ),
          ),
          const SizedBox(height: 8),
          // Help text
          Text(
            'Incarca poze pe categorii. Dupa fiecare incarcare, sistemul le verifica si iti arata status. Poti adauga poze in mai multe runde pana cand apar ca OK. Dupa ce o categorie devine OK, pozele din acea categorie se blocheaza si nu mai pot fi sterse.',
            style: TextStyle(
              fontSize: 12,
              color: const Color(0xFFEAF1FF).withOpacity(0.7),
              height: 1.4,
            ),
          ),
          const SizedBox(height: 16),
          // 4 categories
          _buildProofBlock('onTime', 'Nu am intarziat'),
          const SizedBox(height: 10),
          _buildProofBlock('luggage', 'Am pus bagajul la loc'),
          const SizedBox(height: 10),
          _buildProofBlock('accessories', 'Am pus accesoriile la loc'),
          const SizedBox(height: 10),
          _buildProofBlock('laundry', 'Am pus hainele la spalat'),
          const SizedBox(height: 16),
          // Actions
          _buildActions(),
        ],
      ),
    );
  }

  Widget _buildProofBlock(String category, String label) {
    final count = _photos[category]!.length;
    final isLocked = _locked[category]!;
    final status = count > 0 ? (isLocked ? 'OK' : 'Necompletat') : 'N/A';

    return Container(
      decoration: BoxDecoration(
        color: const Color(0x29000000), // rgba(0,0,0,0.16)
        border: Border.all(
          color: const Color(0x1AFFFFFFF),
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFFEAF1FF),
                ),
              ),
              _buildStatusPill(status),
            ],
          ),
          const SizedBox(height: 8),
          // Upload button + count
          Row(
            children: [
              TextButton(
                onPressed: isLocked ? null : () => _uploadPhotos(category),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  backgroundColor: isLocked 
                      ? const Color(0x0AFFFFFF)
                      : const Color(0x0FFFFFFF),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: const BorderSide(color: Color(0x24FFFFFF)),
                  ),
                ),
                child: Text(
                  'Incarca poze',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: isLocked
                        ? const Color(0xFFEAF1FF).withOpacity(0.4)
                        : const Color(0xFFEAF1FF).withOpacity(0.9),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '$count salvate',
                style: TextStyle(
                  fontSize: 12,
                  color: const Color(0xFFEAF1FF).withOpacity(0.7),
                ),
              ),
            ],
          ),
          // Thumbnails
          if (count > 0) ...[
            const SizedBox(height: 8),
            _buildThumbnails(category),
          ],
        ],
      ),
    );
  }

  Widget _buildStatusPill(String status) {
    Color bgColor;
    Color textColor;

    switch (status) {
      case 'OK':
        bgColor = const Color(0x244ECDC4); // rgba(78,205,196,0.14)
        textColor = const Color(0xFF4ECDC4);
        break;
      case 'Necompletat':
        bgColor = const Color(0x1AFFBE5C); // rgba(255,190,92,0.1)
        textColor = const Color(0xFFFFBE5C);
        break;
      default: // N/A
        bgColor = const Color(0x14FFFFFF);
        textColor = const Color(0xB3EAF1FF);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
    );
  }

  Widget _buildThumbnails(String category) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _photos[category]!.map((photo) {
        return Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: const Color(0x14FFFFFF),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Center(
            child: Icon(
              Icons.image,
              color: Color(0xB3EAF1FF),
              size: 32,
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton(
          onPressed: () {
            // Reverifica - în HTML nu face nimic special
          },
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            backgroundColor: const Color(0x0FFFFFFF),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: const BorderSide(color: Color(0x24FFFFFF)),
            ),
          ),
          child: Text(
            'Reverifica',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Se salveaza local (demo). In aplicatie reala ar merge in backend.',
          style: TextStyle(
            fontSize: 11,
            color: const Color(0xFFEAF1FF).withOpacity(0.6),
          ),
        ),
      ],
    );
  }

  Future<void> _uploadPhotos(String category) async {
    final images = await _picker.pickMultiImage();
    if (images.isNotEmpty) {
      setState(() {
        for (final image in images) {
          _photos[category]!.add(image.path);
        }
      });
      await _saveEvidence(category);
    }
  }

  String _formatDate(String dateStr) {
    try {
      final parts = dateStr.split('-');
      if (parts.length != 3) return dateStr;
      final day = int.parse(parts[0]);
      final month = int.parse(parts[1]);
      final year = int.parse(parts[2]);
      final date = DateTime(year, month, day);
      return DateFormat('dd MMM yyyy', 'ro').format(date);
    } catch (e) {
      return dateStr;
    }
  }
}
