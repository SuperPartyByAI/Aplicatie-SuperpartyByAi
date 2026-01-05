import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../models/evidence_model.dart';
import '../../models/evidence_state_model.dart';
import '../../services/evidence_service.dart';

class DoveziScreen extends StatefulWidget {
  final String eventId;

  const DoveziScreen({super.key, required this.eventId});

  @override
  State<DoveziScreen> createState() => _DoveziScreenState();
}

class _DoveziScreenState extends State<DoveziScreen> {
  final EvidenceService _evidenceService = EvidenceService();
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _loadMockData();
  }

  void _loadMockData() {
    final states = MockEvenimente.evidenceStates[widget.eventId];
    if (states != null) {
      for (var cat in EvidenceCategory.values) {
        final state = states[cat];
        if (state != null) {
          _categoryStatus[cat] = state.status;
          _categoryLocked[cat] = state.locked;
        } else {
          _categoryStatus[cat] = EvidenceStatus.na;
          _categoryLocked[cat] = false;
        }
      }
    } else {
      for (var cat in EvidenceCategory.values) {
        _categoryStatus[cat] = EvidenceStatus.na;
        _categoryLocked[cat] = false;
      }
    }

    final mockEvidence = MockEvenimente.dovezi[widget.eventId] ?? [];
    for (var evidence in mockEvidence) {
      _mockThumbs.putIfAbsent(evidence.category, () => []);
      _mockThumbs[evidence.category]!.add(evidence.fileName);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
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
              child: _buildCategoriesList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAppBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 16),
      decoration: BoxDecoration(
        color: const Color(0xFF0B1220).withOpacity(0.72),
        border: const Border(
          bottom: BorderSide(color: Color(0x14FFFFFF)),
        ),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Color(0xFFEAF1FF)),
            onPressed: () => Navigator.pop(context),
          ),
          const SizedBox(width: 8),
          const Text(
            'Dovezi',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: Color(0xFFEAF1FF),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoriesList() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: EvidenceCategory.values.map((cat) => _buildCategoryBlock(cat)).toList(),
    );
  }

  Widget _buildCategoryBlock(EvidenceCategory category) {
    final status = _categoryStatus[category] ?? EvidenceStatus.na;
    final locked = _categoryLocked[category] ?? false;
    final thumbs = _mockThumbs[category] ?? [];

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0x0FFFFFFF),
        border: Border.all(color: const Color(0x1FFFFFFF)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  category.label,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFEAF1FF),
                  ),
                ),
              ),
              _buildStatusPill(status),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              ElevatedButton(
                onPressed: locked ? null : () => _addMockPhoto(category),
                style: ElevatedButton.styleFrom(
                  backgroundColor: locked ? const Color(0x08FFFFFF) : const Color(0x14FFFFFF),
                  foregroundColor: const Color(0xFFEAF1FF),
                  disabledBackgroundColor: const Color(0x08FFFFFF),
                  disabledForegroundColor: const Color(0x4DEAF1FF),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
                child: const Text('Incarca poze'),
              ),
              const SizedBox(width: 12),
              Text(
                '${thumbs.length} salvate',
                style: const TextStyle(
                  fontSize: 14,
                  color: Color(0xB3EAF1FF),
                ),
              ),
            ],
          ),
          if (thumbs.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: thumbs.map((thumb) => _buildThumb(category, thumb, locked)).toList(),
            ),
          ],
          if (!locked && thumbs.isNotEmpty) ...[
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => _reverifyCategory(category),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0x284ECDC4),
                foregroundColor: const Color(0xFFEAF1FF),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              child: const Text('Reverifica'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildStatusPill(EvidenceStatus status) {
    Color bgColor;
    Color borderColor;
    switch (status) {
      case EvidenceStatus.ok:
        bgColor = const Color(0x2810B981);
        borderColor = const Color(0x5010B981);
        break;
      case EvidenceStatus.verifying:
        bgColor = const Color(0x284ECDC4);
        borderColor = const Color(0x504ECDC4);
        break;
      case EvidenceStatus.needed:
        bgColor = const Color(0x28FFBE5C);
        borderColor = const Color(0x50FFBE5C);
        break;
      case EvidenceStatus.na:
        bgColor = const Color(0x14FFFFFF);
        borderColor = const Color(0x1FFFFFFF);
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status.label,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w900,
          color: Color(0xFFEAF1FF),
        ),
      ),
    );
  }

  Widget _buildThumb(EvidenceCategory category, String fileName, bool locked) {
    return Stack(
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: const Color(0x14FFFFFF),
            border: Border.all(color: const Color(0x1FFFFFFF)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.image, color: Color(0x4DEAF1FF), size: 32),
                const SizedBox(height: 4),
                Text(
                  fileName.split('_').first,
                  style: const TextStyle(
                    fontSize: 10,
                    color: Color(0x8CEAF1FF),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (!locked)
          Positioned(
            top: 4,
            right: 4,
            child: InkWell(
              onTap: () => _removeMockPhoto(category, fileName),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  color: Color(0xCCFF7878),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.close, color: Colors.white, size: 12),
              ),
            ),
          ),
      ],
    );
  }

  void _addMockPhoto(EvidenceCategory category) {
    setState(() {
      _mockThumbs.putIfAbsent(category, () => []);
      final count = _mockThumbs[category]!.length + 1;
      _mockThumbs[category]!.add('${category.value}_$count.jpg');
      
      if (_categoryStatus[category] == EvidenceStatus.na) {
        _categoryStatus[category] = EvidenceStatus.verifying;
      }
    });
  }

  void _removeMockPhoto(EvidenceCategory category, String fileName) {
    setState(() {
      _mockThumbs[category]?.remove(fileName);
      
      if (_mockThumbs[category]?.isEmpty ?? true) {
        _categoryStatus[category] = EvidenceStatus.na;
      }
    });
  }

  void _reverifyCategory(EvidenceCategory category) {
    setState(() {
      final thumbs = _mockThumbs[category] ?? [];
      if (thumbs.isEmpty) {
        _categoryStatus[category] = EvidenceStatus.na;
      } else if (thumbs.length >= 1) {
        _categoryStatus[category] = EvidenceStatus.ok;
        _categoryLocked[category] = true;
      } else {
        _categoryStatus[category] = EvidenceStatus.needed;
      }
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Categorie ${category.label}: ${_categoryStatus[category]?.label}'),
        backgroundColor: const Color(0xFF4ECDC4),
      ),
    );
  }
}
