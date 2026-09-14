import { calendarYearAtOffset, formatLongDate, todayIsoDate } from './dates'
import { resolveAccountReturnPath } from './marketHistory'
import { describeStep } from './planCopy'
import { RMD_START_AGE } from './rmd'
import {
  ageAtPlanYear,
  accountHasRmd,
  keepWalletFull,
  labelForKind,
  replenishGrowthPercent,
  replenishWaitMode,
  replenishYears,
  yearsToProject,
} from './simulation'
import type {
  AccountKind,
  AccountMove,
  CashFlowSource,
  Plan,
  Projection,
  SavingsAccount,
  Timing,
  YearProjection,
} from './types'

function $(n: number): string {
  return String(Math.round(n))
}

function pct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return 'n/a'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}%`
}

function timingLabel(timing: Timing): string {
  if (timing.type === 'now') return 'y0'
  if (timing.type === 'yearsFromNow') return `y+${timing.value}`
  return formatLongDate(timing.date)
}

function describeAccounts(accounts: SavingsAccount[], years: number): string {
  if (accounts.length === 0) return '(none)'
  return accounts
    .map((a) => {
      const name = a.name.trim() || labelForKind(a.kind)
      const tax = a.kind === 'rothIra' ? '0%' : `${a.taxRatePercent}%`
      const xfer = a.transfer?.enabled
        ? ` [transfer after ${a.transfer.durationYears}y → ${a.transfer.targetAccountId}${a.transfer.taxExempt ? ' taxExempt' : ''}${a.transfer.lockRefills ? ' locked' : ''}]`
        : ''
      const path =
        a.returnMode === 'historical' ? resolveAccountReturnPath(a, years) : null
      const ret = path
        ? `historical start=${path.startYear} path=[${path.returns.map((r) => r.toFixed(1)).join(', ')}]%`
        : `flat ${a.annualReturnPercent}%/yr`
      return `- ${name} [${a.kind}] id=${a.id} bal=$${$(a.amount)} ${ret} tax=${tax} depletionOrder=${a.depletionOrder}${xfer}`
    })
    .join('\n')
}

/** Calendar year mapped to each simulation growth year for an S&P path (with wrap). */
function sp500YearMap(
  startYear: number,
  returns: number[],
  wrapped: boolean,
  cycleLength: number,
): { simulationYear: number; calendarYear: number; claimedReturnPercent: number; wrappedRepeat: boolean }[] {
  return returns.map((claimedReturnPercent, index) => {
    const simulationYear = index + 1
    const offsetInCycle = cycleLength > 0 ? index % cycleLength : index
    const calendarYear = startYear + offsetInCycle
    const wrappedRepeat = wrapped && index >= cycleLength
    return { simulationYear, calendarYear, claimedReturnPercent, wrappedRepeat }
  })
}

function buildSp500ExternalVerification(plan: Plan, years: number): {
  text: string
  accounts: {
    name: string
    id: string
    kind: string
    historicalStartYear: number
    wrapped: boolean
    cycleLength: number
    sourceNote: string
    yearMap: ReturnType<typeof sp500YearMap>
  }[]
} {
  const historical = (plan.accounts ?? [])
    .map((account) => {
      const path = resolveAccountReturnPath(account, years)
      if (!path) return null
      return {
        name: account.name.trim() || labelForKind(account.kind),
        id: account.id,
        kind: account.kind,
        historicalStartYear: path.startYear,
        wrapped: path.wrapped,
        cycleLength: path.cycleLength,
        sourceNote:
          'App data: Shiller S&P calendar-year total return % (Dec–Dec price change + dividend yield).',
        yearMap: sp500YearMap(path.startYear, path.returns, path.wrapped, path.cycleLength),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)

  if (historical.length === 0) {
    return {
      text: [
        'S&P EXTERNAL VERIFICATION:',
        'No accounts use returnMode=historical. Skip external S&P rate checks.',
      ].join('\n'),
      accounts: [],
    }
  }

  const blocks = historical.map((account) => {
    const rows = account.yearMap
      .map((row) => {
        const wrap = row.wrappedRepeat ? ' (wrap repeat)' : ''
        return `  sim y${row.simulationYear} → calendar ${row.calendarYear}: claimed ${row.claimedReturnPercent.toFixed(2)}%${wrap}`
      })
      .join('\n')
    return [
      `Account "${account.name}" [${account.kind}] id=${account.id}`,
      `  historicalStartYear=${account.historicalStartYear} wrapped=${account.wrapped} cycleLength=${account.cycleLength}`,
      `  ${account.sourceNote}`,
      '  Claimed year-by-year total returns applied as growth rates:',
      rows,
    ].join('\n')
  })

  const text = [
    'S&P EXTERNAL VERIFICATION (required for every historical account above):',
    'Do NOT trust the claimed percentages below at face value. Run a separate external check:',
    '1) For each calendar year listed, look up S&P 500 (or S&P Composite) calendar-year TOTAL return',
    '   from an independent source you can access (examples: Shiller/Irrational Exuberance data,',
    '   NYU Damodaran historical returns, Slickcharts S&P annual returns, Yahoo Finance yearly,',
    '   or another reputable total-return series). Prefer total return including dividends.',
    '2) Compare each claimedReturnPercent to your external figure for that calendar year.',
    '3) Flag any year where the absolute difference is material (e.g. > ~0.5 percentage points),',
    '   and state your source + the external %. Note methodology differences (price-only vs total return).',
    '4) Confirm mapping: simulation year k uses calendar year = startYear + ((k-1) mod cycleLength),',
    '   wrapping back to startYear when the path repeats.',
    '5) Then verify dollar growth: for each sim year, growth$ ≈ startBalance × (appliedReturnPct/100)',
    '   (before sales/transfers that year). Flag arithmetic mismatches even if the % matches S&P.',
    '6) Summarize: pass / fail per account, list mismatched years, and whether wrap years reused the cycle correctly.',
    '',
    ...blocks,
  ].join('\n')

  return { text, accounts: historical }
}

function describeSources(label: string, sources: CashFlowSource[]): string {
  if (sources.length === 0) return `${label}: (none)`
  const lines = sources.map((source) => {
    const name = source.name.trim() || 'Untitled'
    const status = source.disabled ? ' (disabled)' : ''
    if (source.steps.length === 0) return `- ${name}${status}: $0`
    const steps = source.steps
      .map((step) => `${timingLabel(step.start)}: ${describeStep(step, source)}`)
      .join(' | ')
    return `- ${name}${status}: ${steps}`
  })
  return `${label}:\n${lines.join('\n')}`
}

function shortMoves(moves: AccountMove[]): string {
  if (moves.length === 0) return '(none)'
  return moves
    .map((m) => {
      const tag = m.reason === 'rmd' ? 'RMD' : m.reason === 'transfer' ? 'TRANSFER' : 'SALE'
      return `${tag} ${m.fromName}→${m.toName} sold=$${$(m.sold)} tax=$${$(m.tax)} net=$${$(m.net)}`
    })
    .join('; ')
}

function appliedReturnPercent(
  account: SavingsAccount,
  yearOffset: number,
  years: number,
): number | null {
  if (yearOffset < 1) return null
  if (account.returnMode === 'historical') {
    const path = resolveAccountReturnPath(account, years)
    return path?.returns[yearOffset - 1] ?? null
  }
  return account.annualReturnPercent
}

function accountYearLines(
  plan: Plan,
  point: YearProjection,
  prior: YearProjection | null,
  years: number,
): string[] {
  return (plan.accounts ?? []).map((account) => {
    const name = account.name.trim() || labelForKind(account.kind)
    const end = point.parts[account.id] ?? 0
    const start = prior ? (prior.parts[account.id] ?? 0) : account.amount
    const growth$ = point.partGrowth[account.id] ?? 0
    const change$ = point.partChange[account.id] ?? end - start
    const growthPctOfStart = start > 0.005 ? (growth$ / start) * 100 : growth$ === 0 ? 0 : Infinity
    const changePctOfStart = start > 0.005 ? (change$ / start) * 100 : change$ === 0 ? 0 : Infinity
    const applied = appliedReturnPercent(account, point.yearOffset, years)
    const appliedLabel =
      applied == null ? 'n/a (no growth in y0)' : `${applied.toFixed(2)}% applied`
    return (
      `  • ${name}: $${$(start)} → $${$(end)} | growth $${$(growth$)} (${pct(growthPctOfStart)})` +
      ` | Δ $${$(change$)} (${pct(changePctOfStart)}) | rate ${appliedLabel}`
    )
  })
}

function yearBlock(plan: Plan, projection: Projection, point: YearProjection, years: number): string {
  const prior =
    point.yearOffset === 0
      ? null
      : (projection.points.find((p) => p.yearOffset === point.yearOffset - 1) ?? null)
  const age = point.age ?? '?'
  const header =
    `YEAR ${point.yearOffset} (${calendarYearAtOffset(point.yearOffset)}, age ${age})` +
    ` | NW=$${$(point.netWorth)} | income=$${$(point.income)} | expenses=$${$(point.expenses)}` +
    ` | totalGrowth=$${$(point.growth)} | taxes=$${$(point.taxesPaid)}` +
    ` | walletSpend=$${$(Math.abs(point.cashFlow))} | walletRefill=$${$(point.walletRefill)}` +
    ` | rmdGross=$${$(point.rmdTransferred)}`

  const incomeItems =
    point.incomeItems.length === 0
      ? '  income items: (none)'
      : `  income items: ${point.incomeItems.map((i) => `${i.name}=$${$(i.amount)}`).join(', ')}`
  const expenseItems =
    point.expenseItems.length === 0
      ? '  expense items: (none)'
      : `  expense items: ${point.expenseItems.map((i) => `${i.name}=$${$(i.amount)}`).join(', ')}`

  return [
    header,
    incomeItems,
    expenseItems,
    '  accounts:',
    ...accountYearLines(plan, point, prior, years),
    `  moves: ${shortMoves(point.accountMoves ?? [])}`,
  ].join('\n')
}

const ACCOUNT_KIND_RULES = `ACCOUNT KIND RULES (apply to every account of that kind):
shortTerm (wallet):
- Holds cash for spending. Starts at entered balance.
- Receives: net proceeds from SALE refills, and is the only account expenses are paid from.
- Does not sell to refill other accounts. Growth uses its own flat or historical return like any account (y≥1).
- Never subject to RMD in this model.

longTerm (taxable / brokerage-style):
- Primary “high-risk” pool for wait modes and RMD destination = lowest depletionOrder among longTerm accounts (tie-break name).
- Eligible to sell into the wallet on refill (unless transfer.enabled locks it out of refills).
- Sale tax = sold × (taxRatePercent/100). Net = sold − tax → wallet.
- Sold after other longTerm by depletionOrder before retirement accounts when refilling.

traditional401k / traditionalIra / sepIra:
- Eligible to sell into wallet only after all longTerm (and other earlier depletionOrder) sources are used, per depletionOrder among replenishable non-transfer accounts.
- Sale tax = sold × (taxRatePercent/100).
- RMD from age ${RMD_START_AGE}: each year sell priorBal / (100 − floor(age)); tax withheld; net → primary longTerm (not wallet). Roth has no RMD here.

rothIra:
- Sale tax rate forced to 0% in this model.
- No lifetime RMD in this model.
- Still subject to depletionOrder when used for wallet refills (after longTerm typically).

Transfers (any kind with transfer.enabled):
- Locked out of wallet refill sales while the transfer is active.
- In simulation year = durationYears: balance earns that year’s return first, then entire balance is sold; tax applies unless taxExempt; net moves to targetAccountId.
- verify targetAccountId exists and net lands on the destination balance.

Returns (all kinds):
- flat: each growth year applies constant annualReturnPercent.
- historical: applies S&P calendar-year total return % from historicalStartYear (see S&P EXTERNAL VERIFICATION). y0 has no investment growth.
- growth$ should equal startBalance × (appliedReturnPct/100) before that year’s sales/transfers (within rounding).

Refill sell order:
- Exclude shortTerm and any account with transfer.enabled.
- Sort remaining by depletionOrder ascending, then name.
- Sell enough gross so after tax the wallet receives the needed net.`

function kindRulesFor(kind: AccountKind): string {
  switch (kind) {
    case 'shortTerm':
      return 'Wallet: spending source; receives refill nets; no RMD; not sold to refill others.'
    case 'longTerm':
      return 'Long-term: refill candidate; taxed on sale; may be primary high-risk / RMD destination if lowest depletionOrder among longTerm.'
    case 'traditional401k':
      return '401(k): taxed on sale; RMD from age ' + RMD_START_AGE + ' → primary longTerm; refill after longTerm by depletionOrder.'
    case 'traditionalIra':
      return 'Traditional IRA: taxed on sale; RMD from age ' + RMD_START_AGE + ' → primary longTerm; refill after longTerm by depletionOrder.'
    case 'sepIra':
      return 'SEP IRA: taxed on sale; RMD from age ' + RMD_START_AGE + ' → primary longTerm; refill after longTerm by depletionOrder.'
    case 'rothIra':
      return 'Roth IRA: 0% sale tax; no RMD in this model; refill candidate by depletionOrder.'
  }
}

function buildAccountRulesForPlan(plan: Plan, years: number): {
  text: string
  accounts: {
    name: string
    id: string
    kind: AccountKind
    rules: string
    balance: number
    returnMode: string
    returnDetail: string
    taxRatePercent: number
    depletionOrder: number
    rmd: boolean
    refillEligible: boolean
    transfer: null | {
      durationYears: number
      targetAccountId: string
      taxExempt: boolean
      lockRefills: boolean
    }
  }[]
} {
  const accounts = [...(plan.accounts ?? [])].sort(
    (a, b) =>
      a.depletionOrder - b.depletionOrder ||
      a.name.localeCompare(b.name) ||
      a.kind.localeCompare(b.kind),
  )

  const longTermSorted = accounts
    .filter((a) => a.kind === 'longTerm')
    .sort((a, b) => a.depletionOrder - b.depletionOrder || a.name.localeCompare(b.name))
  const primaryLongTermId = longTermSorted[0]?.id ?? null

  const detailed = accounts.map((account) => {
    const name = account.name.trim() || labelForKind(account.kind)
    const path =
      account.returnMode === 'historical' ? resolveAccountReturnPath(account, years) : null
    const returnDetail = path
      ? `historical startYear=${path.startYear} (${path.returns.length} growth years${path.wrapped ? ', wraps' : ''})`
      : `flat ${account.annualReturnPercent}%/yr`
    const taxRatePercent = account.kind === 'rothIra' ? 0 : account.taxRatePercent
    const transferOn = account.transfer?.enabled === true
    const refillEligible = account.kind !== 'shortTerm' && !transferOn
    const rmd = accountHasRmd(account.kind)
    const bits = [
      kindRulesFor(account.kind),
      `Opening balance $${$(account.amount)}.`,
      `Return: ${returnDetail}.`,
      `Sale tax rate ${taxRatePercent}%${account.kind === 'rothIra' ? ' (forced)' : ''}.`,
      `depletionOrder=${account.depletionOrder}.`,
      refillEligible
        ? 'Eligible for wallet refill sales (subject to sell order).'
        : transferOn
          ? 'NOT eligible for wallet refill sales (transfer lock).'
          : 'NOT sold for wallet refills (wallet).',
      rmd
        ? `RMD applies from age ${RMD_START_AGE}; net → primary longTerm.`
        : 'No RMD in this model.',
      primaryLongTermId === account.id
        ? 'This account is the primary longTerm (high-risk wait target + RMD destination).'
        : '',
      transferOn && account.transfer
        ? `Transfer: after ${account.transfer.durationYears}y grow-then-sell → ${account.transfer.targetAccountId} (taxExempt=${account.transfer.taxExempt === true}).`
        : '',
    ].filter(Boolean)

    return {
      name,
      id: account.id,
      kind: account.kind,
      rules: bits.join(' '),
      balance: Math.round(account.amount),
      returnMode: account.returnMode ?? 'flat',
      returnDetail,
      taxRatePercent,
      depletionOrder: account.depletionOrder,
      rmd,
      refillEligible,
      transfer:
        transferOn && account.transfer
          ? {
              durationYears: account.transfer.durationYears,
              targetAccountId: account.transfer.targetAccountId,
              taxExempt: account.transfer.taxExempt === true,
              lockRefills: account.transfer.lockRefills === true,
            }
          : null,
    }
  })

  const sellOrderLines = detailed
    .filter((a) => a.refillEligible)
    .map((a, index) => `  ${index + 1}. ${a.name} [${a.kind}] depletionOrder=${a.depletionOrder}`)
    .join('\n')

  const text = [
    ACCOUNT_KIND_RULES,
    '',
    'PER-ACCOUNT RULES FOR THIS PLAN (verify each account obeys these):',
    ...detailed.map(
      (a) =>
        `- ${a.name} [${a.kind}] id=${a.id}\n    ${a.rules}`,
    ),
    '',
    'Expected wallet-refill sell order for this plan:',
    sellOrderLines || '  (none — no refill-eligible accounts)',
    primaryLongTermId
      ? `Primary longTerm id=${primaryLongTermId} (${detailed.find((a) => a.id === primaryLongTermId)?.name ?? ''}).`
      : 'No longTerm account — primary source falls back to wallet rules in code.',
  ].join('\n')

  return { text, accounts: detailed }
}

const PLAN_RULES = `PLAN / ENGINE RULES (simplified model — do not invent IRS tables beyond what is stated):
- As-of date y0 = ${todayIsoDate()}; age from birthDate. Horizon: planUntilAge − age (else 40y), clamp 1–80.
- Schedules: ongoing steps replace prior ongoing from their start; once = lump that start year only. Monthly absolute → ×12 (except once). Relative = % of original annual amount. Ongoing compounds by annualGrowth% after start. Disabled sources = $0.
- Income is tracked for need=max(0, expenses−income) but is not deposited into account balances in this model.
- replenishYears: cadence refill target = sum of max(0,exp−inc) over the next replenishYears. keepWalletFull=false: optional refill when yearOffset % replenishYears == 0, and always when wallet < that year's need. keepWalletFull=true: after each year optionally top up so wallet still holds a full window (skip pure cadence).
- replenishWaitMode gates OPTIONAL cadence/top-up only: off = allow; yoyGrowth = primary longTerm must be up ≥ replenishGrowthPercent vs prior year; recoverHigh = primary longTerm must be at/above its prior post-growth peak after a drop. REQUIRED refill when wallet cannot cover the year's need always runs.
- Year order for y≥1: RMD → growth → scheduled transfer → cadence refill → spend → optional keep-full top-up. y0: opening transfers/RMDs/spend from wallet; no investment growth.
- Verify EVERY year and EVERY account against ACCOUNT KIND RULES, PER-ACCOUNT RULES, and these PLAN RULES. Recalculate anything that looks off.`

export function buildVerificationPrompt(
  plan: Plan,
  projection: Projection,
  scenarioName?: string,
): string {
  const years = yearsToProject(plan)
  const ageToday = ageAtPlanYear(plan, 0)
  const name = scenarioName?.trim() || 'Untitled'
  const y0 = projection.points[0]
  const sp500 = buildSp500ExternalVerification(plan, years)
  const accountRules = buildAccountRulesForPlan(plan, years)

  const config = [
    `PLAN "${name}" | asOf=${todayIsoDate()} birth=${plan.birthDate ?? 'none'} age=${ageToday ?? '?'} untilAge=${plan.planUntilAge} years=0..${years}`,
    `replenishYears=${replenishYears(plan)} keepWalletFull=${keepWalletFull(plan)} replenishWaitMode=${replenishWaitMode(plan)} replenishGrowthPercent=${replenishGrowthPercent(plan)}`,
    `startNW=$${$(projection.startNetWorth)} y0NW=$${$(y0?.netWorth ?? 0)} endNW=$${$(projection.endNetWorth)} depletedInYear=${projection.depletedInYear ?? 'never'} blendedReturn=${projection.blendedReturnPercent.toFixed(2)}%`,
    '',
    'INITIAL ACCOUNT BALANCES / RETURN PATHS:',
    describeAccounts(plan.accounts ?? [], years),
    '',
    describeSources('INCOME', plan.incomeSources ?? []),
    '',
    describeSources('EXPENSES', plan.expenseSources ?? []),
  ].join('\n')

  const yearly = projection.points.map((point) => yearBlock(plan, projection, point, years)).join('\n\n')

  return [
    'MISSION: Verify this retirement simulator end-to-end. Treat nothing as trusted. Recalculate.',
    'Do not invent extra tax/RMD law beyond the rules below. Flag every discrepancy with your math.',
    'Comment on feasibility when assumptions look unrealistic.',
    '',
    'VERIFY EVERYTHING — required checklist:',
    'A) Account rules: each account follows its kind rules and the per-account rules stated up front',
    'B) Opening balances and y0 behavior (transfers, RMD if any, spend, no investment growth)',
    'C) Every growth year: applied return % and growth$ for every account',
    'D) S&P-tied accounts: independent external verification of each claimed calendar-year total return %',
    'E) Every SALE / RMD / TRANSFER: sold, tax, net, destination impact, eligibility, sell order',
    'F) Wallet need, optional vs required refills, replenishYears / keepWalletFull / wait mode',
    'G) Income/expense schedule amounts each year',
    'H) Running balances → net worth; depletion year / survival; ending NW plausibility',
    'I) Final report: pass/fail by checklist item, list every failing year/account/move with corrected figures',
    '',
    accountRules.text,
    '',
    PLAN_RULES,
    '',
    config,
    '',
    sp500.text,
    '',
    'YEAR-BY-YEAR DETAIL (verify all of this against the rules above):',
    yearly,
  ].join('\n')
}

declare global {
  interface Window {
    __retirementVerificationPrompt?: string
    /** JSON string of the full verification payload (prompt + year detail). */
    __retirementVerificationJson?: string
  }
}

/**
 * Builds a paste-ready verification prompt and console-logs a JSON-stringified
 * payload (initial values, per-account % changes, moves) for external AI review.
 */
export function logVerificationPrompt(
  plan: Plan,
  projection: Projection,
  scenarioName?: string,
): void {
  const prompt = buildVerificationPrompt(plan, projection, scenarioName)
  const years = yearsToProject(plan)
  const name = scenarioName?.trim() || 'Untitled'
  const sp500 = buildSp500ExternalVerification(plan, years)
  const accountRules = buildAccountRulesForPlan(plan, years)

  const initialAccounts = (plan.accounts ?? []).map((account) => {
    const path =
      account.returnMode === 'historical' ? resolveAccountReturnPath(account, years) : null
    return {
      name: account.name.trim() || labelForKind(account.kind),
      kind: account.kind,
      id: account.id,
      balance: Math.round(account.amount),
      returnMode: account.returnMode ?? 'flat',
      flatPercentOrHistoricalStart: path ? path.startYear : account.annualReturnPercent,
      historicalReturnsPercent: path?.returns.map((r) => Number(r.toFixed(2))) ?? null,
      taxRatePercent: account.kind === 'rothIra' ? 0 : account.taxRatePercent,
      depletionOrder: account.depletionOrder,
      transfer: account.transfer?.enabled
        ? {
            durationYears: account.transfer.durationYears,
            targetAccountId: account.transfer.targetAccountId,
            taxExempt: account.transfer.taxExempt === true,
            lockRefills: account.transfer.lockRefills === true,
          }
        : null,
    }
  })

  const yearsDetail = projection.points.map((point) => {
    const prior =
      point.yearOffset === 0
        ? null
        : (projection.points.find((p) => p.yearOffset === point.yearOffset - 1) ?? null)

    const accounts = (plan.accounts ?? []).map((account) => {
      const accountName = account.name.trim() || labelForKind(account.kind)
      const end = point.parts[account.id] ?? 0
      const start = prior ? (prior.parts[account.id] ?? 0) : account.amount
      const growth$ = point.partGrowth[account.id] ?? 0
      const change$ = point.partChange[account.id] ?? end - start
      const applied = appliedReturnPercent(account, point.yearOffset, years)
      return {
        account: accountName,
        start: Math.round(start),
        end: Math.round(end),
        growth$: Math.round(growth$),
        growthPct: start > 0.005 ? Number(((growth$ / start) * 100).toFixed(2)) : null,
        change$: Math.round(change$),
        changePct: start > 0.005 ? Number(((change$ / start) * 100).toFixed(2)) : null,
        appliedReturnPct: applied == null ? null : Number(applied.toFixed(2)),
      }
    })

    return {
      yearOffset: point.yearOffset,
      calendarYear: calendarYearAtOffset(point.yearOffset),
      age: point.age,
      netWorth: Math.round(point.netWorth),
      income: Math.round(point.income),
      expenses: Math.round(point.expenses),
      totalGrowth: Math.round(point.growth),
      taxesPaid: Math.round(point.taxesPaid),
      walletSpend: Math.round(Math.abs(point.cashFlow)),
      walletRefill: Math.round(point.walletRefill),
      rmdGross: Math.round(point.rmdTransferred),
      accounts,
      moves: (point.accountMoves ?? []).map((m) => ({
        reason: m.reason,
        from: m.fromName,
        to: m.toName,
        sold: Math.round(m.sold),
        tax: Math.round(m.tax),
        net: Math.round(m.net),
      })),
    }
  })

  const payload = {
    prompt,
    mission:
      'Verify everything: account rules, arithmetic, moves, schedules, wait/refill policy, and external S&P rates for historical accounts.',
    accountRules: accountRules.accounts,
    settings: {
      scenario: name,
      birthDate: plan.birthDate,
      planUntilAge: plan.planUntilAge,
      years,
      replenishYears: replenishYears(plan),
      keepWalletFull: keepWalletFull(plan),
      replenishWaitMode: replenishWaitMode(plan),
      replenishGrowthPercent: replenishGrowthPercent(plan),
      startNetWorth: Math.round(projection.startNetWorth),
      endNetWorth: Math.round(projection.endNetWorth),
      depletedInYear: projection.depletedInYear,
      blendedReturnPercent: Number(projection.blendedReturnPercent.toFixed(2)),
    },
    initialAccounts,
    sp500ExternalVerification: {
      instructions: [
        'Independently verify each claimed calendar-year total return % against an external S&P source (Shiller, Damodaran, Slickcharts, Yahoo Finance yearly, etc.).',
        'Prefer total return including dividends; note methodology differences if comparing to price-only series.',
        'Flag material mismatches (e.g. > ~0.5 pp) with your source and external %.',
        'Confirm wrap mapping and that growth$ ≈ startBalance × (appliedReturnPct/100).',
      ],
      accounts: sp500.accounts,
    },
    years: yearsDetail,
  }

  const json = JSON.stringify(payload, null, 2)

  if (typeof window !== 'undefined') {
    window.__retirementVerificationPrompt = prompt
    window.__retirementVerificationJson = json
  }

  console.groupCollapsed(
    `[retirement-verify] ${name} · ${years}y · start $${$(projection.startNetWorth)} → end $${$(projection.endNetWorth)}`,
  )
  console.log('Copy JSON: copy(__retirementVerificationJson)')
  console.log('Copy prompt text: copy(__retirementVerificationPrompt)')
  console.log(json)
  console.groupEnd()
}
