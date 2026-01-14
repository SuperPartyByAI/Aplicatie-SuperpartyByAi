class Env {
  Env._();

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
