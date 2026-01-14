import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/screens/whatsapp/whatsapp_permissions.dart';

void main() {
  test('super-admin can send even if locked', () {
    expect(
      canSendToThread(
        currentUid: 'u1',
        isSuperAdmin: true,
        ownerUid: 'other',
        coWriterUids: const [],
        locked: true,
      ),
      true,
    );
  });

  test('owner can send when not locked', () {
    expect(
      canSendToThread(
        currentUid: 'u1',
        isSuperAdmin: false,
        ownerUid: 'u1',
        coWriterUids: const [],
        locked: false,
      ),
      true,
    );
  });

  test('co-writer can send when not locked', () {
    expect(
      canSendToThread(
        currentUid: 'u2',
        isSuperAdmin: false,
        ownerUid: 'u1',
        coWriterUids: const ['u2'],
        locked: false,
      ),
      true,
    );
  });

  test('non-writer cannot send', () {
    expect(
      canSendToThread(
        currentUid: 'u3',
        isSuperAdmin: false,
        ownerUid: 'u1',
        coWriterUids: const ['u2'],
        locked: false,
      ),
      false,
    );
  });

  test('locked blocks non-super-admin', () {
    expect(
      canSendToThread(
        currentUid: 'u1',
        isSuperAdmin: false,
        ownerUid: 'u1',
        coWriterUids: const [],
        locked: true,
      ),
      false,
    );
  });
}

