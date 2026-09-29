import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { simulate } from './simulation'
import type { Plan } from './types'

describe('buy-the-dip strategy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 29))
  })

  afterEach(() => vi.useRealTimers())

  it('moves wallet cash above one year of need after the configured market decline', () => {
    const plan: Plan = {
      version: 16,
      birthDate: '1975-07-21',
      planUntilAge: 64,
      replenishYears: 3,
      keepWalletFull: true,
      replenishWaitMode: 'off',
      replenishGrowthPercent: 5,
      buyDipEnabled: true,
      buyDipTriggerPercent: 5,
      accounts: [
        {
          id: 'wallet', kind: 'shortTerm', name: 'Low risk', amount: 400,
          annualReturnPercent: 0, taxRatePercent: 0, depletionOrder: 0, returnMode: 'flat',
        },
        {
          id: 'market', kind: 'longTerm', name: 'High risk', amount: 1000,
          annualReturnPercent: 0, taxRatePercent: 0, depletionOrder: 1,
          returnMode: 'historical', historicalStartYear: 2000,
        },
      ],
      incomeSources: [],
      expenseSources: [{
        id: 'expenses', name: 'Spending', steps: [{
          id: 'expense-step', start: { type: 'now' }, valueType: 'absolute',
          amountPeriod: 'annual', value: 100, annualGrowthPercent: 0, once: false,
        }],
      }],
    }

    const projection = simulate(plan)
    const firstGrowthYear = projection.points[1]!
    const rebalance = firstGrowthYear.accountMoves.find((move) => move.reason === 'rebalance')

    expect(firstGrowthYear.partGrowth.market).toBeCloseTo(-57)
    expect(rebalance).toMatchObject({
      fromId: 'wallet',
      toId: 'market',
      net: 100,
      tax: 0,
    })
    expect(firstGrowthYear.parts.wallet).toBeCloseTo(100)
    expect(firstGrowthYear.parts.market).toBeCloseTo(1043)

    const beforeRecovery = projection.points[6]!
    expect(beforeRecovery.parts.wallet).toBeCloseTo(100)

    const recovered = projection.points[7]!
    expect(recovered.accountMoves.some((move) => move.reason === 'rebalance')).toBe(false)
    expect(recovered.parts.wallet).toBeCloseTo(300)

    const nextLargeDrop = projection.points[9]!
    expect(nextLargeDrop.accountMoves.some((move) => move.reason === 'rebalance')).toBe(true)
    expect(nextLargeDrop.parts.wallet).toBeCloseTo(100)
  })
})
