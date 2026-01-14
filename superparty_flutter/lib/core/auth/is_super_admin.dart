import 'package:firebase_auth/firebase_auth.dart';

const String superAdminEmail = 'ursache.andrei1995@gmail.com';

bool isSuperAdminEmailString(String? email) =>
    (email ?? '').trim().toLowerCase() == superAdminEmail;

bool isSuperAdmin(User? u) =>
    isSuperAdminEmailString(u?.email);

