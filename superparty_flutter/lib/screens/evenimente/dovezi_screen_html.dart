import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';
import '../../models/event_model.dart';
import 'photo_image.dart';
import '../../services/dovezi_service.dart';

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
  final DoveziService _service = DoveziService();

  // local UI state (uploading spinners), evidence itself is streamed from Firestore
  final Map<String, bool> _uploading = {};

  static const List<String> _categories = <String>[
    'onTime',
    'luggage',
    'accessories',
    'laundry',
  ];

  static const Map<String, String> _categoryLabels = <String, String>{
    'onTime': 'Nu am intarziat',
    'luggage': 'Am pus bagajul la loc',
    'accessories': 'Am pus accesoriile la loc',
    'laundry': 'Am pus hainele la spalat',
  };

  @override
  void initState() {
    super.initState();
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
              child: StreamBuilder<Map<String, DoveziCategory>>(
                stream: _service.streamEvidence(widget.event.id),
                builder: (context, snapshot) {
                  final evidence = snapshot.data ?? const <String, DoveziCategory>{};

                  return SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        _buildMeta(),
                        const SizedBox(height: 16),
                        _buildEvidenceCard(evidence),
                      ],
                    ),
                  );
                },
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

  Widget _buildEvidenceCard(Map<String, DoveziCategory> evidence) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0x0DFFFFFF), // rgba(255,255,255,0.05)
        border: Border.all(
          color: const Color(0x1AFFFFFF), // rgba(255,255,255,0.1)
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
          _buildProofBlock('onTime', evidence),
          const SizedBox(height: 10),
          _buildProofBlock('luggage', evidence),
          const SizedBox(height: 10),
          _buildProofBlock('accessories', evidence),
          const SizedBox(height: 10),
          _buildProofBlock('laundry', evidence),
          const SizedBox(height: 16),
          // Actions
          _buildActions(),
        ],
      ),
    );
  }

  Widget _buildProofBlock(String category, Map<String, DoveziCategory> evidence) {
    final label = _categoryLabels[category] ?? category;
    final model = evidence[category] ?? DoveziCategory.empty(category);
    final count = model.photos.length;
    final verdict = model.verdict;
    final isLocked = model.locked;
    final uploading = _uploading[category] == true;
    final status =
        verdict == 'ok' ? 'OK' : (count > 0 ? 'Necompletat' : 'N/A');

    return Container(
      decoration: BoxDecoration(
        color: const Color(0x29000000), // rgba(0,0,0,0.16)
        border: Border.all(
          color: const Color(0x1AFFFFFF),
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
                onPressed:
                    (isLocked || uploading) ? null : () => _uploadPhotos(category),
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
                  uploading ? 'Incarc...' : 'Incarca poze',
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
            _buildThumbnails(category, model),
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

  Widget _buildThumbnails(String category, DoveziCategory model) {
    final isLocked = model.locked;
    
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: model.photos.map((photo) {
        final photoUrl = photo.url;
        
        return GestureDetector(
          onTap: () => _previewPhoto(photoUrl),
          child: Stack(
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: const Color(0x14FFFFFF),
                  borderRadius: BorderRadius.circular(8),
                ),
                clipBehavior: Clip.antiAlias,
                child: buildDoveziImage(photoUrl, fit: BoxFit.cover),
              ),
              // Delete button (doar dacă nu e locked)
              if (!isLocked)
                Positioned(
                  top: 2,
                  right: 2,
                  child: GestureDetector(
                    onTap: () => _deletePhoto(category, photo),
                    child: Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        color: const Color(0xEBFF7878), // rgba(255,120,120,0.92)
                        shape: BoxShape.circle,
                      ),
                      child: const Center(
                        child: Text(
                          '×',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                            height: 1,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      }).toList(growable: false),
    );
  }

  Future<void> _deletePhoto(String category, DoveziPhoto photo) async {
    try {
      setState(() {
        _uploading[category] = true;
      });
      await _service.deletePhoto(widget.event.id, category, photo);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Eroare ștergere: $e'),
          backgroundColor: const Color(0xFFFF7878),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _uploading.remove(category);
        });
      }
    }
  }

  void _previewPhoto(String photoPath) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        child: GestureDetector(
          onTap: () => Navigator.of(context).pop(),
          child: buildDoveziImage(photoPath, fit: BoxFit.contain),
        ),
      ),
    );
  }

  Widget _buildActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton(
          onPressed: _reverifyAll,
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
          'Se salvează în Firebase (Storage + Firestore).',
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
    if (!mounted) return;
    if (images.isNotEmpty) {
      setState(() {
        _uploading[category] = true;
      });
      try {
        await _service.uploadPhotos(widget.event.id, category, images);
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare upload: $e'),
            backgroundColor: const Color(0xFFFF7878),
          ),
        );
      } finally {
        if (mounted) {
          setState(() {
            _uploading.remove(category);
          });
        }
      }
    }
  }

  Future<void> _reverifyAll() async {
    try {
      setState(() {
        for (final cat in _categories) {
          _uploading[cat] = true;
        }
      });
      await _service.reverifyAll(widget.event.id, _categories);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Eroare reverificare: $e'),
          backgroundColor: const Color(0xFFFF7878),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          for (final cat in _categories) {
            _uploading.remove(cat);
          }
        });
      }
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
