import { describe, expect, it } from 'vitest'
import {
  formatPercent, formatShorthandUsd, signedUsd, signedUsdWithMonthly,
  usdWithMonthly, usdYearAndMonth, yearsPhrase,
} from './format'

describe('money formatting', () => {
  it.each([[1200, '+$1,200'], [-1200, '-$1,200'], [0, '$0']])(
    'formats signed amount %s', (value, expected) => {
      expect(signedUsd(value)).toBe(expected)
    },
  )

  it('formats compact amounts', () => {
    expect(formatShorthandUsd(1250000)).toBe('$1.25M')
  })

  it('shows monthly equivalents for annual and one-off amounts', () => {
    expect(usdYearAndMonth(120000)).toBe('$120,000/yr · $10,000/mo')
    expect(usdWithMonthly(120000)).toBe('$120,000 · $10,000/mo')
    expect(signedUsdWithMonthly(-120000)).toBe('-$120,000 · $10,000/mo')
    expect(signedUsdWithMonthly(120000)).toBe('+$120,000 · $10,000/mo')
  })

  it.each([0, 0.004, -0.004])('suppresses negligible amounts %s', (value) => {
    expect(usdYearAndMonth(value)).toBe('$0/yr · $0/mo')
    expect(usdWithMonthly(value)).toBe('$0')
    expect(signedUsdWithMonthly(value)).toBe('$0')
  })
})

describe('percentages and durations', () => {
  it('uses the requested percentage precision', () => {
    expect(formatPercent(4)).toBe('4.0%')
    expect(formatPercent(4.125, 2)).toBe('4.13%')
    expect(formatPercent(-2.5, 0)).toBe('-3%')
  })

  it.each([[0, '1 year'], [1, '1 year'], [1.9, '1 year'], [2.9, '2 years']])(
    'formats %s years', (value, expected) => {
      expect(yearsPhrase(value)).toBe(expected)
    },
  )
})
