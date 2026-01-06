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
    return StreamBuilder<Map<EvidenceCategory, EvidenceStateModel>>(
      stream: _evidenceService.getCategoryStatesStream(widget.eventId),
      builder: (context, statesSnapshot) {
        if (statesSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF4ECDC4)),
          );
        }

        final states = statesSnapshot.data ?? {};

        return StreamBuilder<List<EvidenceModel>>(
          stream: _evidenceService.getEvidenceStream(eventId: widget.eventId),
          builder: (context, evidenceSnapshot) {
            if (evidenceSnapshot.connectionState == ConnectionState.waiting) {
              return const Center(
                child: CircularProgressIndicator(color: Color(0xFF4ECDC4)),
              );
            }

            final allEvidence = evidenceSnapshot.data ?? [];

            return ListView(
              padding: const EdgeInsets.all(16),
              children: EvidenceCategory.values.map((cat) {
                final state = states[cat];
                final categoryEvidence = allEvidence.where((e) => e.category == cat).toList();
                return _buildCategoryBlock(cat, state, categoryEvidence);
              }).toList(),
            );
          },
        );
      },
    );
  }

  Widget _buildCategoryBlock(
    EvidenceCategory category,
    EvidenceStateModel? state,
    List<EvidenceModel> evidence,
  ) {
    final status = state?.status ?? EvidenceStatus.na;
    final locked = state?.locked ?? false;

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
                onPressed: locked ? null : () => _uploadPhotos(category),
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
                '${evidence.length} salvate',
                style: const TextStyle(
                  fontSize: 14,
                  color: Color(0xB3EAF1FF),
                ),
              ),
            ],
          ),
          if (evidence.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: evidence.map((e) => _buildThumb(e, locked)).toList(),
            ),
          ],
          if (!locked && evidence.isNotEmpty) ...[
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => _reverifyCategory(category, evidence.length),
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

  Widget _buildThumb(EvidenceModel evidence, bool locked) {
    return Stack(
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: const Color(0x14FFFFFF),
            border: Border.all(color: const Color(0x1FFFFFFF)),
            borderRadius: BorderRadius.circular(8),
            image: evidence.downloadUrl.isNotEmpty
                ? DecorationImage(
                    image: NetworkImage(evidence.downloadUrl),
                    fit: BoxFit.cover,
                  )
                : null,
          ),
          child: evidence.downloadUrl.isEmpty
              ? const Center(
                  child: Icon(Icons.image, color: Color(0x4DEAF1FF), size: 32),
                )
              : null,
        ),
        if (!locked)
          Positioned(
            top: 4,
            right: 4,
            child: InkWell(
              onTap: () => _archiveEvidence(evidence),
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

  Future<void> _uploadPhotos(EvidenceCategory category) async {
    try {
      final images = await _picker.pickMultiImage();
      if (images.isEmpty) return;

      for (var image in images) {
        await _evidenceService.uploadEvidenceFromPath(
          eventId: widget.eventId,
          category: category,
          filePath: image.path,
        );
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${images.length} poze încărcate'),
            backgroundColor: const Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: $e'),
            backgroundColor: const Color(0xFFFF7878),
          ),
        );
      }
    }
  }

  Future<void> _archiveEvidence(EvidenceModel evidence) async {
    try {
      await _evidenceService.archiveEvidence(
        eventId: widget.eventId,
        evidenceId: evidence.id,
        category: evidence.category,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Dovadă arhivată'),
            backgroundColor: Color(0xFF4ECDC4),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: $e'),
            backgroundColor: const Color(0xFFFF7878),
          ),
        );
      }
    }
  }

  Future<void> _reverifyCategory(EvidenceCategory category, int evidenceCount) async {
    try {
      EvidenceStatus newStatus;
      bool shouldLock = false;

      if (evidenceCount == 0) {
        newStatus = EvidenceStatus.na;
      } else if (evidenceCount >= 1) {
        newStatus = EvidenceStatus.ok;
        shouldLock = true;
      } else {
        newStatus = EvidenceStatus.needed;
      }

      await _evidenceService.updateCategoryStatus(
        eventId: widget.eventId,
        category: category,
        status: newStatus,
        locked: shouldLock,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Categorie ${category.label}: ${newStatus.label}'),
            backgroundColor: const Color(0xFF4ECDC4),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: $e'),
            backgroundColor: const Color(0xFFFF7878),
          ),
        );
      }
    }
  }
}
