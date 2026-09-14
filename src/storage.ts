import { createId } from './ids'
import { ageAtYearOffset, parseIsoDate, toIsoDate } from './dates'
import { createAccount, createDefaultPlan } from './defaultPlan'
import {
  DEFAULT_REPLENISH_YEARS,
  MAX_REPLENISH_YEARS,
  MIN_REPLENISH_YEARS,
} from './simulation'
import type {
  AccountKind,
  AccountTransfer,
  CashFlowSource,
  Plan,
  SavingsAccount,
  Scenario,
  ScenarioLibrary,
  ScheduleStep,
  Timing,
} from './types'

const STORAGE_KEY = 'retirement-predictor:plan'
const LIBRARY_KEY = 'retirement-predictor:scenarios'

const KINDS: AccountKind[] = [
  'shortTerm',
  'longTerm',
  'traditional401k',
  'rothIra',
  'traditionalIra',
  'sepIra',
]

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const next = Number(value)
    if (Number.isFinite(next)) return next
  }
  return null
}

function isTiming(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const timing = value as { type?: unknown; value?: unknown; date?: unknown }
  if (timing.type === 'now') return true
  if (timing.type === 'date' && typeof timing.date === 'string') return true
  return (
    (timing.type === 'yearsFromNow' || timing.type === 'age') &&
    coerceFiniteNumber(timing.value) != null
  )
}

function migrateTiming(value: unknown, currentAge: number | undefined): Timing {
  const timing = value as { type?: unknown; value?: unknown; date?: unknown }
  if (timing.type === 'now') return { type: 'now' }
  if (timing.type === 'date' && typeof timing.date === 'string') {
    return { type: 'date', date: timing.date }
  }
  const timingValue = coerceFiniteNumber(timing.value)
  if (timing.type === 'age' && timingValue != null) {
    const years =
      typeof currentAge === 'number' ? Math.max(0, timingValue - currentAge) : timingValue
    return { type: 'yearsFromNow', value: years }
  }
  if (timing.type === 'yearsFromNow' && timingValue != null) {
    return { type: 'yearsFromNow', value: timingValue }
  }
  return { type: 'now' }
}

function normalizeSourcesCandidate(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((source, sourceIndex) => {
    if (!source || typeof source !== 'object') return source
    const item = source as Record<string, unknown>
    const steps = Array.isArray(item.steps)
      ? item.steps.map((step) => {
          if (!step || typeof step !== 'object') return step
          const s = step as Record<string, unknown>
          const amount = coerceFiniteNumber(s.value)
          const growth = coerceFiniteNumber(s.annualGrowthPercent)
          return {
            ...s,
            id: typeof s.id === 'string' && s.id ? s.id : createId(),
            start: s.start && typeof s.start === 'object' ? s.start : { type: 'now' },
            valueType: s.valueType === 'relative' ? 'relative' : 'absolute',
            value: amount ?? 0,
            annualGrowthPercent: growth ?? 0,
          }
        })
      : []
    return {
      ...item,
      id: typeof item.id === 'string' && item.id ? item.id : createId(),
      name: typeof item.name === 'string' && item.name ? item.name : `Source ${sourceIndex + 1}`,
      steps,
    }
  })
}

function isSourceArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.every((source) => {
    if (!source || typeof source !== 'object') return false
    const item = source as { id?: unknown; name?: unknown; steps?: unknown }
    return (
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      Array.isArray(item.steps) &&
      item.steps.every((step) => {
        if (!step || typeof step !== 'object') return false
        const s = step as {
          id?: unknown
          start?: unknown
          valueType?: unknown
          value?: unknown
          annualGrowthPercent?: unknown
        }
        return (
          typeof s.id === 'string' &&
          isTiming(s.start) &&
          (s.valueType === 'absolute' || s.valueType === 'relative') &&
          typeof s.value === 'number' &&
          typeof s.annualGrowthPercent === 'number'
        )
      })
    )
  })
}

function normalizeAccountsCandidate(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((account, index) => {
    if (!account || typeof account !== 'object') return account
    const item = account as Record<string, unknown>
    const kind = KINDS.includes(item.kind as AccountKind) ? (item.kind as AccountKind) : 'longTerm'
    return {
      ...item,
      id: typeof item.id === 'string' && item.id ? item.id : createId(),
      kind,
      name: typeof item.name === 'string' ? item.name : `Account ${index + 1}`,
      amount: coerceFiniteNumber(item.amount) ?? 0,
      annualReturnPercent: coerceFiniteNumber(item.annualReturnPercent) ?? 6,
      taxRatePercent: coerceFiniteNumber(item.taxRatePercent) ?? (kind === 'rothIra' ? 0 : 15),
      depletionOrder: coerceFiniteNumber(item.depletionOrder) ?? index + 1,
    }
  })
}

function migrateSources(value: unknown, currentAge: number | undefined): CashFlowSource[] {
  if (!Array.isArray(value)) return []
  return value.map((source) => {
    const item = source as CashFlowSource
    return {
      id: item.id,
      name: item.name,
      disabled: item.disabled === true,
      steps: item.steps.map(
        (step): ScheduleStep => ({
          ...step,
          start: migrateTiming(step.start, currentAge),
          amountPeriod: step.amountPeriod === 'monthly' ? 'monthly' : 'annual',
          once: step.once === true,
        }),
      ),
    }
  })
}

function isAccount(value: unknown): value is SavingsAccount {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    KINDS.includes(item.kind as AccountKind) &&
    typeof item.name === 'string' &&
    typeof item.amount === 'number' &&
    typeof item.annualReturnPercent === 'number' &&
    typeof item.taxRatePercent === 'number' &&
    typeof item.depletionOrder === 'number'
  )
}

function migrateAccountTransfer(value: unknown): AccountTransfer | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  if (typeof item.targetAccountId !== 'string') return undefined
  return {
    enabled: item.enabled === true,
    durationYears:
      typeof item.durationYears === 'number' && item.durationYears > 0
        ? Math.round(item.durationYears)
        : 5,
    targetAccountId: item.targetAccountId,
    lockRefills: item.lockRefills === true,
    taxExempt: item.taxExempt === true,
  }
}

function migrateAccountReturnFields(account: SavingsAccount): Pick<
  SavingsAccount,
  'returnMode' | 'historicalPeriodId' | 'historicalStartYear'
> {
  const raw = account as unknown as Record<string, unknown>
  const periodId = typeof raw.historicalPeriodId === 'string' ? raw.historicalPeriodId : undefined
  const startYear =
    typeof raw.historicalStartYear === 'number' && Number.isFinite(raw.historicalStartYear)
      ? Math.round(raw.historicalStartYear)
      : undefined
  const mode =
    raw.returnMode === 'historical' && (startYear != null || periodId) ? 'historical' : 'flat'
  return {
    returnMode: mode,
    historicalPeriodId: mode === 'historical' ? periodId : undefined,
    historicalStartYear: mode === 'historical' ? startYear : undefined,
  }
}

function requiredAccounts(accounts: SavingsAccount[]): SavingsAccount[] {
  const next = [...accounts]
  const ensure = (kind: AccountKind) => {
    if (!next.some((account) => account.kind === kind)) {
      next.push(createAccount(kind))
    }
  }
  ensure('shortTerm')
  ensure('traditional401k')
  ensure('rothIra')
  ensure('traditionalIra')
  ensure('sepIra')
  if (!next.some((account) => account.kind === 'longTerm')) {
    next.push(createAccount('longTerm'))
  }
  const sep = next.find((account) => account.kind === 'sepIra')
  const normalized = next.map((account) => {
    const transfer = migrateAccountTransfer((account as unknown as Record<string, unknown>).transfer)
    const returnFields = migrateAccountReturnFields(account)
    if (account.kind === 'rothIra') {
      const order =
        sep && account.depletionOrder === sep.depletionOrder
          ? sep.depletionOrder + 1
          : account.depletionOrder
      return { ...account, taxRatePercent: 0, depletionOrder: order, transfer, ...returnFields }
    }
    return { ...account, transfer, ...returnFields }
  })
  return normalized
}

function accountsFromAllocations(plan: Record<string, unknown>): SavingsAccount[] {
  const currentNetWorth = typeof plan.currentNetWorth === 'number' ? plan.currentNetWorth : 0
  const allocations = Array.isArray(plan.allocations) ? plan.allocations : []
  const cashFlowPartId = typeof plan.cashFlowPartId === 'string' ? plan.cashFlowPartId : null
  const total = allocations.reduce((sum, part) => {
    const item = part as { percent?: unknown }
    return sum + (typeof item.percent === 'number' ? item.percent : 0)
  }, 0)

  const dollar = (percent: number) =>
    total > 0 ? currentNetWorth * (percent / total) : 0

  const cashFlow =
    allocations.find((part) => (part as { id?: unknown }).id === cashFlowPartId) ??
    allocations[0]
  const others = allocations.filter((part) => part !== cashFlow)

  const accounts: SavingsAccount[] = [
    createAccount('shortTerm', {
      name: 'Short-term wallet',
      amount: 0,
      annualReturnPercent: 2,
    }),
  ]

  const cashAmount =
    cashFlow && typeof (cashFlow as { percent?: unknown }).percent === 'number'
      ? dollar((cashFlow as { percent: number }).percent)
      : others.length === 0
        ? currentNetWorth
        : 0
  const cashReturn =
    cashFlow && typeof (cashFlow as { annualReturnPercent?: unknown }).annualReturnPercent ===
    'number'
      ? (cashFlow as { annualReturnPercent: number }).annualReturnPercent
      : 2

  if (cashAmount > 0 || others.length === 0) {
    accounts.push(
      createAccount('longTerm', {
        name:
          typeof (cashFlow as { name?: unknown } | undefined)?.name === 'string'
            ? (cashFlow as { name: string }).name
            : 'Long-term',
        amount: cashAmount,
        annualReturnPercent: cashReturn,
        depletionOrder: 1,
      }),
    )
  }

  others.forEach((part, index) => {
    const item = part as {
      name?: unknown
      percent?: unknown
      annualReturnPercent?: unknown
    }
    accounts.push(
      createAccount('longTerm', {
        name: typeof item.name === 'string' ? item.name : `Long-term ${index + 1}`,
        amount: typeof item.percent === 'number' ? dollar(item.percent) : 0,
        annualReturnPercent:
          typeof item.annualReturnPercent === 'number' ? item.annualReturnPercent : 6,
        depletionOrder: cashAmount > 0 || others.length === 0 ? index + 2 : index + 1,
      }),
    )
  })

  accounts.push(
    createAccount('traditional401k'),
    createAccount('rothIra'),
    createAccount('traditionalIra'),
    createAccount('sepIra'),
  )
  return requiredAccounts(accounts)
}

function birthDateFromCurrentAge(currentAge: number | undefined): string | null {
  if (typeof currentAge !== 'number' || currentAge < 0 || currentAge > 120) return null
  const today = new Date()
  today.setFullYear(today.getFullYear() - Math.floor(currentAge))
  return toIsoDate(today)
}

export function coercePlan(value: unknown): Plan | null {
  if (!value || typeof value !== 'object') return null
  const plan = value as Record<string, unknown>
  const incomeSources = normalizeSourcesCandidate(plan.incomeSources)
  const expenseSources = normalizeSourcesCandidate(plan.expenseSources)
  if (!isSourceArray(incomeSources) || !isSourceArray(expenseSources)) return null

  const currentAge = coerceFiniteNumber(plan.currentAge) ?? undefined
  const birthDate =
    typeof plan.birthDate === 'string' && parseIsoDate(plan.birthDate)
      ? plan.birthDate
      : birthDateFromCurrentAge(currentAge)
  const ageToday = birthDate ? ageAtYearOffset(birthDate, 0) : currentAge
  const yearsToProject = coerceFiniteNumber(plan.yearsToProject)
  const planUntilAgeRaw = coerceFiniteNumber(plan.planUntilAge)
  const years =
    yearsToProject != null
      ? yearsToProject
      : planUntilAgeRaw != null && typeof ageToday === 'number'
        ? Math.max(1, planUntilAgeRaw - ageToday)
        : 40
  const planUntilAge =
    planUntilAgeRaw != null && planUntilAgeRaw > 0
      ? Math.floor(planUntilAgeRaw)
      : typeof ageToday === 'number'
        ? ageToday + years
        : 90

  const normalizedAccounts = normalizeAccountsCandidate(plan.accounts)
  const accounts =
    Array.isArray(normalizedAccounts) && normalizedAccounts.every(isAccount)
      ? requiredAccounts(normalizedAccounts)
      : coerceFiniteNumber(plan.currentNetWorth) != null || Array.isArray(plan.allocations)
        ? accountsFromAllocations(plan)
        : null
  if (!accounts) return null

  const replenishRaw = coerceFiniteNumber(plan.replenishYears)
  const replenishYears =
    replenishRaw != null
      ? Math.min(MAX_REPLENISH_YEARS, Math.max(MIN_REPLENISH_YEARS, Math.floor(replenishRaw)))
      : DEFAULT_REPLENISH_YEARS

  const growthPercent = coerceFiniteNumber(plan.replenishGrowthPercent)
  const waitModeRaw = plan.replenishWaitMode
  const replenishWaitMode =
    waitModeRaw === 'yoyGrowth' || waitModeRaw === 'recoverHigh' || waitModeRaw === 'off'
      ? waitModeRaw
      : plan.replenishOnHighRiskGrowth === true
        ? 'yoyGrowth'
        : 'off'

  return {
    version: 16,
    birthDate,
    planUntilAge,
    replenishYears,
    keepWalletFull: plan.keepWalletFull === true,
    replenishWaitMode,
    replenishGrowthPercent:
      growthPercent != null ? Math.min(50, Math.max(0, growthPercent)) : 5,
    accounts,
    incomeSources: migrateSources(incomeSources, currentAge),
    expenseSources: migrateSources(expenseSources, currentAge),
  }
}

export function isPlan(value: unknown): value is Plan {
  return coercePlan(value) !== null
}

export function loadPlan(): Plan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultPlan()
    const parsed: unknown = JSON.parse(raw)
    return coercePlan(parsed) ?? createDefaultPlan()
  } catch {
    return createDefaultPlan()
  }
}

export function savePlan(plan: Plan): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
}

export function parsePlanJson(text: string): Plan {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new Error(
      cause instanceof SyntaxError ? `Invalid JSON: ${cause.message}` : 'Could not parse JSON.',
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON must be a plan object (with accounts, incomeSources, expenseSources).')
  }

  const root = parsed as Record<string, unknown>

  if (Array.isArray(root.scenarios)) {
    const library = coerceLibrary(parsed)
    if (library) return activeScenario(library).plan
    throw new Error('Scenario library JSON could not be read. Check each scenario plan.')
  }

  if (root.plan && typeof root.plan === 'object' && !Array.isArray(root.plan)) {
    const nested = coercePlan(root.plan)
    if (nested) return nested
  }

  const next = coercePlan(parsed)
  if (!next) {
    const incomeSources = normalizeSourcesCandidate(root.incomeSources)
    const expenseSources = normalizeSourcesCandidate(root.expenseSources)
    const accounts = normalizeAccountsCandidate(root.accounts)
    if (!isSourceArray(incomeSources)) {
      throw new Error('incomeSources is missing or invalid.')
    }
    if (!isSourceArray(expenseSources)) {
      throw new Error('expenseSources is missing or invalid.')
    }
    if (!Array.isArray(accounts) || !accounts.every(isAccount)) {
      throw new Error(
        'accounts is missing or invalid. Each account needs id, kind, name, amount, annualReturnPercent, taxRatePercent, and depletionOrder.',
      )
    }
    throw new Error('JSON does not match the retirement plan format.')
  }
  return next
}

export function clonePlan(plan: Plan): Plan {
  return coercePlan(JSON.parse(JSON.stringify(plan))) ?? createDefaultPlan()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function createScenario(name: string, plan: Plan): Scenario {
  return {
    id: createId(),
    name: normalizeScenarioName(name),
    updatedAt: nowIso(),
    plan: clonePlan(plan),
  }
}

export function uniqueScenarioName(library: ScenarioLibrary, base: string): string {
  const trimmed = normalizeScenarioName(base)
  const names = new Set(library.scenarios.map((scenario) => scenario.name.toLowerCase()))
  if (!names.has(trimmed.toLowerCase())) return trimmed
  for (let n = 2; n < 1000; n += 1) {
    const next = `${trimmed} ${n}`
    if (!names.has(next.toLowerCase())) return next
  }
  return `${trimmed} ${createId().slice(0, 8)}`
}

export function normalizeScenarioName(name: string): string {
  const trimmed = name.trim()
  return trimmed || 'Untitled'
}

export function activeScenario(library: ScenarioLibrary): Scenario {
  return library.scenarios.find((scenario) => scenario.id === library.activeId) ?? library.scenarios[0]
}

export function withActivePlan(library: ScenarioLibrary, plan: Plan): ScenarioLibrary {
  const active = activeScenario(library)
  return {
    ...library,
    scenarios: library.scenarios.map((scenario) =>
      scenario.id === active.id ? { ...scenario, plan, updatedAt: nowIso() } : scenario,
    ),
  }
}

function coerceScenario(value: unknown): Scenario | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const plan = coercePlan(item.plan)
  if (!plan || typeof item.id !== 'string' || typeof item.name !== 'string') return null
  return {
    id: item.id,
    name: normalizeScenarioName(item.name),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso(),
    plan,
  }
}

export function coerceLibrary(value: unknown): ScenarioLibrary | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (!Array.isArray(item.scenarios)) return null
  const scenarios = item.scenarios.map(coerceScenario).filter((scenario): scenario is Scenario => scenario != null)
  if (scenarios.length === 0) return null
  const activeId =
    typeof item.activeId === 'string' && scenarios.some((scenario) => scenario.id === item.activeId)
      ? item.activeId
      : scenarios[0].id
  return { version: 1, activeId, scenarios }
}

function libraryFromPlan(plan: Plan, name = 'Base'): ScenarioLibrary {
  const scenario = createScenario(name, plan)
  return { version: 1, activeId: scenario.id, scenarios: [scenario] }
}

export function loadLibrary(): ScenarioLibrary {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (raw) {
      const parsed = coerceLibrary(JSON.parse(raw) as unknown)
      if (parsed) return parsed
    }
  } catch {
    // Fall through to the single-plan key.
  }
  return libraryFromPlan(loadPlan())
}

export function saveLibrary(library: ScenarioLibrary): void {
  const active = activeScenario(library)
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
  savePlan(active.plan)
}
