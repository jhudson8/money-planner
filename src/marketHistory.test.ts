import { describe, expect, it } from 'vitest'
import {
  alignHistoricalAccountStartYears,
  maxHistoricalStartYear,
  resolveMarketPeriod,
  resolveReturnPath,
  synchronizeHistoricalAccounts,
} from './marketHistory'

describe('complete historical windows', () => {
  it('limits a 49-year simulation to the latest complete real-market window', () => {
    expect(maxHistoricalStartYear(49)).toBe(1976)

    const path = resolveReturnPath(1988, 49)
    expect(path).toMatchObject({
      startYear: 1976,
      endYear: 2024,
      wrapped: false,
      cycleLength: 49,
    })
    expect(path?.returns).toHaveLength(49)
  })

  it('omits presets that cannot supply the full simulation horizon', () => {
    expect(resolveMarketPeriod('post-gfc-boom', 49)).toBeNull()
  })
})

describe('alignHistoricalAccountStartYears', () => {
  it('updates every historical account and leaves flat-rate accounts unchanged', () => {
    type TestAccount = {
      id: string
      returnMode: 'flat' | 'historical'
      historicalStartYear?: number
      historicalPeriodId?: string
    }
    const historicalA: TestAccount = {
      id: 'a',
      returnMode: 'historical' as const,
      historicalStartYear: 2009,
      historicalPeriodId: 'post-gfc-boom',
    }
    const historicalB: TestAccount = {
      id: 'b',
      returnMode: 'historical' as const,
      historicalStartYear: 1970,
      historicalPeriodId: 'stale-preset',
    }
    const flat: TestAccount = { id: 'c', returnMode: 'flat', historicalStartYear: 1990 }

    const result = alignHistoricalAccountStartYears(
      [historicalA, historicalB, flat],
      1951,
      40,
    )

    expect(result[0]).toMatchObject({ historicalStartYear: 1951 })
    expect(result[1]).toMatchObject({ historicalStartYear: 1951 })
    expect(result[0]?.historicalPeriodId).toBeUndefined()
    expect(result[1]?.historicalPeriodId).toBeUndefined()
    expect(result[2]).toBe(flat)
  })
})

describe('synchronizeHistoricalAccounts', () => {
  it('normalizes imported historical accounts to the first historical calendar path and series', () => {
    const accounts = [
      { id: 'flat', returnMode: 'flat' as const, historicalStartYear: 1990 },
      { id: 'anchor', returnMode: 'historical' as const, historicalStartYear: 1946,
        historicalReturnSeries: 'documented-us-equity-total-return' as const },
      { id: 'other', returnMode: 'historical' as const, historicalStartYear: 2000,
        historicalReturnSeries: 'legacy-shiller-december' as const },
    ]
    const result = synchronizeHistoricalAccounts(accounts, 29)
    expect(result[0]).toBe(accounts[0])
    expect(result[1]).toMatchObject({ historicalStartYear: 1946, historicalReturnSeries: 'documented-us-equity-total-return' })
    expect(result[2]).toMatchObject({ historicalStartYear: 1946, historicalReturnSeries: 'documented-us-equity-total-return' })
  })
})
