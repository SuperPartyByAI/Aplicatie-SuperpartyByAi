import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/models/event_filters.dart';

void main() {
  group('EventFilters', () {
    test('dateRange returns null for all preset', () {
      final filters = EventFilters(preset: DatePreset.all);
      final (start, end) = filters.dateRange;
      
      expect(start, isNull);
      expect(end, isNull);
    });

    test('dateRange returns today range', () {
      final filters = EventFilters(preset: DatePreset.today);
      final (start, end) = filters.dateRange;
      
      expect(start, isNotNull);
      expect(end, isNotNull);
      expect(start!.day, equals(DateTime.now().day));
      expect(end!.day, equals(DateTime.now().day));
      expect(start.hour, equals(0));
      expect(end.hour, equals(23));
    });

    test('dateRange returns this week range', () {
      final filters = EventFilters(preset: DatePreset.thisWeek);
      final (start, end) = filters.dateRange;
      
      expect(start, isNotNull);
      expect(end, isNotNull);
      
      final now = DateTime.now();
      final expectedStart = now.subtract(Duration(days: now.weekday - 1));
      expect(start!.day, equals(expectedStart.day));
    });

    test('dateRange returns custom range when provided', () {
      final customStart = DateTime(2024, 1, 1);
      final customEnd = DateTime(2024, 1, 31);
      
      final filters = EventFilters(
        preset: DatePreset.today, // Should be ignored
        customStartDate: customStart,
        customEndDate: customEnd,
      );
      
      final (start, end) = filters.dateRange;
      
      expect(start, equals(customStart));
      expect(end, equals(customEnd));
    });

    test('hasActiveFilters returns false for default filters', () {
      final filters = EventFilters();
      expect(filters.hasActiveFilters, isFalse);
    });

    test('hasActiveFilters returns true when filters are set', () {
      final filters = EventFilters(
        preset: DatePreset.today,
      );
      expect(filters.hasActiveFilters, isTrue);
    });

    test('hasActiveFilters returns true for search query', () {
      final filters = EventFilters(
        searchQuery: 'test',
      );
      expect(filters.hasActiveFilters, isTrue);
    });

    test('activeFilterCount counts correctly', () {
      final filters = EventFilters(
        preset: DatePreset.today,
        searchQuery: 'test',
        tipEveniment: 'Nunta',
        requiresSofer: true,
      );
      
      expect(filters.activeFilterCount, equals(4));
    });

    test('activeFilterCount ignores empty search', () {
      final filters = EventFilters(
        searchQuery: '',
        preset: DatePreset.today,
      );
      
      expect(filters.activeFilterCount, equals(1)); // Only preset
    });

    test('copyWith creates new instance with updated values', () {
      final original = EventFilters(
        preset: DatePreset.today,
        searchQuery: 'test',
      );
      
      final updated = original.copyWith(
        preset: DatePreset.thisWeek,
      );
      
      expect(updated.preset, equals(DatePreset.thisWeek));
      expect(updated.searchQuery, equals('test')); // Preserved
      expect(original.preset, equals(DatePreset.today)); // Original unchanged
    });

    test('copyWith can clear values', () {
      final original = EventFilters(
        searchQuery: 'test',
        tipEveniment: 'Nunta',
      );
      
      final updated = original.copyWith(
        clearSearch: true,
        clearTipEveniment: true,
      );
      
      expect(updated.searchQuery, isNull);
      expect(updated.tipEveniment, isNull);
    });

    test('reset returns default filters', () {
      final filters = EventFilters(
        preset: DatePreset.today,
        searchQuery: 'test',
        tipEveniment: 'Nunta',
      );
      
      final reset = filters.reset();
      
      expect(reset.preset, equals(DatePreset.all));
      expect(reset.searchQuery, isNull);
      expect(reset.tipEveniment, isNull);
      expect(reset.hasActiveFilters, isFalse);
    });
  });
}
