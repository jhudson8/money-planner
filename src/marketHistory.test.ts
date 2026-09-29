import { describe, expect, it } from 'vitest'
import {
  alignHistoricalAccountStartYears,
  maxHistoricalStartYear,
  resolveMarketPeriod,
  resolveReturnPath,
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
