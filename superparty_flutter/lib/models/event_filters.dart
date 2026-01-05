class EventFilters {
  final DatePreset preset;
  final DateTime? customStartDate;
  final DateTime? customEndDate;
  final SortDirection sortDirection;
  final DriverFilter driverFilter;
  final String? staffCode; // "Ce cod am" (mutual exclusive cu notedBy)
  final String? notedBy; // "Cine notează" (mutual exclusive cu staffCode)

  EventFilters({
    this.preset = DatePreset.all,
    this.customStartDate,
    this.customEndDate,
    this.sortDirection = SortDirection.desc,
    this.driverFilter = DriverFilter.all,
    this.staffCode,
    this.notedBy,
  }) : assert(
          staffCode == null || notedBy == null,
          'staffCode și notedBy sunt mutual exclusive',
        );

  bool get hasActiveFilters {
    return preset != DatePreset.all ||
        customStartDate != null ||
        customEndDate != null ||
        driverFilter != DriverFilter.all ||
        staffCode != null ||
        notedBy != null;
  }

  int get activeFilterCount {
    int count = 0;
    if (preset != DatePreset.all) count++;
    if (customStartDate != null || customEndDate != null) count++;
    if (driverFilter != DriverFilter.all) count++;
    if (staffCode != null) count++;
    if (notedBy != null) count++;
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

      case DatePreset.yesterday:
        final yesterday = now.subtract(const Duration(days: 1));
        final startOfDay = DateTime(yesterday.year, yesterday.month, yesterday.day);
        final endOfDay = DateTime(yesterday.year, yesterday.month, yesterday.day, 23, 59, 59);
        return (startOfDay, endOfDay);

      case DatePreset.last7:
        final start = now.subtract(const Duration(days: 7));
        final startOfDay = DateTime(start.year, start.month, start.day);
        final endOfDay = DateTime(now.year, now.month, now.day, 23, 59, 59);
        return (startOfDay, endOfDay);

      case DatePreset.next7:
        final startOfDay = DateTime(now.year, now.month, now.day);
        final end = now.add(const Duration(days: 7));
        final endOfDay = DateTime(end.year, end.month, end.day, 23, 59, 59);
        return (startOfDay, endOfDay);

      case DatePreset.next30:
        final startOfDay = DateTime(now.year, now.month, now.day);
        final end = now.add(const Duration(days: 30));
        final endOfDay = DateTime(end.year, end.month, end.day, 23, 59, 59);
        return (startOfDay, endOfDay);

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
    SortDirection? sortDirection,
    DriverFilter? driverFilter,
    String? staffCode,
    String? notedBy,
    bool clearCustomDates = false,
    bool clearStaffCode = false,
    bool clearNotedBy = false,
  }) {
    // Enforce mutual exclusivity
    String? newStaffCode = clearStaffCode ? null : (staffCode ?? this.staffCode);
    String? newNotedBy = clearNotedBy ? null : (notedBy ?? this.notedBy);

    if (staffCode != null) {
      newNotedBy = null; // Clear notedBy when setting staffCode
    }
    if (notedBy != null) {
      newStaffCode = null; // Clear staffCode when setting notedBy
    }

    return EventFilters(
      preset: preset ?? this.preset,
      customStartDate: clearCustomDates ? null : (customStartDate ?? this.customStartDate),
      customEndDate: clearCustomDates ? null : (customEndDate ?? this.customEndDate),
      sortDirection: sortDirection ?? this.sortDirection,
      driverFilter: driverFilter ?? this.driverFilter,
      staffCode: newStaffCode,
      notedBy: newNotedBy,
    );
  }

  EventFilters reset() {
    return EventFilters(
      preset: DatePreset.all,
      sortDirection: SortDirection.desc,
      driverFilter: DriverFilter.all,
    );
  }
}

enum DatePreset {
  all('Toate'),
  today('Azi'),
  yesterday('Ieri'),
  last7('Ultimele 7 zile'),
  next7('Următoarele 7 zile'),
  next30('Următoarele 30 zile'),
  custom('Interval (aleg eu)');

  final String label;
  const DatePreset(this.label);
}

enum SortDirection {
  asc('Crescător (vechi → nou)'),
  desc('Descrescător (nou → vechi)');

  final String label;
  const SortDirection(this.label);
}

/// Filtru șofer cu 4 stări ciclice
enum DriverFilter {
  all('Toate'),           // toate evenimentele
  yes('Necesită'),        // doar evenimente care necesită șofer
  open('Nerezolvate'),    // necesită șofer ȘI nu e alocat încă
  no('Fără șofer');       // nu necesită șofer

  final String label;
  const DriverFilter(this.label);

  /// Următoarea stare în ciclu: all → yes → open → no → all
  DriverFilter get next {
    switch (this) {
      case DriverFilter.all:
        return DriverFilter.yes;
      case DriverFilter.yes:
        return DriverFilter.open;
      case DriverFilter.open:
        return DriverFilter.no;
      case DriverFilter.no:
        return DriverFilter.all;
    }
  }

  /// Badge text pentru UI
  String get badgeText {
    switch (this) {
      case DriverFilter.all:
        return 'T';
      case DriverFilter.yes:
        return 'NEC';
      case DriverFilter.open:
        return 'NRZ';
      case DriverFilter.no:
        return 'NU';
    }
  }
}
