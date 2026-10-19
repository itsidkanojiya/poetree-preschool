/// Days as the school's calendar names them.
///
/// A school day is a day in India Standard Time, whatever the phone's own
/// clock says — the same rule the API uses. A notice posted at 23:30 on the
/// 8th belongs to the 8th though UTC calls it 18:00; one posted at 00:30 on
/// the 9th belongs to the 9th though UTC still calls it the 8th. Comparing in
/// UTC, or in a travelling phone's zone, files both under the wrong day.
library;

const _ist = Duration(hours: 5, minutes: 30);

String _two(int n) => n.toString().padLeft(2, '0');

/// `YYYY-MM-DD` for a calendar date — the key every day is looked up by.
String dayKey(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${_two(date.month)}-${_two(date.day)}';

/// A calendar date, with no time and no zone to trip over.
DateTime dateOf(DateTime date) => DateTime(date.year, date.month, date.day);

/// The school's today.
DateTime schoolToday([DateTime? now]) =>
    dateOf((now ?? DateTime.now()).toUtc().add(_ist));

/// The moment an API timestamp names, on the school's clock: for showing a
/// time of day, and for deciding which day it belongs to.
DateTime? schoolTime(String? instant) {
  final parsed = instant == null ? null : DateTime.tryParse(instant);
  if (parsed == null) return null;
  final ist = parsed.toUtc().add(_ist);
  // Rebuilt as a plain local value, so formatting prints the school's time
  // rather than converting it again to the phone's zone.
  return DateTime(
    ist.year,
    ist.month,
    ist.day,
    ist.hour,
    ist.minute,
    ist.second,
  );
}

/// The school day a timestamp falls on.
String? schoolDayOf(String? instant) {
  final time = schoolTime(instant);
  return time == null ? null : dayKey(time);
}

/// The day a date-only value names. The API sends those as `2026-10-08` or
/// as midnight UTC, `2026-10-08T00:00:00.000Z`; either way the date is the
/// first ten characters, and converting it to any zone would only move it.
String? dateOnly(String? value) =>
    value != null && value.length >= 10 ? value.substring(0, 10) : null;
