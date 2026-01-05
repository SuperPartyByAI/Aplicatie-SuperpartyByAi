class EventFilters {
  final DatePreset preset;
  final DateTime? customStartDate;
  final DateTime? customEndDate;
  final String? searchQuery;
  final String? tipEveniment;
  final String? tipLocatie;
  final bool? requiresSofer;
  final String? assignedToMe; // userId pentru filtrare "ce cod am"
  final SortBy sortBy;
  final SortDirection sortDirection;

  EventFilters({
    this.preset = DatePreset.all,
    this.customStartDate,
    this.customEndDate,
    this.searchQuery,
    this.tipEveniment,
    this.tipLocatie,
    this.requiresSofer,
    this.assignedToMe,
    this.sortBy = SortBy.data,
    this.sortDirection = SortDirection.desc,
  });

  bool get hasActiveFilters {
    return preset != DatePreset.all ||
        customStartDate != null ||
        customEndDate != null ||
        (searchQuery != null && searchQuery!.isNotEmpty) ||
        tipEveniment != null ||
        tipLocatie != null ||
        requiresSofer != null ||
        assignedToMe != null;
  }

  int get activeFilterCount {
    int count = 0;
    if (preset != DatePreset.all) count++;
    if (customStartDate != null || customEndDate != null) count++;
    if (searchQuery != null && searchQuery!.isNotEmpty) count++;
    if (tipEveniment != null) count++;
    if (tipLocatie != null) count++;
    if (requiresSofer != null) count++;
    if (assignedToMe != null) count++;
    return count;
  }

  (DateTime?, DateTime?) get dateRange {
    if (customStartDate != null || customEndDate != null) {
      return (customStartDate, customEndDate);
    }

    final now = DateTime.now();
    switch (preset) {
      case DatePreset.today:
        final startOfDay = DateTime(now.year, now.month, now.day);
        final endOfDay = DateTime(now.year, now.month, now.day, 23, 59, 59);
        return (startOfDay, endOfDay);
      
      case DatePreset.thisWeek:
        final startOfWeek = now.subtract(Duration(days: now.weekday - 1));
        final startOfWeekDay = DateTime(startOfWeek.year, startOfWeek.month, startOfWeek.day);
        final endOfWeek = startOfWeekDay.add(const Duration(days: 6, hours: 23, minutes: 59, seconds: 59));
        return (startOfWeekDay, endOfWeek);
      
      case DatePreset.thisMonth:
        final startOfMonth = DateTime(now.year, now.month, 1);
        final endOfMonth = DateTime(now.year, now.month + 1, 0, 23, 59, 59);
        return (startOfMonth, endOfMonth);
      
      case DatePreset.nextWeek:
        final startOfNextWeek = now.add(Duration(days: 7 - now.weekday + 1));
        final startDay = DateTime(startOfNextWeek.year, startOfNextWeek.month, startOfNextWeek.day);
        final endDay = startDay.add(const Duration(days: 6, hours: 23, minutes: 59, seconds: 59));
        return (startDay, endDay);
      
      case DatePreset.nextMonth:
        final startOfNextMonth = DateTime(now.year, now.month + 1, 1);
        final endOfNextMonth = DateTime(now.year, now.month + 2, 0, 23, 59, 59);
        return (startOfNextMonth, endOfNextMonth);
      
      case DatePreset.custom:
        return (customStartDate, customEndDate);
      
      case DatePreset.all:
        return (null, null);
    }
  }

  EventFilters copyWith({
    DatePreset? preset,
    DateTime? customStartDate,
    DateTime? customEndDate,
    String? searchQuery,
    String? tipEveniment,
    String? tipLocatie,
    bool? requiresSofer,
    String? assignedToMe,
    SortBy? sortBy,
    SortDirection? sortDirection,
    bool clearCustomDates = false,
    bool clearSearch = false,
    bool clearTipEveniment = false,
    bool clearTipLocatie = false,
    bool clearRequiresSofer = false,
    bool clearAssignedToMe = false,
  }) {
    return EventFilters(
      preset: preset ?? this.preset,
      customStartDate: clearCustomDates ? null : (customStartDate ?? this.customStartDate),
      customEndDate: clearCustomDates ? null : (customEndDate ?? this.customEndDate),
      searchQuery: clearSearch ? null : (searchQuery ?? this.searchQuery),
      tipEveniment: clearTipEveniment ? null : (tipEveniment ?? this.tipEveniment),
      tipLocatie: clearTipLocatie ? null : (tipLocatie ?? this.tipLocatie),
      requiresSofer: clearRequiresSofer ? null : (requiresSofer ?? this.requiresSofer),
      assignedToMe: clearAssignedToMe ? null : (assignedToMe ?? this.assignedToMe),
      sortBy: sortBy ?? this.sortBy,
      sortDirection: sortDirection ?? this.sortDirection,
    );
  }

  EventFilters reset() {
    return EventFilters(
      preset: DatePreset.all,
      sortBy: SortBy.data,
      sortDirection: SortDirection.desc,
    );
  }
}

enum DatePreset {
  all('Toate'),
  today('Astăzi'),
  thisWeek('Săptămâna aceasta'),
  thisMonth('Luna aceasta'),
  nextWeek('Săptămâna viitoare'),
  nextMonth('Luna viitoare'),
  custom('Personalizat');

  final String label;
  const DatePreset(this.label);
}

enum SortBy {
  data('Data'),
  nume('Nume'),
  locatie('Locație');

  final String label;
  const SortBy(this.label);
}

enum SortDirection {
  asc('Crescător'),
  desc('Descrescător');

  final String label;
  const SortDirection(this.label);
}
