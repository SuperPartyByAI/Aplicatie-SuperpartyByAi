import 'package:cloud_firestore/cloud_firestore.dart';
import 'evidence_model.dart';

/// Model pentru status categorie dovezi
class EvidenceStateModel {
  final String id; // categoryId (onTime, luggage, accessories, laundry)
  final EvidenceCategory category;
  final EvidenceStatus status;
  final bool locked; // true după status OK
  final DateTime updatedAt;
  final String updatedBy;

  EvidenceStateModel({
    required this.id,
    required this.category,
    required this.status,
    required this.locked,
    required this.updatedAt,
    required this.updatedBy,
  });

  factory EvidenceStateModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return EvidenceStateModel(
      id: doc.id,
      category: EvidenceCategory.fromString(data['category'] as String? ?? 'onTime'),
      status: EvidenceStatus.fromString(data['status'] as String? ?? 'na'),
      locked: data['locked'] as bool? ?? false,
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedBy: data['updatedBy'] as String? ?? '',
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'category': category.value,
      'status': status.value,
      'locked': locked,
      'updatedAt': Timestamp.fromDate(updatedAt),
      'updatedBy': updatedBy,
    };
  }

  /// Creează state inițial pentru categorie
  factory EvidenceStateModel.initial({
    required EvidenceCategory category,
    required String userId,
  }) {
    return EvidenceStateModel(
      id: category.value,
      category: category,
      status: EvidenceStatus.na,
      locked: false,
      updatedAt: DateTime.now(),
      updatedBy: userId,
    );
  }
}

/// Status categorie dovezi
enum EvidenceStatus {
  na('na', 'N/A'),                      // nu e aplicabil / nu e setat
  verifying('verifying', 'Se verifică'), // are poze, se verifică
  needed('needed', 'Mai trebuie'),       // lipsesc poze
  ok('ok', 'OK');                        // validat, categorie locked

  final String value;
  final String label;
  const EvidenceStatus(this.value, this.label);

  static EvidenceStatus fromString(String value) {
    switch (value) {
      case 'na':
        return EvidenceStatus.na;
      case 'verifying':
        return EvidenceStatus.verifying;
      case 'needed':
        return EvidenceStatus.needed;
      case 'ok':
        return EvidenceStatus.ok;
      default:
        return EvidenceStatus.na;
    }
  }
}
