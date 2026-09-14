export function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayIsoDate(): string {
  return toIsoDate(new Date())
}

export function addYearsIso(isoDate: string, years: number): string {
  const parsed = parseIsoDate(isoDate) ?? new Date()
  parsed.setFullYear(parsed.getFullYear() + years)
  return toIsoDate(parsed)
}

export function parseIsoDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Completed whole years from birthDate to today, plus yearOffset. */
export function ageAtYearOffset(birthDate: string, yearOffset: number): number | null {
  const birth = parseIsoDate(birthDate)
  if (!birth) return null
  const at = new Date()
  at.setHours(0, 0, 0, 0)
  at.setFullYear(at.getFullYear() + yearOffset)
  let age = at.getFullYear() - birth.getFullYear()
  const birthdayReached =
    at.getMonth() > birth.getMonth() ||
    (at.getMonth() === birth.getMonth() && at.getDate() >= birth.getDate())
  if (!birthdayReached) age -= 1
  return Math.max(0, age)
}

export function formatLongDate(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (!date) return isoDate
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function calendarYearAtOffset(yearOffset: number): number {
  return new Date().getFullYear() + Math.round(yearOffset)
}

/** Whole years from today until the date. Past dates are 0. */
export function yearsFromToday(isoDate: string): number {
  const target = parseIsoDate(isoDate)
  if (!target) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  const ms = target.getTime() - today.getTime()
  if (ms <= 0) return 0
  return ms / (365.25 * 24 * 60 * 60 * 1000)
}
