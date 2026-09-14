import {
  ageAtYearOffset,
  calendarYearAtOffset,
  formatLongDate,
  parseIsoDate,
} from './dates'
import { formatPercent, usd } from './format'
import { currentNetWorth, originalAnnualAmount, timingToYearOffset, toAnnualAmount, yearsToProject, ageAtPlanYear } from './simulation'
import { rmdStartAge } from './rmd'
import type { CashFlowSource, Plan, Projection, ScheduleStep, Timing } from './types'

export type TimelineKind = 'start' | 'income' | 'expense' | 'transfer' | 'rmd' | 'depleted' | 'horizon'

export interface TimelineEvent {
  id: string
  yearOffset: number
  calendarYear: number
  age: number | null
  whenLabel: string
  kind: TimelineKind
  title: string
  detail: string
}

export interface TimelineGroup {
  calendarYear: number
  yearOffset: number
  age: number | null
  heading: string
  events: TimelineEvent[]
}

const KIND_ORDER: Record<TimelineKind, number> = {
  start: 0,
  income: 1,
  expense: 2,
  transfer: 3,
  rmd: 4,
  depleted: 5,
  horizon: 6,
}

export function formatWhen(timing: Timing): string {
  if (timing.type === 'now') return 'today'
  if (timing.type === 'yearsFromNow') return formatYearsFromNow(timing.value)
  return formatLongDate(timing.date)
}

export function describeStepAmount(step: ScheduleStep, source: CashFlowSource): string {
  const original = originalAnnualAmount(source)
  const annual = toAnnualAmount(step, original)
  if (step.once) {
    if (step.valueType === 'relative') {
      return `one-time ${formatPercent(step.value, 0)} of the original amount (${usd.format(annual)})`
    }
    return `one-time ${usd.format(annual)}`
  }
  if (step.valueType === 'relative') {
    return `${formatPercent(step.value, 0)} of the original amount (${usd.format(annual)} per year)`
  }
  if (step.amountPeriod === 'monthly') {
    return `${usd.format(step.value)} per month (${usd.format(annual)} per year)`
  }
  return `${usd.format(annual)} per year`
}

export function describeStepGrowth(step: ScheduleStep): string {
  if (step.once) return 'paid once'
  if (step.annualGrowthPercent === 0) return 'no yearly change'
  const signed =
    step.annualGrowthPercent > 0
      ? `+${formatPercent(step.annualGrowthPercent, 1)}`
      : formatPercent(step.annualGrowthPercent, 1)
  return `${signed} each year`
}

export function describeStep(step: ScheduleStep, source: CashFlowSource): string {
  return `${describeStepAmount(step, source)}, ${describeStepGrowth(step)}`
}

export function collectTimelineEvents(plan: Plan, projection: Projection): TimelineEvent[] {
  const birthDate = plan.birthDate
  const events: TimelineEvent[] = [
    {
      id: 'plan-start',
      yearOffset: 0,
      calendarYear: calendarYearAtOffset(0),
      age: birthDate ? ageAtYearOffset(birthDate, 0) : null,
      whenLabel: 'today',
      kind: 'start',
      title: 'Plan starts',
      detail: startDetail(plan),
    },
  ]

  for (const source of plan.incomeSources) {
    if (source.disabled) continue
    events.push(...sourcePeriodEvents(source, 'income', birthDate))
  }
  for (const source of plan.expenseSources) {
    if (source.disabled) continue
    events.push(...sourcePeriodEvents(source, 'expense', birthDate))
  }
  events.push(...transferEvents(plan, projection))

  const rmdAge = rmdStartAge(plan.birthDate)
  const ageToday = ageAtPlanYear(plan, 0)
  const hasRmdBalance = (plan.accounts ?? []).some(
    (account) =>
      (account.kind === 'traditional401k' ||
        account.kind === 'traditionalIra' ||
        account.kind === 'sepIra') &&
      account.amount > 0.005,
  )
  if (ageToday != null && hasRmdBalance) {
    const yearOffset = Math.max(0, rmdAge - ageToday)
    if (yearOffset <= yearsToProject(plan)) {
      events.push({
        id: 'rmd-start',
        yearOffset,
        calendarYear: calendarYearAtOffset(yearOffset),
        age: ageAtPlanYear(plan, yearOffset),
        whenLabel: yearOffset === 0 ? 'today' : formatYearsFromNow(yearOffset),
        kind: 'rmd',
        title: 'Required minimum distributions begin',
        detail: `Starting at age ${rmdAge}, 401(k), Traditional IRA, and SEP IRA sell 1 ÷ (100 − age) of the balance each year (1/27 at 73). Tax is taken at that account's rate; what remains moves into the primary long-term source. Roth IRA has no RMD during your lifetime.`,
      })
    }
  }

  if (projection.depletedInYear !== null) {
    const yearOffset = projection.depletedInYear
    events.push({
      id: 'depleted',
      yearOffset,
      calendarYear: calendarYearAtOffset(yearOffset),
      age: birthDate ? ageAtYearOffset(birthDate, yearOffset) : null,
      whenLabel: yearOffset === 0 ? 'today' : formatYearsFromNow(yearOffset),
      kind: 'depleted',
      title: 'Savings run out',
      detail:
        yearOffset === 0
          ? 'There is no starting balance to draw from.'
          : 'The projection reaches $0 this year if spending and growth stay as entered.',
    })
  }

  const horizon = yearsToProject(plan)
  const last = projection.points.at(-1)
  events.push({
    id: 'horizon',
    yearOffset: horizon,
    calendarYear: calendarYearAtOffset(horizon),
    age: last?.age ?? (birthDate ? ageAtYearOffset(birthDate, horizon) : null),
    whenLabel: formatYearsFromNow(horizon),
    kind: 'horizon',
    title: last?.age != null ? `Projection reaches age ${last.age}` : 'End of projection',
    detail:
      last != null
        ? last.age != null
          ? `Savings are ${usd.format(last.netWorth)} at age ${last.age}.`
          : `Savings are ${usd.format(last.netWorth)} at the end of the ${horizon}-year window.`
        : `The graph stops after ${horizon} years.`,
  })

  return events.sort(compareEvents)
}

export function groupTimelineEvents(events: TimelineEvent[]): TimelineGroup[] {
  const byYear = new Map<number, TimelineEvent[]>()
  for (const event of events) {
    const list = byYear.get(event.calendarYear) ?? []
    list.push(event)
    byYear.set(event.calendarYear, list)
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([calendarYear, groupEvents]) => {
      const sorted = [...groupEvents].sort(compareEvents)
      const yearOffset = Math.min(...sorted.map((event) => event.yearOffset))
      const age = sorted.find((event) => event.age !== null)?.age ?? null
      return {
        calendarYear,
        yearOffset,
        age,
        heading: groupHeading(calendarYear, yearOffset, age, sorted),
        events: sorted,
      }
    })
}

function startDetail(plan: Plan): string {
  const total = currentNetWorth(plan)
  if ((plan.accounts ?? []).length === 0) {
    return `${usd.format(total)} in savings.`
  }
  const mix = plan.accounts
    .filter((account) => account.kind !== 'shortTerm')
    .map((account) => {
      const name = account.name.trim() || account.kind
      const ret =
        account.returnMode === 'historical'
          ? `S&P from ${account.historicalStartYear ?? account.historicalPeriodId ?? '?'}`
          : formatPercent(account.annualReturnPercent, 1)
      return `${name} ${usd.format(account.amount)} at ${ret}`
    })
    .join('; ')
  return `${usd.format(total)} across accounts: ${mix}. The wallet is filled today from the first long-term source, then spending is paid from that wallet.`
}

function transferEvents(plan: Plan, projection: Projection): TimelineEvent[] {
  const birthDate = plan.birthDate
  return projection.points.flatMap((point) => {
    const moves = point.accountMoves ?? []
    if (moves.length === 0) return []

    const sales = moves.filter((move) => move.reason === 'sale')
    const rmds = moves.filter((move) => move.reason === 'rmd')
    const transfers = moves.filter((move) => move.reason === 'transfer')
    const events: TimelineEvent[] = []
    const whenLabel = point.yearOffset === 0 ? 'today' : formatYearsFromNow(point.yearOffset)
    const calendarYear = calendarYearAtOffset(point.yearOffset)
    const age = birthDate ? ageAtYearOffset(birthDate, point.yearOffset) : null

    if (transfers.length > 0) {
      for (const t of transfers) {
        const taxPart =
          t.tax > 0.005
            ? ` Tax of ${usd.format(t.tax)} leaves the accounts.`
            : ' No tax on this transfer.'
        events.push({
          id: `account-transfer:${t.fromId}:${point.yearOffset}`,
          yearOffset: point.yearOffset,
          calendarYear,
          age,
          whenLabel,
          kind: 'transfer',
          title: `${t.fromName} transferred into ${t.toName}`,
          detail: `Term concluded. Sold ${usd.format(t.sold)} from ${t.fromName} and transferred ${usd.format(t.net)} into ${t.toName}.${taxPart}`,
        })
      }
    }

    if (sales.length > 0) {
      const sold = sales.reduce((sum, move) => sum + move.sold, 0)
      const net = sales.reduce((sum, move) => sum + move.net, 0)
      const tax = sales.reduce((sum, move) => sum + move.tax, 0)
      const from = uniqueNames(sales.map((move) => move.fromName))
      const taxPart =
        tax > 0
          ? ` Tax of ${usd.format(tax)} leaves the accounts, so net worth drops by that amount.`
          : ''
      events.push({
        id: `transfer:${point.yearOffset}`,
        yearOffset: point.yearOffset,
        calendarYear,
        age,
        whenLabel,
        kind: 'transfer',
        title:
          point.yearOffset === 0
            ? 'Opening wallet refill'
            : plan.keepWalletFull
              ? 'Wallet top-up'
              : 'Wallet refill',
        detail: `Sold ${usd.format(sold)} from ${from} into the wallet (${usd.format(net)} after tax).${taxPart}`,
      })
    }

    if (rmds.length > 0) {
      const sold = rmds.reduce((sum, move) => sum + move.sold, 0)
      const net = rmds.reduce((sum, move) => sum + move.net, 0)
      const tax = rmds.reduce((sum, move) => sum + move.tax, 0)
      const from = uniqueNames(rmds.map((move) => move.fromName))
      const to = uniqueNames(rmds.map((move) => move.toName))
      const taxPart =
        tax > 0.005
          ? ` Tax of ${usd.format(tax)} leaves the accounts.`
          : ' No tax on this distribution.'
      events.push({
        id: `rmd:${point.yearOffset}`,
        yearOffset: point.yearOffset,
        calendarYear,
        age,
        whenLabel,
        kind: 'rmd',
        title: 'Required minimum distribution',
        detail: `Sold ${usd.format(sold)} from ${from} into ${to} (${usd.format(net)} after tax).${taxPart}`,
      })
    }

    return events
  })
}

function uniqueNames(names: string[]): string {
  return [...new Set(names.filter(Boolean))].join(', ')
}

function sourcePeriodEvents(
  source: CashFlowSource,
  kind: 'income' | 'expense',
  birthDate: string | null,
): TimelineEvent[] {
  const name = source.name.trim() || 'Untitled'
  const ordered = [...source.steps].sort(
    (a, b) => timingToYearOffset(a.start) - timingToYearOffset(b.start),
  )

  return ordered.map((step, index) => {
    const yearOffset = timingToYearOffset(step.start)
    const annual = toAnnualAmount(step, originalAnnualAmount(source))
    const verb =
      step.once
        ? 'is paid once'
        : annual === 0 && step.valueType === 'absolute'
          ? 'stops'
          : index === 0
            ? 'starts'
            : 'changes'

    return {
      id: `${kind}:${source.id}:${step.id}`,
      yearOffset,
      calendarYear: calendarYearForTiming(step.start, yearOffset),
      age: birthDate ? ageAtYearOffset(birthDate, Math.round(yearOffset)) : null,
      whenLabel: formatWhen(step.start),
      kind,
      title: `${name} ${verb}`,
      detail: describeStep(step, source),
    }
  })
}

function calendarYearForTiming(timing: Timing, yearOffset: number): number {
  if (timing.type === 'date') {
    return parseIsoDate(timing.date)?.getFullYear() ?? calendarYearAtOffset(yearOffset)
  }
  return calendarYearAtOffset(yearOffset)
}

function formatYearsFromNow(years: number): string {
  const rounded = Math.round(years)
  if (rounded <= 0) return 'today'
  if (rounded === 1) return 'in 1 year'
  return `in ${rounded} years`
}

function groupHeading(
  calendarYear: number,
  yearOffset: number,
  age: number | null,
  events: TimelineEvent[],
): string {
  const parts = [String(calendarYear)]
  const allToday = events.every((event) => event.yearOffset === 0)
  if (allToday) parts.push('Today')
  else if (yearOffset > 0 && events.every((event) => event.whenLabel.startsWith('in '))) {
    parts.push(formatYearsFromNow(yearOffset))
  }
  if (age !== null) parts.push(`Age ${age}`)
  return parts.join(' · ')
}

function compareEvents(a: TimelineEvent, b: TimelineEvent): number {
  if (a.yearOffset !== b.yearOffset) return a.yearOffset - b.yearOffset
  if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  return a.title.localeCompare(b.title)
}
