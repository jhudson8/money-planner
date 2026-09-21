import { describe, expect, it } from 'vitest'
import { alignHistoricalAccountStartYears } from './marketHistory'

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
