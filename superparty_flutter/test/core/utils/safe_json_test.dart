import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/core/utils/safe_json.dart';

void main() {
  group('SafeJson.tryDecodeJsonMap', () {
    test('decode valid JSON map returns map', () {
      final out = SafeJson.tryDecodeJsonMap('{"a":1,"b":"x"}');
      expect(out, isA<Map<String, dynamic>>());
      expect(out!['a'], 1);
      expect(out['b'], 'x');
    });

    test('decode HTML returns null', () {
      final out = SafeJson.tryDecodeJsonMap('<html><head><title>404</title></head></html>');
      expect(out, isNull);
    });

    test('decode JSON list returns null (map only)', () {
      final out = SafeJson.tryDecodeJsonMap('[1,2,3]');
      expect(out, isNull);
    });

    test('empty string returns null', () {
      expect(SafeJson.tryDecodeJsonMap(''), isNull);
    });

    test('leading whitespace then JSON returns map', () {
      final out = SafeJson.tryDecodeJsonMap('  \n{"x":1}');
      expect(out, isNotNull);
      expect(out!['x'], 1);
    });
  });

  group('SafeJson.bodyPreview', () {
    test('empty returns (empty)', () {
      expect(SafeJson.bodyPreview(''), '(empty)');
    });

    test('short string unchanged', () {
      expect(SafeJson.bodyPreview('hello'), 'hello');
    });

    test('long string truncated with ...', () {
      final long = 'a' * 300;
      final out = SafeJson.bodyPreview(long, max: 100);
      expect(out.length, lessThanOrEqualTo(103));
      expect(out.endsWith('...'), isTrue);
    });

    test('newlines collapsed to space', () {
      expect(SafeJson.bodyPreview('a\nb\nc'), 'a b c');
    });
  });
}
