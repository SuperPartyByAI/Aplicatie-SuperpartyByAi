import 'package:cloud_firestore/cloud_firestore.dart';

/// Model pentru dovadă (schema v2)
class EvidenceModel {
  final String id;
  final String eventId;
  final EvidenceCategory category;
  final String downloadUrl;
  final String storagePath;
  final String fileName;
  final int fileSize;
  final String mimeType;
  
  // Arhivare (NEVER DELETE)
  final bool isArchived;
  final DateTime? archivedAt;
  final String? archivedBy;
  
  // Audit
  final DateTime uploadedAt;
  final String uploadedBy;

  EvidenceModel({
    required this.id,
    required this.eventId,
    required this.category,
    required this.downloadUrl,
    required this.storagePath,
    required this.fileName,
    required this.fileSize,
    required this.mimeType,
    this.isArchived = false,
    this.archivedAt,
    this.archivedBy,
    required this.uploadedAt,
    required this.uploadedBy,
  });

  factory EvidenceModel.fromFirestore(DocumentSnapshot doc, String eventId) {
    final data = doc.data() as Map<String, dynamic>;
    
    return EvidenceModel(
      id: doc.id,
      eventId: eventId,
      category: EvidenceCategory.fromString(data['category'] as String? ?? 'onTime'),
      downloadUrl: data['downloadUrl'] as String? ?? '',
      storagePath: data['storagePath'] as String? ?? '',
      fileName: data['fileName'] as String? ?? '',
      fileSize: data['fileSize'] as int? ?? 0,
      mimeType: data['mimeType'] as String? ?? 'image/jpeg',
      isArchived: data['isArchived'] as bool? ?? false,
      archivedAt: (data['archivedAt'] as Timestamp?)?.toDate(),
      archivedBy: data['archivedBy'] as String?,
      uploadedAt: (data['uploadedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      uploadedBy: data['uploadedBy'] as String? ?? '',
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'category': category.value,
      'downloadUrl': downloadUrl,
      'storagePath': storagePath,
      'fileName': fileName,
      'fileSize': fileSize,
      'mimeType': mimeType,
      'isArchived': isArchived,
      if (archivedAt != null) 'archivedAt': Timestamp.fromDate(archivedAt!),
      if (archivedBy != null) 'archivedBy': archivedBy,
      'uploadedAt': Timestamp.fromDate(uploadedAt),
      'uploadedBy': uploadedBy,
    };
  }
}

/// Categorii dovezi (exact 4, conform spec)
enum EvidenceCategory {
  onTime('onTime', 'Am ajuns la timp'),
  luggage('luggage', 'Am pus bagajul la loc'),
  accessories('accessories', 'Am pus accesoriile la loc'),
  laundry('laundry', 'Am pus hainele la spălat');

  final String value;
  final String label;
  const EvidenceCategory(this.value, this.label);

  static EvidenceCategory fromString(String value) {
    switch (value) {
      case 'onTime':
        return EvidenceCategory.onTime;
      case 'luggage':
        return EvidenceCategory.luggage;
      case 'accessories':
        return EvidenceCategory.accessories;
      case 'laundry':
        return EvidenceCategory.laundry;
      default:
        return EvidenceCategory.onTime;
    }
  }
}
