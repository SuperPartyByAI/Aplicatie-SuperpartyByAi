import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Range Modal - Calendar cu 2 taps (start + end)
/// 100% identic cu HTML
/// Referință: kyc-app/kyc-app/public/evenimente.html (#rangeModal)
class RangeModal extends StatefulWidget {
  final DateTime? initialStart;
  final DateTime? initialEnd;
  final Function(DateTime? start, DateTime? end) onRangeSelected;

  const RangeModal({
    super.key,
    this.initialStart,
    this.initialEnd,
    required this.onRangeSelected,
  });

  @override
  State<RangeModal> createState() => _RangeModalState();
}

class _RangeModalState extends State<RangeModal> {
  late DateTime _currentMonth;
  DateTime? _selectedStart;
  DateTime? _selectedEnd;

  @override
  void initState() {
    super.initState();
    _currentMonth = DateTime.now();
    _selectedStart = widget.initialStart;
    _selectedEnd = widget.initialEnd;
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Container(
        color: const Color(0x8C000000), // rgba(0,0,0,0.55)
        padding: const EdgeInsets.all(16),
        child: Center(
          child: GestureDetector(
            onTap: () {}, // Prevent closing when tapping sheet
            child: _buildSheet(),
          ),
        ),
      ),
    );
  }

  Widget _buildSheet() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(maxWidth: 520),
          decoration: BoxDecoration(
            color: const Color(0xEB0B1220), // rgba(11,18,32,0.92)
            border: Border.all(
              color: const Color(0x1AFFFFFFF), // rgba(255,255,255,0.1)
            ),
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: const Color(0x8C000000), // rgba(0,0,0,0.55)
                blurRadius: 80,
                offset: const Offset(0, 24),
              ),
            ],
          ),
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildHeader(),
              const SizedBox(height: 12),
              _buildCalendarHeader(),
              const SizedBox(height: 8),
              _buildDayOfWeekRow(),
              const SizedBox(height: 4),
              _buildCalendarGrid(),
              const SizedBox(height: 8),
              _buildHint(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        Expanded(
          child: Text(
            'Alege interval (primul tap = start, al doilea tap = final)',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Toate button
        TextButton(
          onPressed: () {
            setState(() {
              _selectedStart = null;
              _selectedEnd = null;
            });
            widget.onRangeSelected(null, null);
            Navigator.of(context).pop();
          },
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            backgroundColor: const Color(0x14FFFFFF),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          child: Text(
            'Toate',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Gata button
        TextButton(
          onPressed: () {
            widget.onRangeSelected(_selectedStart, _selectedEnd);
            Navigator.of(context).pop();
          },
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            backgroundColor: const Color(0x14FFFFFF),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          child: Text(
            'Gata',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCalendarHeader() {
    return Row(
      children: [
        // Previous month button
        IconButton(
          onPressed: () {
            setState(() {
              _currentMonth = DateTime(
                _currentMonth.year,
                _currentMonth.month - 1,
              );
            });
          },
          icon: const Icon(Icons.chevron_left),
          color: const Color(0xFFEAF1FF),
        ),
        Expanded(
          child: Center(
            child: Text(
              DateFormat('MMMM yyyy', 'ro').format(_currentMonth),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: const Color(0xFFEAF1FF).withOpacity(0.9),
              ),
            ),
          ),
        ),
        // Next month button
        IconButton(
          onPressed: () {
            setState(() {
              _currentMonth = DateTime(
                _currentMonth.year,
                _currentMonth.month + 1,
              );
            });
          },
          icon: const Icon(Icons.chevron_right),
          color: const Color(0xFFEAF1FF),
        ),
      ],
    );
  }

  Widget _buildDayOfWeekRow() {
    const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    return Row(
      children: days.map((day) {
        return Expanded(
          child: Center(
            child: Text(
              day,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: const Color(0xFFEAF1FF).withOpacity(0.6),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildCalendarGrid() {
    final firstDayOfMonth = DateTime(_currentMonth.year, _currentMonth.month, 1);
    final lastDayOfMonth = DateTime(_currentMonth.year, _currentMonth.month + 1, 0);
    final firstWeekday = firstDayOfMonth.weekday; // 1 = Monday, 7 = Sunday
    final daysInMonth = lastDayOfMonth.day;

    final List<Widget> dayWidgets = [];

    // Add empty cells for days before the first day of the month
    for (int i = 1; i < firstWeekday; i++) {
      dayWidgets.add(const SizedBox());
    }

    // Add day cells
    for (int day = 1; day <= daysInMonth; day++) {
      final date = DateTime(_currentMonth.year, _currentMonth.month, day);
      dayWidgets.add(_buildDayCell(date));
    }

    return GridView.count(
      crossAxisCount: 7,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: dayWidgets,
    );
  }

  Widget _buildDayCell(DateTime date) {
    final isStart = _selectedStart != null &&
        date.year == _selectedStart!.year &&
        date.month == _selectedStart!.month &&
        date.day == _selectedStart!.day;

    final isEnd = _selectedEnd != null &&
        date.year == _selectedEnd!.year &&
        date.month == _selectedEnd!.month &&
        date.day == _selectedEnd!.day;

    final isInRange = _selectedStart != null &&
        _selectedEnd != null &&
        date.isAfter(_selectedStart!) &&
        date.isBefore(_selectedEnd!);

    Color? bgColor;
    if (isStart || isEnd) {
      bgColor = const Color(0xFF4ECDC4); // --accent
    } else if (isInRange) {
      bgColor = const Color(0x294ECDC4); // rgba(78,205,196,0.16)
    }

    return GestureDetector(
      onTap: () {
        setState(() {
          if (_selectedStart == null || (_selectedStart != null && _selectedEnd != null)) {
            // First tap or reset
            _selectedStart = date;
            _selectedEnd = null;
          } else {
            // Second tap
            if (date.isBefore(_selectedStart!)) {
              // Swap if end is before start
              _selectedEnd = _selectedStart;
              _selectedStart = date;
            } else {
              _selectedEnd = date;
            }
          }
        });
      },
      child: Container(
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Center(
          child: Text(
            '${date.day}',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: (isStart || isEnd)
                  ? Colors.white
                  : const Color(0xFFEAF1FF).withOpacity(0.9),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHint() {
    return Text(
      'Nu aplic nimic dupa primul tap. Cand alegi si finalul, se aplica intervalul.',
      style: TextStyle(
        fontSize: 11,
        color: const Color(0xFFEAF1FF).withOpacity(0.6),
      ),
      textAlign: TextAlign.center,
    );
  }
}
