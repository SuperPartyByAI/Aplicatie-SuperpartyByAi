import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';

import '../core/network/api_client.dart';
import '../core/network/api_exceptions.dart';
import '../models/whatsapp_account.dart';
import '../repositories/accounts_repo.dart';

enum WhatsAppConnectUiState {
  idle,
  creating,
  waitingForQr,
  qrReady,
  connected,
  error,
}

class WhatsAppConnectProvider extends ChangeNotifier {
  final AccountsRepo _accountsRepo;
  final ApiClient _api;

  StreamSubscription<WhatsAppAccount?>? _sub;

  WhatsAppConnectUiState state = WhatsAppConnectUiState.idle;
  String? errorMessage;

  String? accountId;
  String? accountStatus;

  // Cache decoded QR to avoid re-decoding every build.
  String? _lastQrCode;
  Uint8List? qrPngBytes;

  WhatsAppConnectProvider({
    required AccountsRepo accountsRepo,
    required ApiClient api,
  })  : _accountsRepo = accountsRepo,
        _api = api;

  Future<void> createAccount(String name) async {
    final n = name.trim();
    if (n.isEmpty) return;

    _setState(WhatsAppConnectUiState.creating);

    Map<String, dynamic> res;
    try {
      // QR-only: DO NOT send phone.
      res = await _api.postJson('/api/whatsapp/add-account', body: {'name': n});
    } on ApiTimeoutException catch (_) {
      // Single short-lived retry for transient failures.
      await Future<void>.delayed(const Duration(milliseconds: 900));
      res = await _api.postJson('/api/whatsapp/add-account', body: {'name': n});
    } on ApiNetworkException catch (_) {
      await Future<void>.delayed(const Duration(milliseconds: 900));
      res = await _api.postJson('/api/whatsapp/add-account', body: {'name': n});
    } catch (e) {
      _fail('Failed to create account: ${e.toString()}');
      return;
    }

    final id = _extractAccountId(res);
    if (id == null) {
      _fail('Backend response missing account id');
      return;
    }

    startWatchingAccount(id);
  }

  void startWatchingAccount(String id) {
    accountId = id;
    errorMessage = null;
    _sub?.cancel();

    _setState(WhatsAppConnectUiState.waitingForQr);
    _sub = _accountsRepo.watchAccount(id).listen((acc) {
      if (acc == null) {
        _fail('Account not found (deleted?)');
        return;
      }
      _handleAccount(acc);
    }, onError: (e) {
      _fail('Firestore error: ${e.toString()}');
    });
  }

  void _handleAccount(WhatsAppAccount acc) {
    accountStatus = acc.status;

    final status = acc.status.toLowerCase();
    if (status == 'connected') {
      _setState(WhatsAppConnectUiState.connected);
      return;
    }

    if (status == 'qr_ready' && acc.qrCode != null) {
      if (_lastQrCode != acc.qrCode) {
        _lastQrCode = acc.qrCode;
        qrPngBytes = acc.qrPngBytes;
      }
      _setState(WhatsAppConnectUiState.qrReady);
      return;
    }

    if (status == 'needs_qr' || status == 'disconnected' || status == 'loggedout') {
      // QR expired or logged out. UI should guide to recreate account.
      _setState(WhatsAppConnectUiState.waitingForQr);
      return;
    }
    if (status == 'logged_out' || status == 'logged-out') {
      _setState(WhatsAppConnectUiState.waitingForQr);
      return;
    }

    _setState(WhatsAppConnectUiState.waitingForQr);
  }

  String? _extractAccountId(Map<String, dynamic> res) {
    final direct = res['accountId'];
    if (direct is String && direct.trim().isNotEmpty) return direct.trim();

    final acc = res['account'];
    if (acc is Map) {
      final id = acc['id'];
      if (id is String && id.trim().isNotEmpty) return id.trim();
    }

    return null;
  }

  void _fail(String msg) {
    errorMessage = msg;
    _setState(WhatsAppConnectUiState.error);
  }

  void _setState(WhatsAppConnectUiState next) {
    if (state == next && errorMessage == null) {
      notifyListeners();
      return;
    }
    state = next;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

