import '../core/auth/is_super_admin.dart';

bool isPrivilegedPath(String path) =>
    path.startsWith('/admin') || path.startsWith('/gm');

/// Returns true if a non-superadmin must be redirected away from this path.
bool shouldRedirectToEvenimente({
  required String path,
  required String? email,
}) {
  if (!isPrivilegedPath(path)) return false;
  return !isSuperAdminEmailString(email);
}

