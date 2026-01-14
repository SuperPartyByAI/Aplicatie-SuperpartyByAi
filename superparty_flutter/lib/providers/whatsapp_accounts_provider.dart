import 'package:flutter/foundation.dart';

import '../core/network/api_client.dart';
import '../models/whatsapp_account.dart';
import '../repositories/accounts_repo.dart';

class WhatsAppAccountsProvider extends ChangeNotifier {
  static const int maxAccounts = 30;

  final AccountsRepo _accountsRepo;
  final ApiClient _api;

  WhatsAppAccountsProvider({
    required AccountsRepo accountsRepo,
    required ApiClient api,
  })  : _accountsRepo = accountsRepo,
        _api = api;

  Stream<List<WhatsAppAccount>> watchAccounts() => _accountsRepo.watchAccounts();

  Future<void> deleteAccount(String accountId) async {
    await _api.deleteJson('/api/whatsapp/accounts/$accountId');
  }
}

