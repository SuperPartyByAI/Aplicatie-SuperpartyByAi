/// Service pentru download APK direct din Firebase Storage
///
/// Folosește stream-to-file pentru a evita OOM pe APK-uri mari
/// Platform-specific implementation via conditional imports
export 'apk_downloader_service_io.dart'
    if (dart.library.html) 'apk_downloader_service_web.dart';
