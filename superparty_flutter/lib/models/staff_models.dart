class TeamItem {
  final String id;
  final String label;

  TeamItem({required this.id, required this.label});
}

class UserDocData {
  final String fullName;
  final bool kycDone;
  final String? phone;

  UserDocData({required this.fullName, required this.kycDone, this.phone});
}

class StaffProfileData {
  final bool setupDone;
  final String? teamId;
  final String? assignedCode;
  final String? phone;
  final String? email;
  final String? nume;

  StaffProfileData({
    required this.setupDone,
    this.teamId,
    this.assignedCode,
    this.phone,
    this.email,
    this.nume,
  });

  static StaffProfileData empty() => StaffProfileData(setupDone: false);
}

class StaffAllocationResult {
  final String teamId;
  final String prefix;
  final int number;

  StaffAllocationResult({
    required this.teamId,
    required this.prefix,
    required this.number,
  });

  String get assignedCode => '$prefix$number';
}

