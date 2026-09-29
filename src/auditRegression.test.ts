import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import rawFixture from './test-data/legacy-1917-plan.json'
import { coercePlan } from './storage'
import { simulate } from './simulation'
import type { HistoricalReturnSeries, Plan } from './types'

function fixturePlan(series: HistoricalReturnSeries, startYear: number): Plan {
  const plan = coercePlan(rawFixture)!
  plan.planUntilAge = 80
  plan.accounts = plan.accounts.map((account) =>
    account.returnMode === 'historical'
      ? { ...account, historicalStartYear: startYear, historicalPeriodId: undefined, historicalReturnSeries: series }
      : account,
  )
  return plan
}

describe('audited retirement regressions', () => {
  beforeEach(() => vi.setSystemTime(new Date(2026, 8, 29)))
  afterEach(() => vi.useRealTimers())

  it('reproduces the attached 1917 example under the legacy series', () => {
    expect(simulate(fixturePlan('legacy-shiller-december', 1917)).endNetWorth)
      .toBeCloseTo(14_316_370.27, 2)
  })

  it('replays every synchronized complete 29-year window under both series', () => {
    const failures = (series: HistoricalReturnSeries) => {
      const result: Array<{ start: number; yearOffset: number; age: number | null }> = []
      for (let start = 1872; start <= 1996; start += 1) {
        const projection = simulate(fixturePlan(series, start))
        if (projection.depletedInYear != null) {
          result.push({
            start,
            yearOffset: projection.depletedInYear,
            age: projection.points.find((point) => point.yearOffset === projection.depletedInYear)?.age ?? null,
          })
        }
      }
      return result
    }
    expect(failures('legacy-shiller-december')).toEqual([
      { start: 1929, yearOffset: 21, age: 72 },
      { start: 1930, yearOffset: 25, age: 76 },
    ])
    expect(failures('documented-us-equity-total-return')).toEqual([
      { start: 1929, yearOffset: 14, age: 65 },
      { start: 1930, yearOffset: 17, age: 68 },
    ])
  })

  it('uses the post-RMD balance as the investment growth base', () => {
    const plan: Plan = {
      version: 16, birthDate: '1954-01-01', planUntilAge: 74,
      replenishYears: 1, keepWalletFull: false, replenishWaitMode: 'off', replenishGrowthPercent: 5,
      accounts: [
        { id: 'wallet', kind: 'shortTerm', name: 'Wallet', amount: 0, annualReturnPercent: 0, taxRatePercent: 0, depletionOrder: 0 },
        { id: 'market', kind: 'longTerm', name: 'Market', amount: 0, annualReturnPercent: 0, taxRatePercent: 0, depletionOrder: 1 },
        { id: 'sep', kind: 'sepIra', name: 'SEP', amount: 1000, annualReturnPercent: 10, taxRatePercent: 0, depletionOrder: 2 },
      ], incomeSources: [], expenseSources: [],
    }
    const age73 = simulate(plan).points.find((point) => point.age === 73)!
    expect(age73.accountMoves.find((move) => move.reason === 'rmd')?.sold).toBeCloseTo(1000 / 27)
    expect(age73.partGrowthBase.sep).toBeCloseTo(1000 - 1000 / 27)
    expect(age73.partGrowth.sep / age73.partGrowthBase.sep).toBeCloseTo(0.10)
  })

  it('declares a shortfall while inaccessible assets remain positive', () => {
    const plan: Plan = {
      version: 16, birthDate: null, planUntilAge: 1,
      replenishYears: 1, keepWalletFull: false, replenishWaitMode: 'off', replenishGrowthPercent: 5,
      accounts: [
        { id: 'wallet', kind: 'shortTerm', name: 'Wallet', amount: 0, annualReturnPercent: 0, taxRatePercent: 0, depletionOrder: 0 },
        { id: 'locked', kind: 'longTerm', name: 'Locked', amount: 1000, annualReturnPercent: 0, taxRatePercent: 0, depletionOrder: 1,
          transfer: { enabled: true, durationYears: 5, targetAccountId: 'wallet', lockRefills: true } },
      ], incomeSources: [], expenseSources: [{ id: 'e', name: 'Need', steps: [{ id: 's', start: { type: 'now' }, valueType: 'absolute', amountPeriod: 'annual', value: 100, annualGrowthPercent: 0, once: false }] }],
    }
    const projection = simulate(plan)
    expect(projection.depletedInYear).toBe(0)
    expect(projection.points[0]?.spendingShortfall).toBe(100)
    expect(projection.points[0]?.netWorth).toBe(1000)
  })

  it('defines market recovery independently from the account dollar balance', () => {
    const make = (recoveryBasis: 'marketIndex' | 'accountBalance'): Plan => ({
      version: 16, birthDate: null, planUntilAge: 10,
      replenishYears: 3, keepWalletFull: true, replenishWaitMode: 'recoverHigh',
      replenishGrowthPercent: 5, recoveryBasis,
      accounts: [
        { id: 'w', kind: 'shortTerm', name: 'Wallet', amount: 400, annualReturnPercent: 0, taxRatePercent: 0, depletionOrder: 0 },
        { id: 'm', kind: 'longTerm', name: 'Market', amount: 1000, annualReturnPercent: 0, taxRatePercent: 0, depletionOrder: 1,
          returnMode: 'historical', historicalStartYear: 2000 },
      ], incomeSources: [], expenseSources: [{ id: 'e', name: 'Need', steps: [{ id: 's', start: { type: 'now' }, valueType: 'absolute', amountPeriod: 'annual', value: 100, annualGrowthPercent: 0, once: false }] }],
    })
    const market = simulate(make('marketIndex'))
    const legacyBalance = simulate(make('accountBalance'))
    expect(market.points[3]?.walletRefill).toBe(100)
    expect(legacyBalance.points[3]?.walletRefill).toBe(0)
    expect(legacyBalance.points[4]?.walletRefill).toBe(200)
  })
})
