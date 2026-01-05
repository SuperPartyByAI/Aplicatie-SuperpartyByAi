import 'package:cloud_firestore/cloud_firestore.dart';

class EvidenceModel {
  final String id;
  final String eventId;
  final EvidenceCategory categorie;
  final String downloadUrl;
  final String storagePath;
  final String uploadedBy;
  final DateTime uploadedAt;
  final String? fileName;
  final int? fileSize;
  final String? mimeType;

  EvidenceModel({
    required this.id,
    required this.eventId,
    required this.categorie,
    required this.downloadUrl,
    required this.storagePath,
    required this.uploadedBy,
    required this.uploadedAt,
    this.fileName,
    this.fileSize,
    this.mimeType,
  });

  factory EvidenceModel.fromFirestore(DocumentSnapshot doc, String eventId) {
    final data = doc.data() as Map<String, dynamic>;
    
    return EvidenceModel(
      id: doc.id,
      eventId: eventId,
      categorie: EvidenceCategory.fromString(data['categorie'] as String?),
      downloadUrl: data['downloadUrl'] as String? ?? '',
      storagePath: data['storagePath'] as String? ?? '',
      uploadedBy: data['uploadedBy'] as String? ?? '',
      uploadedAt: (data['uploadedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      fileName: data['fileName'] as String?,
      fileSize: data['fileSize'] as int?,
      mimeType: data['mimeType'] as String?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'categorie': categorie.value,
      'downloadUrl': downloadUrl,
      'storagePath': storagePath,
      'uploadedBy': uploadedBy,
      'uploadedAt': Timestamp.fromDate(uploadedAt),
      if (fileName != null) 'fileName': fileName,
      if (fileSize != null) 'fileSize': fileSize,
      if (mimeType != null) 'mimeType': mimeType,
    };
  }
}

enum EvidenceCategory {
  mancare('Mancare'),
  bautura('Bautura'),
  scenotehnica('Scenotehnica'),
  altele('Altele');

  final String value;
  const EvidenceCategory(this.value);

  static EvidenceCategory fromString(String? value) {
    switch (value) {
      case 'Mancare':
        return EvidenceCategory.mancare;
      case 'Bautura':
        return EvidenceCategory.bautura;
      case 'Scenotehnica':
        return EvidenceCategory.scenotehnica;
      case 'Altele':
        return EvidenceCategory.altele;
      default:
        return EvidenceCategory.altele;
    }
  }

  String get displayName {
    switch (this) {
      case EvidenceCategory.mancare:
        return 'Mâncare';
      case EvidenceCategory.bautura:
        return 'Băutură';
      case EvidenceCategory.scenotehnica:
        return 'Scenotehnică';
      case EvidenceCategory.altele:
        return 'Altele';
    }
  }
}

class EvidenceCategoryMeta {
  final EvidenceCategory categorie;
  final bool locked;
  final String? lockedBy;
  final DateTime? lockedAt;
  final int photoCount;
  final DateTime lastUpdated;

  EvidenceCategoryMeta({
    required this.categorie,
    required this.locked,
    this.lockedBy,
    this.lockedAt,
    required this.photoCount,
    required this.lastUpdated,
  });

  factory EvidenceCategoryMeta.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;
    
    if (data == null) {
      return EvidenceCategoryMeta(
        categorie: EvidenceCategory.fromString(doc.id),
        locked: false,
        photoCount: 0,
        lastUpdated: DateTime.now(),
      );
    }
    
    return EvidenceCategoryMeta(
      categorie: EvidenceCategory.fromString(doc.id),
      locked: data['locked'] as bool? ?? false,
      lockedBy: data['lockedBy'] as String?,
      lockedAt: (data['lockedAt'] as Timestamp?)?.toDate(),
      photoCount: data['photoCount'] as int? ?? 0,
      lastUpdated: (data['lastUpdated'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'locked': locked,
      if (lockedBy != null) 'lockedBy': lockedBy,
      if (lockedAt != null) 'lockedAt': Timestamp.fromDate(lockedAt!),
      'photoCount': photoCount,
      'lastUpdated': Timestamp.fromDate(lastUpdated),
    };
  }

  EvidenceCategoryMeta copyWith({
    EvidenceCategory? categorie,
    bool? locked,
    String? lockedBy,
    DateTime? lockedAt,
    int? photoCount,
    DateTime? lastUpdated,
  }) {
    return EvidenceCategoryMeta(
      categorie: categorie ?? this.categorie,
      locked: locked ?? this.locked,
      lockedBy: lockedBy ?? this.lockedBy,
      lockedAt: lockedAt ?? this.lockedAt,
      photoCount: photoCount ?? this.photoCount,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }
}

class LocalEvidence {
  final String id;
  final String eventId;
  final EvidenceCategory categorie;
  final String localPath;
  final DateTime createdAt;
  final SyncStatus syncStatus;
  final String? remoteUrl;
  final String? remoteDocId;
  final String? errorMessage;
  final int retryCount;

  LocalEvidence({
    required this.id,
    required this.eventId,
    required this.categorie,
    required this.localPath,
    required this.createdAt,
    required this.syncStatus,
    this.remoteUrl,
    this.remoteDocId,
    this.errorMessage,
    this.retryCount = 0,
  });

  factory LocalEvidence.fromMap(Map<String, dynamic> data) {
    return LocalEvidence(
      id: data['id'] as String,
      eventId: data['eventId'] as String,
      categorie: EvidenceCategory.fromString(data['categorie'] as String?),
      localPath: data['localPath'] as String,
      createdAt: DateTime.fromMillisecondsSinceEpoch(data['createdAt'] as int),
      syncStatus: SyncStatus.fromString(data['syncStatus'] as String?),
      remoteUrl: data['remoteUrl'] as String?,
      remoteDocId: data['remoteDocId'] as String?,
      errorMessage: data['errorMessage'] as String?,
      retryCount: data['retryCount'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'eventId': eventId,
      'categorie': categorie.value,
      'localPath': localPath,
      'createdAt': createdAt.millisecondsSinceEpoch,
      'syncStatus': syncStatus.value,
      if (remoteUrl != null) 'remoteUrl': remoteUrl,
      if (remoteDocId != null) 'remoteDocId': remoteDocId,
      if (errorMessage != null) 'errorMessage': errorMessage,
      'retryCount': retryCount,
    };
  }

  LocalEvidence copyWith({
    String? id,
    String? eventId,
    EvidenceCategory? categorie,
    String? localPath,
    DateTime? createdAt,
    SyncStatus? syncStatus,
    String? remoteUrl,
    String? remoteDocId,
    String? errorMessage,
    int? retryCount,
  }) {
    return LocalEvidence(
      id: id ?? this.id,
      eventId: eventId ?? this.eventId,
      categorie: categorie ?? this.categorie,
      localPath: localPath ?? this.localPath,
      createdAt: createdAt ?? this.createdAt,
      syncStatus: syncStatus ?? this.syncStatus,
      remoteUrl: remoteUrl ?? this.remoteUrl,
      remoteDocId: remoteDocId ?? this.remoteDocId,
      errorMessage: errorMessage ?? this.errorMessage,
      retryCount: retryCount ?? this.retryCount,
    );
  }
}

enum SyncStatus {
  pending('pending'),
  synced('synced'),
  failed('failed');

  final String value;
  const SyncStatus(this.value);

  static SyncStatus fromString(String? value) {
    switch (value) {
      case 'synced':
        return SyncStatus.synced;
      case 'failed':
        return SyncStatus.failed;
      default:
        return SyncStatus.pending;
    }
  }
}
