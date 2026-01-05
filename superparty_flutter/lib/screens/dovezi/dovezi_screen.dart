import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../models/event_model.dart';
import '../../models/evidence_model.dart';
import '../../services/event_service.dart';
import '../../services/evidence_service.dart';
import '../../services/local_evidence_cache_service.dart';
import '../../services/file_storage_service.dart';

class DoveziScreen extends StatefulWidget {
  final String eventId;

  const DoveziScreen({
    super.key,
    required this.eventId,
  });

  @override
  State<DoveziScreen> createState() => _DoveziScreenState();
}

class _DoveziScreenState extends State<DoveziScreen> {
  final EventService _eventService = EventService();
  final EvidenceService _evidenceService = EvidenceService();
  final LocalEvidenceCacheService _cacheService = LocalEvidenceCacheService();
  final FileStorageService _fileService = FileStorageService();
  final ImagePicker _picker = ImagePicker();

  EventModel? _event;
  bool _isLoading = true;
  String? _error;

  final Map<EvidenceCategory, bool> _expandedCategories = {
    EvidenceCategory.mancare: true,
    EvidenceCategory.bautura: false,
    EvidenceCategory.scenotehnica: false,
    EvidenceCategory.altele: false,
  };

  @override
  void initState() {
    super.initState();
    _loadEvent();
  }

  Future<void> _loadEvent() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      final event = await _eventService.getEvent(widget.eventId);
      
      setState(() {
        _event = event;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

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
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Dovezi',
              style: TextStyle(
                color: Color(0xFFE2E8F0),
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (_event != null)
              Text(
                _event!.nume,
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 12,
                ),
              ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync, color: Color(0xFFDC2626)),
            onPressed: _syncPendingEvidence,
            tooltip: 'Sincronizează',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildError()
              : _buildContent(),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: Colors.red, size: 48),
            const SizedBox(height: 16),
            Text(
              _error ?? 'Eroare necunoscută',
              style: const TextStyle(color: Colors.white70),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadEvent,
              child: const Text('Reîncearcă'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ...EvidenceCategory.values.map((category) => _buildCategoryCard(category)),
      ],
    );
  }

  Widget _buildCategoryCard(EvidenceCategory category) {
    final isExpanded = _expandedCategories[category] ?? false;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      color: const Color(0xFF1A2332),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFF2D3748)),
      ),
      child: Column(
        children: [
          ListTile(
            leading: Icon(
              _getCategoryIcon(category),
              color: const Color(0xFFDC2626),
            ),
            title: Text(
              category.displayName,
              style: const TextStyle(
                color: Color(0xFFE2E8F0),
                fontWeight: FontWeight.bold,
              ),
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                StreamBuilder<EvidenceCategoryMeta>(
                  stream: _evidenceService.getCategoryMetaStream(
                    eventId: widget.eventId,
                    categorie: category,
                  ),
                  builder: (context, snapshot) {
                    final meta = snapshot.data;
                    if (meta?.locked == true) {
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.green.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.lock, color: Colors.green, size: 16),
                            SizedBox(width: 4),
                            Text(
                              'OK',
                              style: TextStyle(color: Colors.green, fontSize: 12),
                            ),
                          ],
                        ),
                      );
                    }
                    return const SizedBox();
                  },
                ),
                const SizedBox(width: 8),
                Icon(
                  isExpanded ? Icons.expand_less : Icons.expand_more,
                  color: const Color(0xFF94A3B8),
                ),
              ],
            ),
            onTap: () {
              setState(() {
                _expandedCategories[category] = !isExpanded;
              });
            },
          ),
          if (isExpanded) _buildCategoryContent(category),
        ],
      ),
    );
  }

  Widget _buildCategoryContent(EvidenceCategory category) {
    return StreamBuilder<EvidenceCategoryMeta>(
      stream: _evidenceService.getCategoryMetaStream(
        eventId: widget.eventId,
        categorie: category,
      ),
      builder: (context, metaSnapshot) {
        final meta = metaSnapshot.data;
        final isLocked = meta?.locked ?? false;

        return Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildEvidenceGrid(category, isLocked),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: isLocked ? null : () => _addEvidence(category),
                      icon: const Icon(Icons.add_photo_alternate),
                      label: const Text('Adaugă Poză'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFDC2626),
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: const Color(0xFF2D3748),
                        disabledForegroundColor: const Color(0xFF94A3B8),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton.icon(
                    onPressed: isLocked ? null : () => _lockCategory(category),
                    icon: Icon(isLocked ? Icons.lock : Icons.lock_open),
                    label: Text(isLocked ? 'Blocat' : 'Marchează OK'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isLocked ? Colors.green : const Color(0xFFF97316),
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: Colors.green.withOpacity(0.5),
                      disabledForegroundColor: Colors.white70,
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildEvidenceGrid(EvidenceCategory category, bool isLocked) {
    return StreamBuilder<List<EvidenceModel>>(
      stream: _evidenceService.getEvidenceStream(
        eventId: widget.eventId,
        categorie: category,
      ),
      builder: (context, remoteSnapshot) {
        return FutureBuilder<List<LocalEvidence>>(
          future: _cacheService.listByEventAndCategory(
            eventId: widget.eventId,
            categorie: category,
          ),
          builder: (context, localSnapshot) {
            final remoteEvidence = remoteSnapshot.data ?? [];
            final localEvidence = localSnapshot.data ?? [];

            // Dedupe: exclude local evidence that's already synced and exists in remote
            final remoteDocIds = remoteEvidence.map((e) => e.id).toSet();
            final localEvidenceFiltered = localEvidence.where((local) {
              // Keep only pending/failed, or synced items not yet in remote stream
              return local.syncStatus != SyncStatus.synced || 
                     (local.remoteDocId != null && !remoteDocIds.contains(local.remoteDocId));
            }).toList();

            if (remoteEvidence.isEmpty && localEvidenceFiltered.isEmpty) {
              return Container(
                padding: const EdgeInsets.all(32),
                alignment: Alignment.center,
                child: const Text(
                  'Nicio poză adăugată',
                  style: TextStyle(color: Color(0xFF94A3B8)),
                ),
              );
            }

            return GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: remoteEvidence.length + localEvidenceFiltered.length,
              itemBuilder: (context, index) {
                if (index < localEvidenceFiltered.length) {
                  return _buildLocalThumbnail(localEvidenceFiltered[index], isLocked);
                } else {
                  return _buildRemoteThumbnail(
                    remoteEvidence[index - localEvidenceFiltered.length],
                    isLocked,
                  );
                }
              },
            );
          },
        );
      },
    );
  }

  Widget _buildLocalThumbnail(LocalEvidence evidence, bool isLocked) {
    return Stack(
      fit: StackFit.expand,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.file(
            File(evidence.localPath),
            fit: BoxFit.cover,
          ),
        ),
        Positioned(
          top: 4,
          right: 4,
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: _getSyncStatusColor(evidence.syncStatus),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Icon(
              _getSyncStatusIcon(evidence.syncStatus),
              color: Colors.white,
              size: 16,
            ),
          ),
        ),
        if (!isLocked)
          Positioned(
            bottom: 4,
            right: 4,
            child: IconButton(
              icon: const Icon(Icons.delete, color: Colors.red, size: 20),
              onPressed: () => _deleteLocalEvidence(evidence),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
          ),
      ],
    );
  }

  Widget _buildRemoteThumbnail(EvidenceModel evidence, bool isLocked) {
    return Stack(
      fit: StackFit.expand,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            evidence.downloadUrl,
            fit: BoxFit.cover,
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return const Center(child: CircularProgressIndicator());
            },
            errorBuilder: (context, error, stackTrace) {
              return const Center(
                child: Icon(Icons.error, color: Colors.red),
              );
            },
          ),
        ),
        if (!isLocked)
          Positioned(
            bottom: 4,
            right: 4,
            child: IconButton(
              icon: const Icon(Icons.delete, color: Colors.red, size: 20),
              onPressed: () => _deleteRemoteEvidence(evidence),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
          ),
      ],
    );
  }

  IconData _getCategoryIcon(EvidenceCategory category) {
    switch (category) {
      case EvidenceCategory.mancare:
        return Icons.restaurant;
      case EvidenceCategory.bautura:
        return Icons.local_bar;
      case EvidenceCategory.scenotehnica:
        return Icons.music_note;
      case EvidenceCategory.altele:
        return Icons.more_horiz;
    }
  }

  Color _getSyncStatusColor(SyncStatus status) {
    switch (status) {
      case SyncStatus.pending:
        return Colors.orange;
      case SyncStatus.synced:
        return Colors.green;
      case SyncStatus.failed:
        return Colors.red;
    }
  }

  IconData _getSyncStatusIcon(SyncStatus status) {
    switch (status) {
      case SyncStatus.pending:
        return Icons.cloud_upload;
      case SyncStatus.synced:
        return Icons.cloud_done;
      case SyncStatus.failed:
        return Icons.cloud_off;
    }
  }

  Future<void> _addEvidence(EvidenceCategory category) async {
    try {
      final XFile? image = await _picker.pickImage(source: ImageSource.gallery);
      if (image == null) return;

      final imageFile = File(image.path);
      
      // Salvează local
      final localPath = await _fileService.saveLocalFile(
        sourceFile: imageFile,
        eventId: widget.eventId,
        categorie: category,
      );

      // Adaugă în cache
      final localEvidence = LocalEvidence(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        eventId: widget.eventId,
        categorie: category,
        localPath: localPath,
        createdAt: DateTime.now(),
        syncStatus: SyncStatus.pending,
      );

      await _cacheService.insertPending(localEvidence);

      // Încearcă upload imediat
      _uploadEvidence(localEvidence);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Poză adăugată')),
        );
      }

      setState(() {}); // Refresh UI
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _uploadEvidence(LocalEvidence localEvidence) async {
    try {
      final imageFile = File(localEvidence.localPath);
      
      final result = await _evidenceService.uploadEvidence(
        eventId: widget.eventId,
        categorie: localEvidence.categorie,
        imageFile: imageFile,
      );

      // Marchează ca synced folosind rezultatul direct
      await _cacheService.markSynced(
        id: localEvidence.id,
        remoteUrl: result.downloadUrl,
        remoteDocId: result.docId,
      );

      if (mounted) {
        setState(() {}); // Refresh UI
      }
    } catch (e) {
      await _cacheService.markFailed(
        id: localEvidence.id,
        errorMessage: e.toString(),
      );
    }
  }

  Future<void> _deleteLocalEvidence(LocalEvidence evidence) async {
    try {
      await _fileService.deleteLocalFile(evidence.localPath);
      await _cacheService.deleteById(evidence.id);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Poză ștearsă')),
        );
      }

      setState(() {}); // Refresh UI
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _deleteRemoteEvidence(EvidenceModel evidence) async {
    try {
      await _evidenceService.deleteEvidence(
        eventId: widget.eventId,
        evidenceId: evidence.id,
        storagePath: evidence.storagePath,
        categorie: evidence.categorie,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Poză ștearsă')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _lockCategory(EvidenceCategory category) async {
    try {
      await _evidenceService.lockCategory(
        eventId: widget.eventId,
        categorie: category,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${category.displayName} blocat')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _syncPendingEvidence() async {
    try {
      final pending = await _cacheService.listPending();
      
      if (pending.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Nicio dovadă de sincronizat')),
          );
        }
        return;
      }

      for (final evidence in pending) {
        await _uploadEvidence(evidence);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${pending.length} dovezi sincronizate')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Eroare sincronizare: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
