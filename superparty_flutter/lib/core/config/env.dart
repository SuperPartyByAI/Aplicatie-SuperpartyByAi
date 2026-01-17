/// Environment configuration
/// 
/// Supports APP_ENV via --dart-define:
/// - dev: Development environment (uses dev Firebase project)
/// - staging: Staging environment (uses staging Firebase project)
/// - prod: Production environment (uses production Firebase project)
class Env {
  Env._();

  /// App environment: dev, staging, or prod
  /// 
  /// Defaults to 'dev' in debug mode, 'prod' in release mode
  /// Can be overridden via: --dart-define=APP_ENV=staging
  static final String appEnv = () {
    const envFromDefine = String.fromEnvironment('APP_ENV');
    if (envFromDefine.isNotEmpty) {
      return envFromDefine.toLowerCase();
    }
    
    // Default: dev in debug, prod in release
    // Note: kReleaseMode is compile-time constant, so this works
    return const bool.fromEnvironment('dart.vm.product') ? 'prod' : 'dev';
  }();

  /// Check if running in development mode
  static bool get isDev => appEnv == 'dev';

  /// Check if running in staging mode
  static bool get isStaging => appEnv == 'staging';

  /// Check if running in production mode
  static bool get isProd => appEnv == 'prod';

  static const String _defaultWhatsAppBackendUrl =
      'https://whats-upp-production.up.railway.app';

  /// Base URL for Railway `whatsapp-backend`.
  ///
  /// Configure via:
  /// `--dart-define=WHATSAPP_BACKEND_URL=https://your-service.up.railway.app`
  static final String whatsappBackendUrl = _normalizeBaseUrl(
    const String.fromEnvironment(
      'WHATSAPP_BACKEND_URL',
      defaultValue: _defaultWhatsAppBackendUrl,
    ),
  );

  static String _normalizeBaseUrl(String raw) {
    var url = raw.trim();
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    return url;
  }
}
