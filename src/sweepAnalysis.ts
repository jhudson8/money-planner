import {
  maxHistoricalStartYear,
  minHistoricalStartYear,
} from './marketHistory'
import { simulate, yearsToProject } from './simulation'
import type { Plan, SavingsAccount } from './types'

export const SWEEP_MIN_REPLENISH_YEARS = 1
export const SWEEP_MAX_REPLENISH_YEARS = 10
export const SWEEP_MIN_GROWTH_PERCENT = 2
export const SWEEP_MAX_GROWTH_PERCENT = 15

/** One (replenish × growth) policy scored across every start year. */
export type SweepSetting = {
  replenishYears: number
  growthPercent: number
  startYearCount: number
  survivedCount: number
  /** Fraction of start years that finish without depleting */
  survivalRate: number
  medianEndNetWorth: number
  meanEndNetWorth: number
  worstEndNetWorth: number
  bestEndNetWorth: number
  /** Higher is better — survival first, then median ending NW */
  score: number
}

export type SweepReport = {
  accountId: string
  accountName: string
  simulationYears: number
  startYearMin: number
  startYearMax: number
  replenishMin: number
  replenishMax: number
  growthMin: number
  growthMax: number
  trialCount: number
  settingCount: number
  best: SweepSetting[]
  worst: SweepSetting[]
}

export type SweepOptions = {
  replenishMin?: number
  replenishMax?: number
  growthMin?: number
  growthMax?: number
  topN?: number
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function isHistoricalAccount(account: SavingsAccount): boolean {
  return account.returnMode === 'historical'
}

export function compareSettingsBetterFirst(a: SweepSetting, b: SweepSetting): number {
  if (a.score !== b.score) return b.score - a.score
  if (a.survivalRate !== b.survivalRate) return b.survivalRate - a.survivalRate
  if (a.medianEndNetWorth !== b.medianEndNetWorth) return b.medianEndNetWorth - a.medianEndNetWorth
  if (a.meanEndNetWorth !== b.meanEndNetWorth) return b.meanEndNetWorth - a.meanEndNetWorth
  if (a.worstEndNetWorth !== b.worstEndNetWorth) return b.worstEndNetWorth - a.worstEndNetWorth
  if (a.replenishYears !== b.replenishYears) return a.replenishYears - b.replenishYears
  return a.growthPercent - b.growthPercent
}

export function historicalStartYearBounds(plan: Plan): { min: number; max: number } {
  const years = yearsToProject(plan)
  const min = minHistoricalStartYear(years)
  const max = Math.max(min, maxHistoricalStartYear(years) - years + 1)
  return { min, max }
}

/**
 * Sweep every full-window start year × replenish window × growth-before-refill %.
 * Wait-for-high-risk-growth is forced on so growth % applies.
 * Rankings are policies (replenish + growth) aggregated across all start years —
 * not single lucky/unlucky calendar starts.
 */
export function runHistoricalSweep(
  plan: Plan,
  accountId: string,
  options?: SweepOptions,
): SweepReport | null {
  const account = plan.accounts.find((item) => item.id === accountId)
  if (!account || !isHistoricalAccount(account)) return null

  let replenishMin = clampInt(
    options?.replenishMin ?? SWEEP_MIN_REPLENISH_YEARS,
    SWEEP_MIN_REPLENISH_YEARS,
    SWEEP_MAX_REPLENISH_YEARS,
    SWEEP_MIN_REPLENISH_YEARS,
  )
  let replenishMax = clampInt(
    options?.replenishMax ?? SWEEP_MAX_REPLENISH_YEARS,
    SWEEP_MIN_REPLENISH_YEARS,
    SWEEP_MAX_REPLENISH_YEARS,
    SWEEP_MAX_REPLENISH_YEARS,
  )
  if (replenishMin > replenishMax) {
    const swap = replenishMin
    replenishMin = replenishMax
    replenishMax = swap
  }

  let growthMin = clampInt(
    options?.growthMin ?? SWEEP_MIN_GROWTH_PERCENT,
    SWEEP_MIN_GROWTH_PERCENT,
    SWEEP_MAX_GROWTH_PERCENT,
    SWEEP_MIN_GROWTH_PERCENT,
  )
  let growthMax = clampInt(
    options?.growthMax ?? SWEEP_MAX_GROWTH_PERCENT,
    SWEEP_MIN_GROWTH_PERCENT,
    SWEEP_MAX_GROWTH_PERCENT,
    SWEEP_MAX_GROWTH_PERCENT,
  )
  if (growthMin > growthMax) {
    const swap = growthMin
    growthMin = growthMax
    growthMax = swap
  }

  const topN = options?.topN ?? 10
  const simulationYears = yearsToProject(plan)
  const { min: startYearMin, max: startYearMax } = historicalStartYearBounds(plan)

  type Bucket = {
    replenishYears: number
    growthPercent: number
    endNetWorths: number[]
    survivedCount: number
  }
  const buckets = new Map<string, Bucket>()
  let trialCount = 0

  for (let replenish = replenishMin; replenish <= replenishMax; replenish += 1) {
    for (let growth = growthMin; growth <= growthMax; growth += 1) {
      const key = `${replenish}:${growth}`
      const bucket: Bucket = {
        replenishYears: replenish,
        growthPercent: growth,
        endNetWorths: [],
        survivedCount: 0,
      }
      buckets.set(key, bucket)

      for (let startYear = startYearMin; startYear <= startYearMax; startYear += 1) {
        const trialPlan: Plan = {
          ...plan,
          replenishYears: replenish,
          replenishWaitMode: 'yoyGrowth',
          replenishGrowthPercent: growth,
          accounts: plan.accounts.map((item) =>
            item.id === accountId
              ? {
                  ...item,
                  returnMode: 'historical',
                  historicalStartYear: startYear,
                  historicalPeriodId: undefined,
                }
              : item,
          ),
        }
        const projection = simulate(trialPlan)
        bucket.endNetWorths.push(projection.endNetWorth)
        if (projection.depletedInYear === null) bucket.survivedCount += 1
        trialCount += 1
      }
    }
  }

  const settings: SweepSetting[] = [...buckets.values()].map((bucket) => {
    const startYearCount = bucket.endNetWorths.length
    const survivalRate = startYearCount > 0 ? bucket.survivedCount / startYearCount : 0
    const medianEndNetWorth = median(bucket.endNetWorths)
    const meanEndNetWorth = mean(bucket.endNetWorths)
    const worstEndNetWorth = bucket.endNetWorths.length
      ? Math.min(...bucket.endNetWorths)
      : 0
    const bestEndNetWorth = bucket.endNetWorths.length
      ? Math.max(...bucket.endNetWorths)
      : 0
    return {
      replenishYears: bucket.replenishYears,
      growthPercent: bucket.growthPercent,
      startYearCount,
      survivedCount: bucket.survivedCount,
      survivalRate,
      medianEndNetWorth,
      meanEndNetWorth,
      worstEndNetWorth,
      bestEndNetWorth,
      // Prefer policies that survive more eras; among those, higher typical ending NW.
      score: survivalRate * 1e18 + medianEndNetWorth,
    }
  })

  const ranked = [...settings].sort(compareSettingsBetterFirst)
  return {
    accountId,
    accountName: account.name || 'Account',
    simulationYears,
    startYearMin,
    startYearMax,
    replenishMin,
    replenishMax,
    growthMin,
    growthMax,
    trialCount,
    settingCount: settings.length,
    best: ranked.slice(0, topN),
    worst: ranked.slice(-topN).reverse(),
  }
}

export function applySweepSetting(plan: Plan, setting: SweepSetting): Plan {
  return {
    ...plan,
    replenishYears: setting.replenishYears,
    replenishWaitMode: 'yoyGrowth',
    replenishGrowthPercent: setting.growthPercent,
  }
}
