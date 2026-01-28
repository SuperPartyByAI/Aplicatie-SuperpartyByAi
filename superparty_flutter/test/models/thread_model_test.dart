import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/models/thread_model.dart';

void main() {
  group('ThreadModel.fromJson', () {
    test('A) has lastMessageText', () {
      final json = {
        'id': 'acc__40712345678@s.whatsapp.net',
        'threadId': 'acc__40712345678@s.whatsapp.net',
        'clientJid': '40712345678@s.whatsapp.net',
        'displayName': 'John',
        'lastMessageText': 'Hello there',
        'lastMessageAt': {'_seconds': 1737812400},
        'accountId': 'acc',
        'accountName': 'Main',
      };
      final t = ThreadModel.fromJson(Map<String, dynamic>.from(json));
      expect(t.threadId, 'acc__40712345678@s.whatsapp.net');
      expect(t.displayName, 'John');
      expect(t.clientJid, '40712345678@s.whatsapp.net');
      expect(t.lastMessageText, 'Hello there');
      expect(t.lastMessageAt, isNotNull);
      expect(t.initial, 'J');
    });

    test('B) has only lastMessagePreview', () {
      final json = {
        'id': 'acc__40787654321@s.whatsapp.net',
        'clientJid': '40787654321@s.whatsapp.net',
        'lastMessagePreview': 'See you later',
        'lastMessageAt': {'_seconds': 1737812500},
      };
      final t = ThreadModel.fromJson(Map<String, dynamic>.from(json));
      expect(t.lastMessageText, 'See you later');
      expect(t.displayName, isNotEmpty);
      expect(t.phone, '+40787654321');
    });

    test('C) has only lastMessageBody and remoteJid', () {
      final json = {
        'id': 'acc__40711111111@s.whatsapp.net',
        'remoteJid': '40711111111@s.whatsapp.net',
        'lastMessageBody': 'Legacy body',
        'lastMessageAtMs': 1737812600000,
      };
      final t = ThreadModel.fromJson(Map<String, dynamic>.from(json));
      expect(t.clientJid, '40711111111@s.whatsapp.net');
      expect(t.lastMessageText, 'Legacy body');
      expect(t.lastMessageAt, isNotNull);
      expect(t.phone, '+40711111111');
      expect(t.initial, '4'); // Phone is +40711111111, displayName is formatted as phone, so initial extracts first digit '4'
    });
  });
}
