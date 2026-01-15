import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../core/errors/app_exception.dart';
import '../core/utils/retry.dart';
import '../models/staff_models.dart';

class StaffSettingsService {
  final FirebaseAuth? authOverride;
  final FirebaseFirestore? dbOverride;
  final FirebaseFunctions? functionsOverride;

  StaffSettingsService({FirebaseAuth? auth, FirebaseFirestore? db, FirebaseFunctions? functions})
      : authOverride = auth,
        dbOverride = db,
        functionsOverride = functions;

  FirebaseAuth get auth => authOverride ?? FirebaseAuth.instance;
  FirebaseFirestore get db => dbOverride ?? FirebaseFirestore.instance;
  FirebaseFunctions get functions => functionsOverride ?? FirebaseFunctions.instanceFor(region: 'us-central1');

  User? get currentUser => auth.currentUser;

  /// Normalizes Romanian phone numbers to +40XXXXXXXXX if possible.
  ///
  /// Accepts:
  /// - 07xxxxxxxx
  /// - +40xxxxxxxxx
  /// - 0040xxxxxxxxx
  /// - raw digits like 7xxxxxxxx (9 digits)
  static String normalizePhone(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return '';

    // 0040XXXXXXXXX
    if (digits.startsWith('0040') && digits.length == 13) {
      return '+${digits.substring(2)}'; // -> +40...
    }

    // 40XXXXXXXXX
    if (digits.startsWith('40') && digits.length == 11) {
      return '+$digits';
    }

    // 07XXXXXXXX
    if (digits.startsWith('0') && digits.length == 10) {
      return '+40${digits.substring(1)}';
    }

    // 7XXXXXXXX (mobile without prefix)
    if (digits.length == 9 && digits.startsWith('7')) {
      return '+40$digits';
    }

    // Fallback: keep as +<digits> (will likely fail validation)
    return '+$digits';
  }

  static bool isPhoneValid(String raw) {
    final n = normalizePhone(raw);
    return RegExp(r'^\+40\d{9}$').hasMatch(n);
  }

  static int selectHighestCode(List<dynamic> freeCodes) {
    final nums = freeCodes.map((e) => (e as num).toInt()).toList();
    if (nums.isEmpty) throw StateError('No free codes');
    nums.sort((a, b) => b.compareTo(a)); // desc
    return nums.first;
  }

  /// Parses "B210" into {prefix: "B", number: 210}.
  /// Accepts optional prefix (letters), followed by digits.
  static ({String prefix, int number}) parseAssignedCode(String assignedCode) {
    final raw = assignedCode.trim();
    final m = RegExp(r'^([A-Za-z]+)?(\d+)$').firstMatch(raw);
    if (m == null) {
      throw FormatException('Invalid assignedCode: "$assignedCode"');
    }
    final prefix = (m.group(1) ?? '').trim();
    final number = int.parse(m.group(2)!);
    return (prefix: prefix, number: number);
  }

  static ({String prefix, int number})? tryParseAssignedCode(String assignedCode) {
    try {
      return parseAssignedCode(assignedCode);
    } catch (_) {
      return null;
    }
  }

  static String mapFunctionsError(Object e) {
    if (e is FirebaseFunctionsException) {
      final msg = (e.message ?? '').trim();
      if (msg.isNotEmpty) return msg;
      switch (e.code) {
        case 'unauthenticated':
          return 'Trebuie să fii autentificat.';
        case 'permission-denied':
          return 'Nu ai permisiuni pentru această acțiune.';
        case 'invalid-argument':
          return 'Date invalide. Verifică câmpurile și încearcă din nou.';
        case 'failed-precondition':
          return 'Nu poți continua în acest moment. Verifică starea contului.';
        case 'not-found':
          return 'Resursa nu a fost găsită.';
        case 'resource-exhausted':
          return 'Nu mai există coduri disponibile.';
        default:
          return 'Eroare server: ${e.code}';
      }
    }
    return e.toString();
  }

  Future<UserDocData> fetchUserDoc(String uid, {String emailFallback = ''}) async {
    final snap = await db.collection('users').doc(uid).get();
    final data = snap.data() ?? {};
    final kycData = (data['kycData'] as Map<String, dynamic>?) ?? {};

    final kycFullName = (kycData['fullName'] as String?)?.trim() ?? '';
    final displayName = (data['displayName'] as String?)?.trim() ?? '';
    final fullName = kycFullName.isNotEmpty ? kycFullName : (displayName.isNotEmpty ? displayName : emailFallback);

    // REQUIRED RULE: block if kycDone != true AND fullName missing from kycData
    final kycDone = (data['kycDone'] as bool?) == true || kycFullName.isNotEmpty;
    final phone = data['phone'] as String?;

    return UserDocData(fullName: fullName, kycDone: kycDone, phone: phone);
  }

  Future<StaffProfileData> fetchStaffProfile(String uid) async {
    final snap = await db.collection('staffProfiles').doc(uid).get();
    if (!snap.exists) return StaffProfileData.empty();
    final data = snap.data() ?? {};
    return StaffProfileData(
      setupDone: (data['setupDone'] as bool?) ?? false,
      teamId: data['teamId'] as String?,
      assignedCode: (data['assignedCode'] as String?) ?? (data['codIdentificare'] as String?),
      phone: data['phone'] as String?,
      email: data['email'] as String?,
      nume: data['nume'] as String?,
    );
  }

  Future<List<TeamItem>> listTeams() async {
    final q = await db.collection('teams').get();
    final teams = <TeamItem>[];
    for (final d in q.docs) {
      final data = d.data();
      final active = data['active'];
      if (active is bool && active == false) continue;
      final label = (data['label'] as String?) ?? (data['name'] as String?) ?? d.id;
      teams.add(TeamItem(id: d.id, label: label));
    }
    teams.sort((a, b) => a.label.toLowerCase().compareTo(b.label.toLowerCase()));
    return teams;
  }

  Future<StaffAllocationResult> allocateStaffCode({
    required String teamId,
    String? prevTeamId,
    int? prevCodeNumber,
    required String requestToken,
  }) async {
    return retryWithBackoff(() async {
      final callable = functions.httpsCallable('allocateStaffCode');
      try {
        final res = await callable.call(<String, dynamic>{
          'teamId': teamId,
          'requestToken': requestToken,
          if (prevTeamId != null && prevTeamId.isNotEmpty) 'prevTeamId': prevTeamId,
          if (prevCodeNumber != null) 'prevCodeNumber': prevCodeNumber,
        });
        final data = (res.data as Map).cast<String, dynamic>();
        final prefix = (data['prefix'] as String?) ?? '';
        final number = (data['number'] as num).toInt();
        final tId = (data['teamId'] as String?) ?? teamId;
        return StaffAllocationResult(teamId: tId, prefix: prefix, number: number);
      } catch (e) {
        throw ErrorMapper.fromFirebaseFunctionsException(e);
      }
    });
  }

  Future<void> finalizeStaffSetup({
    required String phone,
    required String teamId,
    required String assignedCode,
    required String requestToken,
  }) async {
    return retryWithBackoff(() async {
      final callable = functions.httpsCallable('finalizeStaffSetup');
      try {
        await callable.call(<String, dynamic>{
          'phone': phone,
          'teamId': teamId,
          'assignedCode': assignedCode,
          'requestToken': requestToken,
        });
      } catch (e) {
        throw ErrorMapper.fromFirebaseFunctionsException(e);
      }
    });
  }

  Future<void> updateStaffPhone({required String phone}) async {
    return retryWithBackoff(() async {
      final callable = functions.httpsCallable('updateStaffPhone');
      try {
        await callable.call(<String, dynamic>{'phone': phone});
      } catch (e) {
        throw ErrorMapper.fromFirebaseFunctionsException(e);
      }
    });
  }
}

