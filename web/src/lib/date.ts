// `new Date('2026-08-08')` parses as UTC midnight; toLocaleDateString() then
// renders it in the browser's local timezone, which rolls back a day for any
// timezone behind UTC (all of the US). Date-only strings (YYYY-MM-DD) need
// their components read directly and built as a local date instead.
export function formatDate(dateString: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(dateString)
  if (dateOnly) {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString()
  }
  return new Date(dateString).toLocaleDateString()
}

// Same local-date parsing as formatDate, so "days since" doesn't roll back a
// day for date-only strings in timezones behind UTC.
export function daysSince(dateString: string): number {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(dateString)
  const then = dateOnly
    ? new Date(Number(dateString.slice(0, 4)), Number(dateString.slice(5, 7)) - 1, Number(dateString.slice(8, 10)))
    : new Date(dateString)
  return Math.floor((Date.now() - then.getTime()) / 86_400_000)
}

// Today as a local YYYY-MM-DD date-only string, for maintenance records the
// API requires an explicit date_performed for (unlike reminder completion,
// which defaults to today server-side).
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
