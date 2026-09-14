import { ageAtYearOffset, yearsFromToday } from './dates'
import { resolveAccountReturnPath } from './marketHistory'
import { requiredMinimumDistribution, rmdStartAge } from './rmd'
import type {
  AccountKind,
  AccountMove,
  AccountTransfer,
  CashFlowSource,
  NamedAmount,
  Plan,
  Projection,
  ReplenishWaitMode,
  SavingsAccount,
  ScheduleStep,
  Timing,
  YearProjection,
} from './types'

export const DEFAULT_REPLENISH_YEARS = 10
export const MIN_REPLENISH_YEARS = 1
export const MAX_REPLENISH_YEARS = 40

/** Years of spending minus income to hold in the wallet. Default 10. */
export function replenishYears(plan: Pick<Plan, 'replenishYears'>): number {
  const raw = Math.floor(plan.replenishYears)
  if (!Number.isFinite(raw)) return DEFAULT_REPLENISH_YEARS
  return Math.min(MAX_REPLENISH_YEARS, Math.max(MIN_REPLENISH_YEARS, raw))
}

export function keepWalletFull(plan: Pick<Plan, 'keepWalletFull'>): boolean {
  return plan.keepWalletFull === true
}

export function replenishWaitMode(
  plan: Pick<Plan, 'replenishWaitMode'> & { replenishOnHighRiskGrowth?: boolean },
): ReplenishWaitMode {
  const mode = plan.replenishWaitMode
  if (mode === 'off' || mode === 'yoyGrowth' || mode === 'recoverHigh') return mode
  return plan.replenishOnHighRiskGrowth === true ? 'yoyGrowth' : 'off'
}

/** @deprecated Prefer replenishWaitMode — true when mode is yoyGrowth. */
export function replenishOnHighRiskGrowth(
  plan: Pick<Plan, 'replenishWaitMode'> & { replenishOnHighRiskGrowth?: boolean },
): boolean {
  return replenishWaitMode(plan) === 'yoyGrowth'
}

export const DEFAULT_REPLENISH_GROWTH_PERCENT = 5
export const MIN_REPLENISH_GROWTH_PERCENT = 0
export const MAX_REPLENISH_GROWTH_PERCENT = 50

export function replenishGrowthPercent(
  plan: Pick<Plan, 'replenishGrowthPercent'>,
): number {
  const raw = plan.replenishGrowthPercent
  if (!Number.isFinite(raw)) return DEFAULT_REPLENISH_GROWTH_PERCENT
  return Math.min(MAX_REPLENISH_GROWTH_PERCENT, Math.max(MIN_REPLENISH_GROWTH_PERCENT, raw))
}

export function cycleReplenishWaitMode(mode: ReplenishWaitMode): ReplenishWaitMode {
  if (mode === 'off') return 'yoyGrowth'
  if (mode === 'yoyGrowth') return 'recoverHigh'
  return 'off'
}

export function replenishWaitModeLabel(mode: ReplenishWaitMode): string {
  switch (mode) {
    case 'yoyGrowth':
      return 'Wait for YoY growth'
    case 'recoverHigh':
      return 'Wait for recovery to peak'
    default:
      return 'Off · refill on schedule'
  }
}

export function replenishWaitModeOrdinal(mode: ReplenishWaitMode): string {
  switch (mode) {
    case 'off':
      return '1/3'
    case 'yoyGrowth':
      return '2/3'
    case 'recoverHigh':
      return '3/3'
  }
}

export const RMD_KINDS: AccountKind[] = ['traditional401k', 'traditionalIra', 'sepIra']

export function timingToYearOffset(timing: Timing): number {
  if (timing.type === 'now') return 0
  if (timing.type === 'yearsFromNow') return Math.max(0, timing.value)
  return yearsFromToday(timing.date)
}

export function originalAnnualAmount(source: CashFlowSource): number {
  const ordered = [...source.steps].sort(
    (a, b) => timingToYearOffset(a.start) - timingToYearOffset(b.start),
  )
  const firstAbsolute =
    ordered.find((step) => step.valueType === 'absolute' && !step.once) ??
    ordered.find((step) => step.valueType === 'absolute')
  return firstAbsolute ? toAnnualAmount(firstAbsolute, 0) : 0
}

export function toAnnualAmount(step: ScheduleStep, originalAnnual: number): number {
  if (step.valueType === 'relative') return originalAnnual * (step.value / 100)
  if (!step.once && step.amountPeriod === 'monthly') return step.value * 12
  return step.value
}

function firstYearOfStep(startYear: number): number {
  return Math.max(0, Math.ceil(startYear - 1e-12))
}

export function sourceAmountInYear(source: CashFlowSource, yearOffset: number): number {
  if (source.disabled) return 0
  if (source.steps.length === 0) return 0

  const original = originalAnnualAmount(source)
  const resolved = source.steps
    .map((step) => ({
      step,
      startYear: timingToYearOffset(step.start),
    }))
    .sort((a, b) => a.startYear - b.startYear)

  let onceAmount = 0
  let ongoing: { step: ScheduleStep; startYear: number } | null = null
  for (const item of resolved) {
    if (item.startYear > yearOffset) break
    if (item.step.once) {
      if (firstYearOfStep(item.startYear) === yearOffset) {
        onceAmount += toAnnualAmount(item.step, original)
      }
      continue
    }
    ongoing = item
  }

  if (!ongoing) return onceAmount

  const yearsIntoPeriod = yearOffset - ongoing.startYear
  const startAmount = toAnnualAmount(ongoing.step, original)
  const growth = ongoing.step.annualGrowthPercent / 100
  return onceAmount + startAmount * (1 + growth) ** yearsIntoPeriod
}

export function totalForSources(sources: CashFlowSource[], yearOffset: number): number {
  return sources.reduce((sum, source) => sum + sourceAmountInYear(source, yearOffset), 0)
}

export function itemizeSources(sources: CashFlowSource[], yearOffset: number): NamedAmount[] {
  return sources
    .filter((source) => !source.disabled)
    .map((source) => {
      const amount = sourceAmountInYear(source, yearOffset)
      return {
        id: source.id,
        name: source.name.trim() || 'Untitled',
        amount,
      }
    })
}

export function currentNetWorth(plan: Plan): number {
  return (plan.accounts ?? []).reduce((sum, account) => sum + Math.max(0, account.amount), 0)
}

export function blendedReturnPercent(accounts: SavingsAccount[], simulationYears?: number): number {
  const total = accounts.reduce((sum, account) => sum + Math.max(0, account.amount), 0)
  if (total <= 0) return 0
  return accounts.reduce((sum, account) => {
    const weight = Math.max(0, account.amount) / total
    const rate =
      account.returnMode === 'historical' && simulationYears != null
        ? (resolveAccountReturnPath(account, simulationYears)?.cagrPercent ??
          account.annualReturnPercent)
        : account.annualReturnPercent
    return sum + rate * weight
  }, 0)
}

export function yearsToProject(plan: Plan): number {
  const age = plan.birthDate ? ageAtYearOffset(plan.birthDate, 0) : null
  if (age == null) return 40
  return Math.max(1, Math.min(80, Math.floor(plan.planUntilAge) - age))
}

/** Age in a projection year. Uses date of birth, or plan-until-age minus the window if none is set. */
export function ageAtPlanYear(plan: Plan, yearOffset: number): number | null {
  if (plan.birthDate) return ageAtYearOffset(plan.birthDate, yearOffset)
  const years = yearsToProject(plan)
  const startAge = Math.floor(plan.planUntilAge) - years
  if (startAge < 0 || startAge > 120) return null
  return startAge + yearOffset
}

export function taxRateForSale(account: Pick<SavingsAccount, 'kind' | 'taxRatePercent'>): number {
  if (account.kind === 'rothIra') return 0
  return Math.min(0.99, Math.max(0, account.taxRatePercent / 100))
}

type AccountState = {
  id: string
  kind: AccountKind
  name: string
  amount: number
  /** Flat rate used when historicalReturns is null */
  returnRate: number
  /** Year-by-year % returns for simulation years 1..N when historical mode is on */
  historicalReturns: number[] | null
  taxRatePercent: number
  depletionOrder: number
  transfer?: AccountTransfer
}

function startingAccounts(plan: Plan): AccountState[] {
  const years = yearsToProject(plan)
  return (plan.accounts ?? []).map((account) => {
    const historical =
      account.returnMode === 'historical' ? resolveAccountReturnPath(account, years) : null
    return {
      id: account.id,
      kind: account.kind,
      name: account.name.trim() || labelForKind(account.kind),
      amount: Math.max(0, account.amount),
      returnRate: account.annualReturnPercent / 100,
      historicalReturns: historical ? historical.returns : null,
      taxRatePercent: account.kind === 'rothIra' ? 0 : account.taxRatePercent,
      depletionOrder: account.depletionOrder,
      transfer: account.transfer,
    }
  })
}

export function labelForKind(kind: AccountKind): string {
  switch (kind) {
    case 'shortTerm':
      return 'Short-term wallet'
    case 'longTerm':
      return 'Long-term'
    case 'traditional401k':
      return '401(k)'
    case 'rothIra':
      return 'Roth IRA'
    case 'traditionalIra':
      return 'Traditional IRA'
    case 'sepIra':
      return 'SEP IRA'
  }
}

export function accountHasRmd(kind: AccountKind): boolean {
  return RMD_KINDS.includes(kind)
}

export function isRetirementAccount(kind: AccountKind): boolean {
  return (
    kind === 'traditional401k' ||
    kind === 'rothIra' ||
    kind === 'traditionalIra' ||
    kind === 'sepIra'
  )
}

export function isWalletAccount(account: { kind: AccountKind; name: string }): boolean {
  if (account.kind === 'shortTerm') return true
  return /wallet|short\s*-?\s*term/i.test(account.name)
}

export function foldWalletIntoFirstSource(accounts: SavingsAccount[]): SavingsAccount[] {
  return accounts
}

function compareReplenish<T extends { kind: AccountKind; depletionOrder: number; name: string }>(
  a: T,
  b: T,
): number {
  const byGroup = Number(isRetirementAccount(a.kind)) - Number(isRetirementAccount(b.kind))
  if (byGroup !== 0) return byGroup
  return a.depletionOrder - b.depletionOrder || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind)
}

export function replenishableAccounts<T extends { kind: AccountKind; depletionOrder: number; name: string }>(
  accounts: T[],
): T[] {
  return accounts.filter((account) => account.kind !== 'shortTerm').sort(compareReplenish)
}

function wallet(accounts: AccountState[]): AccountState {
  return accounts.find((account) => account.kind === 'shortTerm') ?? accounts[0]
}

/** Accounts eligible to sell for wallet refills (excludes duration/transfer accounts). */
function sellOrder(accounts: AccountState[]): AccountState[] {
  return replenishableAccounts(accounts).filter((account) => !account.transfer?.enabled)
}

function primarySource(accounts: AccountState[]): AccountState {
  const longTerm = accounts
    .filter((account) => account.kind === 'longTerm')
    .sort((a, b) => a.depletionOrder - b.depletionOrder || a.name.localeCompare(b.name))
  return longTerm[0] ?? wallet(accounts)
}

function snapshotParts(accounts: AccountState[]): Record<string, number> {
  return Object.fromEntries(accounts.map((account) => [account.id, account.amount]))
}

function totalOf(accounts: AccountState[]): number {
  return accounts.reduce((sum, account) => sum + account.amount, 0)
}

function yearCashFlows(plan: Plan, yearOffset: number) {
  const incomeItems = itemizeSources(plan.incomeSources, yearOffset)
  const expenseItems = itemizeSources(plan.expenseSources, yearOffset)
  return {
    incomeItems,
    expenseItems,
    income: incomeItems.reduce((sum, item) => sum + item.amount, 0),
    expenses: expenseItems.reduce((sum, item) => sum + item.amount, 0),
  }
}

function spendingNeed(plan: Plan, yearOffset: number): number {
  const flows = yearCashFlows(plan, yearOffset)
  return Math.max(0, flows.expenses - flows.income)
}

export function replenishSpendingNeed(plan: Plan, fromYear: number): number {
  const lastYear = yearsToProject(plan)
  const windowYears = replenishYears(plan)
  let total = 0
  for (let year = fromYear; year < fromYear + windowYears && year <= lastYear; year += 1) {
    total += spendingNeed(plan, year)
  }
  return total
}

function emptyTransfer(): { net: number; tax: number; moves: AccountMove[] } {
  return { net: 0, tax: 0, moves: [] }
}

function sellForNet(
  accounts: AccountState[],
  dest: AccountState,
  netNeeded: number,
  yearOffset = 0,
): { net: number; tax: number; moves: AccountMove[] } {
  let remaining = netNeeded
  let tax = 0
  let net = 0
  const moves: AccountMove[] = []
  if (remaining <= 0) return { net, tax, moves }

  for (const source of sellOrder(accounts)) {
    if (remaining <= 0.005) break
    if (source.amount <= 0) continue
    if (
      source.transfer?.enabled &&
      yearOffset < source.transfer.durationYears
    ) {
      continue
    }
    const rate = taxRateForSale(source)
    const grossWanted = rate >= 0.999 ? source.amount : remaining / (1 - rate)
    const sold = Math.min(source.amount, grossWanted)
    const soldTax = sold * rate
    const soldNet = sold - soldTax
    source.amount -= sold
    tax += soldTax
    net += soldNet
    remaining -= soldNet
    if (sold > 0.005) {
      moves.push({
        fromId: source.id,
        fromName: source.name,
        toId: dest.id,
        toName: dest.name,
        sold,
        tax: soldTax,
        net: soldNet,
        reason: 'sale',
      })
    }
  }

  return { net, tax, moves }
}

function topUpWalletWindow(
  plan: Plan,
  accounts: AccountState[],
  afterYear: number,
  previousBalances: Record<string, number>,
  highWaterMark: number,
): { tax: number; net: number; moves: AccountMove[] } {
  if (!keepWalletFull(plan)) return emptyTransfer()
  const nextYear = afterYear + 1
  if (nextYear > yearsToProject(plan)) return emptyTransfer()
  if (!mayOptionallyReplenish(plan, accounts, previousBalances, highWaterMark)) {
    return emptyTransfer()
  }
  return refillWallet(plan, accounts, nextYear)
}

function refillWallet(
  plan: Plan,
  accounts: AccountState[],
  fromYear: number,
): { tax: number; net: number; moves: AccountMove[] } {
  const target = replenishSpendingNeed(plan, fromYear)
  const short = wallet(accounts)
  const gap = target - short.amount
  if (gap <= 0.005) return emptyTransfer()
  const sold = sellForNet(accounts, short, gap, fromYear)
  short.amount += sold.net
  return sold
}

/**
 * Optional cadence / keep-full refills. Required empty-wallet sells always run in spendFromWallet.
 * - yoyGrowth: primary long-term must be up ≥ replenishGrowthPercent vs last year
 * - recoverHigh: primary long-term must be at/above its prior peak (recovery after a drop)
 */
function mayOptionallyReplenish(
  plan: Plan,
  accounts: AccountState[],
  previousBalances: Record<string, number>,
  highWaterMark: number,
): boolean {
  const mode = replenishWaitMode(plan)
  if (mode === 'off') return true
  const high = primarySource(accounts)
  if (mode === 'recoverHigh') {
    return high.amount + 0.005 >= highWaterMark
  }
  const prev = previousBalances[high.id]
  if (prev == null || prev <= 0.005) return high.amount > 0.005
  const need = 1 + replenishGrowthPercent(plan) / 100
  return high.amount + 0.005 >= prev * need
}

function spendFromWallet(
  _plan: Plan,
  accounts: AccountState[],
  yearOffset: number,
  flows: ReturnType<typeof yearCashFlows>,
): { paid: number; taxesPaid: number; walletRefill: number; accountMoves: AccountMove[] } {
  const need = Math.max(0, flows.expenses - flows.income)
  let taxesPaid = 0
  let walletRefill = 0
  const accountMoves: AccountMove[] = []
  const short = wallet(accounts)
  if (short.amount + 0.01 < need) {
    const gap = need - short.amount
    const refilled = sellForNet(accounts, short, gap, yearOffset)
    taxesPaid += refilled.tax
    walletRefill += refilled.net
    short.amount += refilled.net
    accountMoves.push(...refilled.moves)
  }
  const paid = Math.min(need, Math.max(0, wallet(accounts).amount))
  wallet(accounts).amount -= paid
  return { paid, taxesPaid, walletRefill, accountMoves }
}

export function openingWalletFunding(plan: Plan): {
  need: number
  filled: number
  tax: number
  moves: AccountMove[]
} {
  const accounts = startingAccounts(plan)
  const short = wallet(accounts)
  const need = spendingNeed(plan, 0)
  if (short.amount >= need) {
    return { need, filled: 0, tax: 0, moves: [] }
  }
  const gap = need - short.amount
  const sold = sellForNet(accounts, short, gap, 0)
  return {
    need,
    filled: sold.net,
    tax: sold.tax,
    moves: sold.moves,
  }
}

/**
 * How much to sell today to put a full replenishYears window of spending−income
 * into the active wallet (after tax). Used for Instructions / funding guidance.
 */
export function walletWindowFunding(plan: Plan): {
  windowYears: number
  target: number
  walletNow: number
  gap: number
  filled: number
  tax: number
  shortfall: number
  moves: AccountMove[]
} {
  const accounts = startingAccounts(plan)
  const short = wallet(accounts)
  const windowYears = replenishYears(plan)
  const target = replenishSpendingNeed(plan, 0)
  const walletNow = short.amount
  const gap = Math.max(0, target - walletNow)
  if (gap <= 0.005) {
    return {
      windowYears,
      target,
      walletNow,
      gap: 0,
      filled: 0,
      tax: 0,
      shortfall: 0,
      moves: [],
    }
  }
  const sold = sellForNet(accounts, short, gap, 0)
  return {
    windowYears,
    target,
    walletNow,
    gap,
    filled: sold.net,
    tax: sold.tax,
    shortfall: Math.max(0, gap - sold.net),
    moves: sold.moves,
  }
}

function applyRmds(
  accounts: AccountState[],
  priorBalances: Record<string, number>,
  age: number | null,
  startAge: number,
): { transferred: number; tax: number; moves: AccountMove[] } {
  if (age == null || age < startAge) return { transferred: 0, tax: 0, moves: [] }
  const dest = primarySource(accounts)
  let transferred = 0
  let tax = 0
  const moves: AccountMove[] = []
  for (const kind of RMD_KINDS) {
    for (const account of accounts.filter((item) => item.kind === kind)) {
      if (account.id === dest.id) continue
      const rmd = requiredMinimumDistribution(priorBalances[account.id] ?? 0, age)
      const taken = Math.min(account.amount, rmd)
      if (taken <= 0.005) continue
      const rate = taxRateForSale(account)
      const soldTax = taken * rate
      const soldNet = taken - soldTax
      account.amount -= taken
      dest.amount += soldNet
      transferred += taken
      tax += soldTax
      moves.push({
        fromId: account.id,
        fromName: account.name,
        toId: dest.id,
        toName: dest.name,
        sold: taken,
        tax: soldTax,
        net: soldNet,
        reason: 'rmd',
      })
    }
  }
  return { transferred, tax, moves }
}

function returnRateForYear(account: AccountState, yearOffset: number): number {
  if (account.historicalReturns && yearOffset >= 1) {
    const pct = account.historicalReturns[yearOffset - 1]
    if (pct != null) return pct / 100
  }
  return account.returnRate
}

function snapshotGrowth(accounts: AccountState[], yearOffset: number): Record<string, number> {
  return Object.fromEntries(
    accounts.map((account) => [
      account.id,
      account.amount * returnRateForYear(account, yearOffset),
    ]),
  )
}

function snapshotChange(
  previous: Record<string, number>,
  next: Record<string, number>,
): Record<string, number> {
  const ids = new Set([...Object.keys(previous), ...Object.keys(next)])
  return Object.fromEntries(
    [...ids].map((id) => [id, (next[id] ?? 0) - (previous[id] ?? 0)]),
  )
}

function pointFrom(
  yearOffset: number,
  accounts: AccountState[],
  extras: Omit<YearProjection, 'yearOffset' | 'age' | 'netWorth' | 'parts'>,
  plan: Plan,
): YearProjection {
  return {
    yearOffset,
    age: ageAtPlanYear(plan, yearOffset),
    netWorth: totalOf(accounts),
    parts: snapshotParts(accounts),
    ...extras,
  }
}

function applyAccountTransfers(
  accounts: AccountState[],
  yearOffset: number,
): { tax: number; transferred: number; moves: AccountMove[] } {
  let tax = 0
  let transferred = 0
  const moves: AccountMove[] = []

  for (const account of accounts) {
    if (!account.transfer?.enabled) continue
    if (account.transfer.durationYears !== yearOffset) continue
    if (account.amount <= 0.005) continue

    const dest =
      accounts.find((a) => a.id === account.transfer?.targetAccountId && a.id !== account.id) ??
      accounts.find((a) => a.kind === 'longTerm' && a.id !== account.id) ??
      accounts.find((a) => a.id !== account.id)

    if (!dest) continue

    const sold = account.amount
    const rate = account.transfer.taxExempt ? 0 : taxRateForSale(account)
    const moveTax = sold * rate
    const moveNet = sold - moveTax

    account.amount = 0
    dest.amount += moveNet
    tax += moveTax
    transferred += sold

    moves.push({
      fromId: account.id,
      fromName: account.name,
      toId: dest.id,
      toName: dest.name,
      sold,
      tax: moveTax,
      net: moveNet,
      reason: 'transfer',
    })
  }

  return { tax, transferred, moves }
}

export function simulate(plan: Plan): Projection {
  const years = yearsToProject(plan)
  const accounts = startingAccounts(plan)
  const points: YearProjection[] = []
  const startAge = rmdStartAge(plan.birthDate)
  let depletedInYear: number | null = totalOf(accounts) <= 0 ? 0 : null
  let highWaterMark = primarySource(accounts).amount

  const beforeOpen = snapshotParts(accounts)
  const ageToday = ageAtPlanYear(plan, 0)
  const openingTransfers = applyAccountTransfers(accounts, 0)
  const openingRmd = applyRmds(accounts, beforeOpen, ageToday, startAge)
  const startFlows = yearCashFlows(plan, 0)
  const zeroByPart = Object.fromEntries(accounts.map((account) => [account.id, 0]))
  const opened = spendFromWallet(plan, accounts, 0, startFlows)

  for (const account of accounts) {
    account.amount = Math.max(0, account.amount)
  }
  if (totalOf(accounts) <= 0 && depletedInYear === null) {
    depletedInYear = 0
  }
  highWaterMark = Math.max(highWaterMark, primarySource(accounts).amount)

  points.push(
    pointFrom(
      0,
      accounts,
      {
        ...startFlows,
        growth: 0,
        cashFlow: -opened.paid,
        taxesPaid: openingTransfers.tax + openingRmd.tax + opened.taxesPaid,
        rmdTransferred: openingRmd.transferred,
        walletRefill: opened.walletRefill,
        accountMoves: [
          ...openingTransfers.moves,
          ...openingRmd.moves,
          ...opened.accountMoves,
        ],
        partGrowth: zeroByPart,
        partChange: snapshotChange(beforeOpen, snapshotParts(accounts)),
      },
      plan,
    ),
  )

  for (let yearOffset = 1; yearOffset <= years; yearOffset += 1) {
    const previous = snapshotParts(accounts)
    const age = ageAtPlanYear(plan, yearOffset)
    const rmd = applyRmds(accounts, previous, age, startAge)
    const accountMoves: AccountMove[] = [...rmd.moves]

    const partGrowth = snapshotGrowth(accounts, yearOffset)
    const growth = Object.values(partGrowth).reduce((sum, value) => sum + value, 0)
    for (const account of accounts) {
      account.amount += partGrowth[account.id] ?? 0
    }

    const transfers = applyAccountTransfers(accounts, yearOffset)
    accountMoves.push(...transfers.moves)

    // Peak for recovery mode: post-growth / post-transfer, before optional sells.
    const markBalance = primarySource(accounts).amount

    let taxesPaid = rmd.tax + transfers.tax
    let walletRefill = 0
    if (
      !keepWalletFull(plan) &&
      yearOffset % replenishYears(plan) === 0 &&
      mayOptionallyReplenish(plan, accounts, previous, highWaterMark)
    ) {
      const refilled = refillWallet(plan, accounts, yearOffset)
      taxesPaid += refilled.tax
      walletRefill += refilled.net
      accountMoves.push(...refilled.moves)
    }

    const flows = yearCashFlows(plan, yearOffset)
    const spent = spendFromWallet(plan, accounts, yearOffset, flows)
    taxesPaid += spent.taxesPaid
    walletRefill += spent.walletRefill
    accountMoves.push(...spent.accountMoves)

    const topped = topUpWalletWindow(plan, accounts, yearOffset, previous, highWaterMark)
    taxesPaid += topped.tax
    walletRefill += topped.net
    accountMoves.push(...topped.moves)

    highWaterMark = Math.max(highWaterMark, markBalance)

    for (const account of accounts) {
      account.amount = Math.max(0, account.amount)
    }

    if (totalOf(accounts) <= 0 && depletedInYear === null) {
      depletedInYear = yearOffset
    }

    points.push(
      pointFrom(
        yearOffset,
        accounts,
        {
          ...flows,
          growth,
          cashFlow: -spent.paid,
          taxesPaid,
          rmdTransferred: rmd.transferred,
          walletRefill,
          accountMoves,
          partGrowth,
          partChange: snapshotChange(previous, snapshotParts(accounts)),
        },
        plan,
      ),
    )
  }

  const last = points[points.length - 1]

  return {
    points,
    parts: accounts.map((account) => ({ id: account.id, name: account.name, kind: account.kind })),
    blendedReturnPercent: blendedReturnPercent(plan.accounts ?? [], years),
    depletedInYear,
    startNetWorth: currentNetWorth(plan),
    endNetWorth: last?.netWorth ?? currentNetWorth(plan),
  }
}

export type FirstRmd = {
  yearOffset: number
  age: number | null
  move: AccountMove
}

/** First RMD sale recorded for each 401(k) / Traditional IRA / SEP IRA. */
export function firstRmdByAccount(projection: Projection): Map<string, FirstRmd> {
  const found = new Map<string, FirstRmd>()
  for (const point of projection.points) {
    for (const move of point.accountMoves ?? []) {
      if (move.reason !== 'rmd' || found.has(move.fromId)) continue
      found.set(move.fromId, { yearOffset: point.yearOffset, age: point.age, move })
    }
  }
  return found
}
