export type Timing =
  | { type: 'now' }
  | { type: 'yearsFromNow'; value: number }
  | { type: 'date'; date: string }

export type ValueType = 'absolute' | 'relative'
export type AmountPeriod = 'annual' | 'monthly'

export type AccountKind =
  | 'shortTerm'
  | 'longTerm'
  | 'traditional401k'
  | 'rothIra'
  | 'traditionalIra'
  | 'sepIra'

/** Optional wallet refill gate (required empty-wallet sells always run). */
export type ReplenishWaitMode = 'off' | 'yoyGrowth' | 'recoverHigh'

export interface ScheduleStep {
  id: string
  start: Timing
  valueType: ValueType
  /** For absolute amounts: whether `value` is yearly or monthly. Ignored for relative. */
  amountPeriod: AmountPeriod
  /** Dollars if absolute (per the amountPeriod); percent of the source's original annual amount if relative (200 = 2x). */
  value: number
  /** Compound annual change while this step is active, e.g. 5 for +5%/year. Ignored when once. */
  annualGrowthPercent: number
  /** When true, this amount applies only in the start year and does not replace ongoing periods. */
  once: boolean
}

export interface CashFlowSource {
  id: string
  name: string
  steps: ScheduleStep[]
  disabled?: boolean
}

export interface AccountTransfer {
  enabled: boolean
  /** Duration in years that this account can be used before being sold and transferred */
  durationYears: number
  /** Destination account ID to receive the net proceeds */
  targetAccountId: string
  /** If true, do not draw from this account to refill the wallet before the transfer */
  lockRefills?: boolean
  /** If true, transfer 100% of the balance without taking taxes */
  taxExempt?: boolean
}

export interface SavingsAccount {
  id: string
  kind: AccountKind
  name: string
  /** Dollars today in this account. */
  amount: number
  /**
   * Flat investment return, e.g. 6 for 6%/year.
   * Used when returnMode is 'flat' (default). Ignored for growth when historical is selected,
   * but still stored so you can switch back.
   */
  annualReturnPercent: number
  /**
   * How this account earns returns each year.
   * - flat: constant annualReturnPercent
   * - historical: year-by-year S&P path from historicalPeriodId (same length as the plan)
   */
  returnMode?: 'flat' | 'historical'
  /** Named historical market preset when returnMode is 'historical' (optional convenience). */
  historicalPeriodId?: string
  /** First calendar year of the S&P path when returnMode is 'historical'. */
  historicalStartYear?: number
  /**
   * Tax rate applied when this account is sold to refill the short-term wallet.
   * Roth IRA is always treated as 0.
   */
  taxRatePercent: number
  /** Lower sells first within its group. 401(k) and IRA accounts always sell after long-term. */
  depletionOrder: number
  /** Optional transfer rule: after a certain amount of years, sell and transfer to another account */
  transfer?: AccountTransfer
}

export interface Plan {
  version: 16
  birthDate: string | null
  /** Age the projection runs through. Years on the graph are derived from date of birth. */
  planUntilAge: number
  /**
   * Years of spending minus income held in the short-term wallet.
   * The wallet is refilled on this cadence, or sooner if it runs out.
   */
  replenishYears: number
  /**
   * When true, after each year's spending the wallet is topped up so it still holds
   * the next replenishYears of spending minus income.
   */
  keepWalletFull: boolean
  /**
   * Gate optional wallet refills (cadence / keep-full). Required refills when the wallet
   * cannot cover that year's spending always run.
   * - off: refill on schedule
   * - yoyGrowth: only if primary long-term is up ≥ replenishGrowthPercent vs last year
   * - recoverHigh: only if primary long-term has recovered to its prior peak after a drop
   */
  replenishWaitMode: ReplenishWaitMode
  /**
   * Minimum year-over-year gain (%) on the primary high-risk account before optional replenishing.
   * Used when replenishWaitMode is 'yoyGrowth'. Default 5.
   */
  replenishGrowthPercent: number
  accounts: SavingsAccount[]
  incomeSources: CashFlowSource[]
  expenseSources: CashFlowSource[]
}

export interface NamedAmount {
  id: string
  name: string
  amount: number
  change?: number
  growth?: number
}

/** Money leaving one account for another. Tax is not added to the destination. */
export interface AccountMove {
  fromId: string
  fromName: string
  toId: string
  toName: string
  sold: number
  tax: number
  net: number
  reason: 'sale' | 'rmd' | 'transfer'
}

export interface YearProjection {
  yearOffset: number
  age: number | null
  netWorth: number
  income: number
  expenses: number
  growth: number
  cashFlow: number
  taxesPaid: number
  rmdTransferred: number
  /** Net dollars sold into the short-term wallet this year. */
  walletRefill: number
  /** Sales and RMDs that moved between accounts this year. */
  accountMoves: AccountMove[]
  /** Dollar value of each account after this year, keyed by id. */
  parts: Record<string, number>
  /** Investment gain or loss for each account this year, keyed by id. */
  partGrowth: Record<string, number>
  /** Ending balance minus last year's ending balance, keyed by id. */
  partChange: Record<string, number>
  incomeItems: NamedAmount[]
  expenseItems: NamedAmount[]
}

export interface Projection {
  points: YearProjection[]
  parts: { id: string; name: string; kind: AccountKind }[]
  blendedReturnPercent: number
  depletedInYear: number | null
  startNetWorth: number
  endNetWorth: number
}

export interface Scenario {
  id: string
  name: string
  updatedAt: string
  plan: Plan
}

export interface ScenarioLibrary {
  version: 1
  activeId: string
  scenarios: Scenario[]
}
