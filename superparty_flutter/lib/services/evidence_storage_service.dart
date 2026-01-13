import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/evidence_model.dart';

/// Service pentru storage local al dovezilor (shared_preferences)
class EvidenceStorageService {
  static const String _stateKeyPrefix = 'evidence_state_v2_';

  /// Get evidence state for event
  static Future<EvidenceState> getEvidenceState(String eventId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_stateKeyPrefix$eventId';
      final jsonStr = prefs.getString(key);
      
      if (jsonStr == null) {
        return EvidenceState.empty();
      }
      
      final data = json.decode(jsonStr) as Map<String, dynamic>;
      return EvidenceState.fromJson(data);
    } catch (e) {
      return EvidenceState.empty();
    }
  }

  /// Save evidence state for event
  static Future<void> saveEvidenceState(String eventId, EvidenceState state) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_stateKeyPrefix$eventId';
      final jsonStr = json.encode(state.toJson());
      await prefs.setString(key, jsonStr);
    } catch (e) {
      print('Error saving evidence state: $e');
    }
  }

  /// Get proofs for category
  static Future<List<EvidenceProof>> getProofs(
    String eventId,
    EvidenceCategory category,
  ) async {
    final state = await getEvidenceState(eventId);
    return state.proofs[category] ?? [];
  }

  /// Add proof to category
  static Future<void> addProof(
    String eventId,
    EvidenceCategory category,
    EvidenceProof proof,
  ) async {
    final state = await getEvidenceState(eventId);
    if (state.proofs[category] == null) {
      state.proofs[category] = [];
    }
    state.proofs[category]!.add(proof);
    state.updatedTs = DateTime.now().millisecondsSinceEpoch;
    await saveEvidenceState(eventId, state);
  }

  /// Remove proof from category
  static Future<void> removeProof(
    String eventId,
    EvidenceCategory category,
    int index,
  ) async {
    final state = await getEvidenceState(eventId);
    if (state.proofs[category] != null && index < state.proofs[category]!.length) {
      state.proofs[category]!.removeAt(index);
      state.updatedTs = DateTime.now().millisecondsSinceEpoch;
      await saveEvidenceState(eventId, state);
    }
  }

  /// Update category status
  static Future<void> updateCategoryStatus(
    String eventId,
    EvidenceCategory category,
    EvidenceVerdict verdict,
  ) async {
    final state = await getEvidenceState(eventId);
    state.status[category] = EvidenceStatus(
      verdict: verdict,
      ts: DateTime.now().millisecondsSinceEpoch,
    );
    state.updatedTs = DateTime.now().millisecondsSinceEpoch;
    await saveEvidenceState(eventId, state);
  }
}

/// Evidence state model
class EvidenceState {
  final Map<EvidenceCategory, List<EvidenceProof>> proofs;
  final Map<EvidenceCategory, EvidenceStatus> status;
  int updatedTs;

  EvidenceState({
    required this.proofs,
    required this.status,
    required this.updatedTs,
  });

  factory EvidenceState.empty() {
    return EvidenceState(
      proofs: {
        EvidenceCategory.onTime: [],
        EvidenceCategory.luggage: [],
        EvidenceCategory.accessories: [],
        EvidenceCategory.laundry: [],
      },
      status: {
        EvidenceCategory.onTime: EvidenceStatus(verdict: EvidenceVerdict.na, ts: 0),
        EvidenceCategory.luggage: EvidenceStatus(verdict: EvidenceVerdict.na, ts: 0),
        EvidenceCategory.accessories: EvidenceStatus(verdict: EvidenceVerdict.na, ts: 0),
        EvidenceCategory.laundry: EvidenceStatus(verdict: EvidenceVerdict.na, ts: 0),
      },
      updatedTs: 0,
    );
  }

  factory EvidenceState.fromJson(Map<String, dynamic> json) {
    final proofs = <EvidenceCategory, List<EvidenceProof>>{};
    final status = <EvidenceCategory, EvidenceStatus>{};

    for (var cat in EvidenceCategory.values) {
      final catKey = cat.value;
      if (json['proofs'] != null && json['proofs'][catKey] != null) {
        proofs[cat] = (json['proofs'][catKey] as List)
            .map((e) => EvidenceProof.fromJson(e))
            .toList();
      } else {
        proofs[cat] = [];
      }

      if (json['status'] != null && json['status'][catKey] != null) {
        status[cat] = EvidenceStatus.fromJson(json['status'][catKey]);
      } else {
        status[cat] = EvidenceStatus(verdict: EvidenceVerdict.na, ts: 0);
      }
    }

    return EvidenceState(
      proofs: proofs,
      status: status,
      updatedTs: json['updatedTs'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    final proofsJson = <String, dynamic>{};
    final statusJson = <String, dynamic>{};

    for (var cat in EvidenceCategory.values) {
      proofsJson[cat.value] = (proofs[cat] ?? [])
          .map((p) => p.toJson())
          .toList();
      statusJson[cat.value] = (status[cat] ?? EvidenceStatus(verdict: EvidenceVerdict.na, ts: 0))
          .toJson();
    }

    return {
      'proofs': proofsJson,
      'status': statusJson,
      'updatedTs': updatedTs,
    };
  }
}

/// Evidence proof model
class EvidenceProof {
  final String photoId;
  final String name;
  final int size;
  final String type;
  final int ts;
  final String? thumbDataUrl; // Base64 data URL for thumbnail
  bool locked;

  EvidenceProof({
    required this.photoId,
    required this.name,
    required this.size,
    required this.type,
    required this.ts,
    this.thumbDataUrl,
    this.locked = false,
  });

  factory EvidenceProof.fromJson(Map<String, dynamic> json) {
    return EvidenceProof(
      photoId: json['photoId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      size: json['size'] as int? ?? 0,
      type: json['type'] as String? ?? 'image/jpeg',
      ts: json['ts'] as int? ?? 0,
      thumbDataUrl: json['thumbDataUrl'] as String?,
      locked: json['locked'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'photoId': photoId,
      'name': name,
      'size': size,
      'type': type,
      'ts': ts,
      if (thumbDataUrl != null) 'thumbDataUrl': thumbDataUrl,
      'locked': locked,
    };
  }
}

/// Evidence status model
class EvidenceStatus {
  final EvidenceVerdict verdict;
  final int ts;

  EvidenceStatus({
    required this.verdict,
    required this.ts,
  });

  factory EvidenceStatus.fromJson(Map<String, dynamic> json) {
    return EvidenceStatus(
      verdict: EvidenceVerdict.fromString(json['verdict'] as String? ?? 'na'),
      ts: json['ts'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'verdict': verdict.value,
      'ts': ts,
    };
  }
}

/// Evidence verdict enum
enum EvidenceVerdict {
  na('na', 'N/A'),
  ok('ok', 'OK'),
  needsMore('needs_more', 'Mai trebuie'),
  review('review', 'Se verifica');

  final String value;
  final String label;
  const EvidenceVerdict(this.value, this.label);

  static EvidenceVerdict fromString(String value) {
    switch (value) {
      case 'ok':
        return EvidenceVerdict.ok;
      case 'needs_more':
        return EvidenceVerdict.needsMore;
      case 'review':
        return EvidenceVerdict.review;
      default:
        return EvidenceVerdict.na;
    }
  }
}
