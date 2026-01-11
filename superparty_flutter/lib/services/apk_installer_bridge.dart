/// Bridge pentru comunicare Flutter <-> Android native code
///
/// Funcții:
/// - canInstallPackages(): verifică dacă app-ul poate instala APK-uri
/// - installApk(filePath): deschide installerul Android pentru APK
/// - openUnknownSourcesSettings(): deschide Settings pentru permisiune
///
/// Platform-specific implementation via conditional imports
export 'apk_installer_bridge_io.dart'
    if (dart.library.html) 'apk_installer_bridge_web.dart';
