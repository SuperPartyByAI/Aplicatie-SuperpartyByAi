import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/foundation.dart' show kDebugMode, debugPrint;
import 'whatsapp_web_launcher.dart';

/// Service for loading manual WhatsApp accounts from JSON file
class WhatsAppManualAccountsService {
  static final WhatsAppManualAccountsService _instance =
      WhatsAppManualAccountsService._internal();
  factory WhatsAppManualAccountsService() => _instance;
  WhatsAppManualAccountsService._internal();

  static WhatsAppManualAccountsService get instance => _instance;

  List<ManualAccount>? _cachedAccounts;

  /// Load manual accounts from JSON file
  /// 
  /// Tries to load from:
  /// 1. assets/whatsapp_manual_accounts.json (user-provided, not committed)
  /// 2. assets/whatsapp_manual_accounts.example.json (fallback)
  Future<List<ManualAccount>> loadAccounts() async {
    // Return cached if available
    if (_cachedAccounts != null) {
      return _cachedAccounts!;
    }

    try {
      // Try to load user-provided file first
      try {
        final jsonString = await rootBundle.loadString(
          'assets/whatsapp_manual_accounts.json',
        );
        final jsonList = jsonDecode(jsonString) as List<dynamic>;
        _cachedAccounts = jsonList
            .map((json) => ManualAccount.fromJson(json as Map<String, dynamic>))
            .toList();

        if (kDebugMode) {
          debugPrint(
            '[WhatsAppManualAccountsService] Loaded ${_cachedAccounts!.length} accounts from whatsapp_manual_accounts.json',
          );
        }
        return _cachedAccounts!;
      } catch (e) {
        // User file doesn't exist, try example file
        if (kDebugMode) {
          debugPrint(
            '[WhatsAppManualAccountsService] whatsapp_manual_accounts.json not found, trying example file',
          );
        }
      }

      // Load example file as fallback
      final jsonString = await rootBundle.loadString(
        'assets/whatsapp_manual_accounts.example.json',
      );
      final jsonList = jsonDecode(jsonString) as List<dynamic>;
      _cachedAccounts = jsonList
          .map((json) => ManualAccount.fromJson(json as Map<String, dynamic>))
          .toList();

      if (kDebugMode) {
        debugPrint(
          '[WhatsAppManualAccountsService] Loaded ${_cachedAccounts!.length} accounts from example file (replace with real data)',
        );
      }
      return _cachedAccounts!;
    } catch (e) {
      if (kDebugMode) {
        debugPrint(
          '[WhatsAppManualAccountsService] Error loading accounts: $e',
        );
      }
      rethrow;
    }
  }

  /// Clear cache (useful for reloading)
  void clearCache() {
    _cachedAccounts = null;
  }

  /// Mask phone number for display (show first 4 and last 2 digits)
  static String maskPhone(String phone) {
    if (phone.length < 6) return '[REDACTED]';
    return phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
  }
}
