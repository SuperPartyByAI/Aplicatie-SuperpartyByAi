import 'package:firebase_auth/firebase_auth.dart';

const String superAdminEmail = 'ursache.andrei1995@gmail.com';

bool isSuperAdmin(User? u) =>
    (u?.email ?? '').trim().toLowerCase() == superAdminEmail;

