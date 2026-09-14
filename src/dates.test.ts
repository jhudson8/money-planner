import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addYearsIso, ageAtYearOffset, calendarYearAtOffset, formatLongDate,
  parseIsoDate, todayIsoDate, toIsoDate, yearsFromToday,
} from './dates'

describe('date parsing and formatting', () => {
  it('formats local dates with zero-padded months and days', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })

  it('parses a leap day at local midnight', () => {
    expect(parseIsoDate('2024-02-29')).toEqual(new Date(2024, 1, 29))
  })

  it.each(['', 'not-a-date', '2026-9-14', '09/14/2026', '2026-09-14T00:00:00Z'])(
    'rejects malformed input %j', (input) => {
      expect(parseIsoDate(input)).toBeNull()
      expect(formatLongDate(input)).toBe(input)
    },
  )

  it('formats a readable US date', () => {
    expect(formatLongDate('2026-09-14')).toBe('Sep 14, 2026')
  })

  it.each([[2, '2028-09-14'], [-1, '2025-09-14'], [0, '2026-09-14']])(
    'adds %i calendar years', (offset, expected) => {
      expect(addYearsIso('2026-09-14', offset)).toBe(expected)
    },
  )

  it('rolls a leap day into March in a non-leap year', () => {
    expect(addYearsIso('2024-02-29', 1)).toBe('2025-03-01')
  })
})

describe('dates relative to today', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 14, 15, 30))
  })

  afterEach(() => vi.useRealTimers())

  it('returns today in local ISO format', () => {
    expect(todayIsoDate()).toBe('2026-09-14')
  })

  it('uses today when adding years to malformed input', () => {
    expect(addYearsIso('invalid', 2)).toBe('2028-09-14')
  })

  it.each([
    ['1960-09-13', 66], ['1960-09-14', 66], ['1960-09-15', 65],
    ['2030-01-01', 0], ['invalid', null],
  ])('calculates completed age for %s', (birthDate, expected) => {
    expect(ageAtYearOffset(birthDate, 0)).toBe(expected)
  })

  it('applies positive and negative year offsets to age', () => {
    expect(ageAtYearOffset('1960-09-15', 5)).toBe(70)
    expect(ageAtYearOffset('1960-09-15', -5)).toBe(60)
  })

  it('counts a leap-day birthday as reached on March 1 in a non-leap year', () => {
    vi.setSystemTime(new Date(2025, 1, 28))
    expect(ageAtYearOffset('2000-02-29', 0)).toBe(24)
    vi.setSystemTime(new Date(2025, 2, 1))
    expect(ageAtYearOffset('2000-02-29', 0)).toBe(25)
  })

  it.each([[0, 2026], [1.4, 2027], [1.5, 2028], [-2, 2024]])(
    'rounds calendar year offset %s', (offset, expected) => {
      expect(calendarYearAtOffset(offset)).toBe(expected)
    },
  )

  it.each(['invalid', '2025-09-14', '2026-09-14'])(
    'returns zero years remaining for %s', (input) => {
      expect(yearsFromToday(input)).toBe(0)
    },
  )

  it('returns fractional years and ignores the current time of day', () => {
    expect(yearsFromToday('2027-09-14')).toBeCloseTo(365 / 365.25, 3)
    expect(yearsFromToday('2027-03-14')).toBeCloseTo(181 / 365.25, 3)
    vi.setSystemTime(new Date(2026, 8, 14, 1))
    expect(yearsFromToday('2027-09-14')).toBeCloseTo(365 / 365.25, 3)
  })
})
