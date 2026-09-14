import { calendarYearAtOffset, formatLongDate } from '../dates'
import { formatPercent, usd, yearsPhrase } from '../format'
import { getMarketPeriod } from '../marketHistory'
import { maskUsd, usePresentation } from '../presentation'
import { describeStepAmount, describeStepGrowth } from '../planCopy'
import {
  accountHasRmd,
  ageAtPlanYear,
  blendedReturnPercent,
  currentNetWorth,
  firstRmdByAccount,
  labelForKind,
  openingWalletFunding,
  replenishableAccounts,
  replenishYears,
  timingToYearOffset,
  yearsToProject,
  type FirstRmd,
} from '../simulation'
import { rmdStartAge } from '../rmd'
import type { CashFlowSource, Plan, Projection, SavingsAccount } from '../types'

type SummaryTabProps = {
  plan: Plan
  projection: Projection
}

export function SummaryTab({ plan, projection }: SummaryTabProps) {
  const presentation = usePresentation()
  const ageToday = ageAtPlanYear(plan, 0)
  const endAge = projection.points.at(-1)?.age ?? null
  const years = yearsToProject(plan)
  const endYear = calendarYearAtOffset(years)
  const total = currentNetWorth(plan)
  const depletedPoint =
    projection.depletedInYear === null
      ? null
      : projection.points.find((point) => point.yearOffset === projection.depletedInYear)
  const wallet = plan.accounts.find((account) => account.kind === 'shortTerm')
  const replenishable = replenishableAccounts(plan.accounts ?? [])
  const funding = openingWalletFunding(plan)
  const firstRmds = firstRmdByAccount(projection)
  const rmdStart = rmdStartAge(plan.birthDate)
  const windowYears = replenishYears(plan)
  const windowLabel = yearsPhrase(windowYears)

  return (
    <div className="flex flex-col gap-6">
      <section className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <h2 className="card-title">Summary</h2>
          <p>
            You have <strong>{maskUsd(total, presentation, usd)}</strong> today
            {ageToday !== null ? `, at age ${ageToday}` : ''}
            {plan.birthDate ? ` (born ${formatLongDate(plan.birthDate)})` : ''}. This plan looks
            ahead to <strong>age {plan.planUntilAge}</strong>
            {ageToday === null ? ` (${years} years, until a date of birth is set)` : ` (${years} years)`}
            , through {endYear}.
          </p>
          <p className="text-sm text-base-content/70">
            Combined growth across accounts is{' '}
            {formatPercent(blendedReturnPercent(plan.accounts ?? [], yearsToProject(plan)), 2)} per year. Spending comes
            from the active short-term wallet. Everyday expenses are paid from this wallet. If cash runs
            out, eligible long-term accounts are sold first to replenish it, then 401(k) and IRA accounts.{' '}
            {plan.keepWalletFull
              ? `Each year after spending, long-term is sold so the wallet still holds the next ${windowLabel}.`
              : `Every ${windowLabel}, or sooner if that wallet runs out, long-term accounts are sold first, then 401(k) and IRA accounts.`}{' '}
            Tax on those sales leaves the accounts (net worth drops); it is not taken from income.
            Income is not added to account balances.
            {ageToday !== null
              ? ` From age ${rmdStartAge(plan.birthDate)}, 401(k), Traditional IRA, and SEP IRA sell 1 ÷ (100 − age) of the balance each year at that account's tax rate; the remainder goes into the primary long-term source.`
              : ' 401(k) and IRA accounts are only sold after long-term is gone.'}
          </p>
        </div>
      </section>

      <section className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <h3 className="card-title text-lg">Savings</h3>
          <ul className="flex flex-col gap-2">
            {wallet ? (
              <li className="rounded-box border border-base-300 bg-base-200/60 p-3">
                <p className="font-medium">
                  {wallet.name.trim() || 'Short-term wallet'}
                  <span className="badge badge-sm badge-primary ml-2">Wallet</span>
                </p>
                <p className="text-sm text-base-content/80">
                  Starts at {maskUsd(wallet.amount, presentation, usd)}
                  {funding.filled > 0
                    ? `, plus ${maskUsd(funding.filled, presentation, usd)} refilled from ${funding.moves[0]?.fromName ?? 'savings'}`
                    : ''}
                  {plan.keepWalletFull ? ', then topped up every year' : ''}, growing at{' '}
                  {formatPercent(wallet.annualReturnPercent, 2)} per year.
                </p>
              </li>
            ) : null}
            {replenishable.map((account, index) => (
              <li key={account.id} className="rounded-box border border-base-300 bg-base-200/60 p-3">
                <p className="font-medium">
                  {account.name.trim() || labelForKind(account.kind)}
                  <span className="badge badge-sm badge-outline ml-2">Deplete {index + 1}</span>
                  {accountHasRmd(account.kind) ? (
                    <span className="badge badge-sm badge-ghost ml-2">RMD</span>
                  ) : null}
                  {account.kind === 'rothIra' ? (
                    <span className="badge badge-sm badge-ghost ml-2">Tax-free</span>
                  ) : null}
                </p>
                <p className="text-sm text-base-content/80">
                  {maskUsd(account.amount, presentation, usd)}
                  {account.returnMode === 'historical'
                    ? `, historical S&P from ${account.historicalStartYear ?? getMarketPeriod(account.historicalPeriodId)?.preferredStartYear ?? '?'}`
                    : `, growing at ${formatPercent(account.annualReturnPercent, 2)} per year`}
                  . Tax when sold{' '}
                  {account.kind === 'rothIra' ? '0%' : formatPercent(account.taxRatePercent, 0)}.
                  {rmdSummaryLine(
                    account,
                    firstRmds.get(account.id),
                    rmdStart,
                    endAge,
                    presentation,
                  )}
                </p>
                {account.transfer?.enabled ? (
                  <p className="mt-1 text-xs text-primary font-medium">
                    Limited term: Transfers in Year {account.transfer.durationYears} to{' '}
                    {plan.accounts.find((a) => a.id === account.transfer?.targetAccountId)?.name || 'target account'}.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SourceSummary
        title="Income"
        empty="No income sources. The wallet covers the full spending amount."
        sources={plan.incomeSources}
      />

      <SourceSummary
        title="Expenses"
        empty="No expense sources. Nothing is withdrawn from the wallet."
        sources={plan.expenseSources}
      />

      <section className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <h3 className="card-title text-lg">Projection</h3>
          <p>
            After {years} years
            {endAge !== null ? ` (age ${endAge})` : ` (age ${plan.planUntilAge})`}, savings are{' '}
            <strong>{maskUsd(projection.endNetWorth, presentation, usd)}</strong>.
          </p>
          {projection.depletedInYear === null ? (
            <p className="text-sm text-base-content/70">
              The balance stays funded through the full window on these settings.
            </p>
          ) : (
            <p className="text-sm text-warning">
              Savings reach $0
              {depletedPoint?.age != null
                ? ` at age ${depletedPoint.age}`
                : ` in year ${projection.depletedInYear}`}
              .
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function SourceSummary({
  title,
  empty,
  sources,
}: {
  title: string
  empty: string
  sources: CashFlowSource[]
}) {
  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h3 className="card-title text-lg">{title}</h3>
        {sources.length === 0 ? (
          <p>{empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sources.map((source) => {
              const name = source.name.trim() || 'Untitled'
              const ordered = [...source.steps].sort(
                (a, b) => timingToYearOffset(a.start) - timingToYearOffset(b.start),
              )
              return (
                <li key={source.id} className={`rounded-box border border-base-300 bg-base-200/60 p-3 ${source.disabled ? 'opacity-60' : ''}`}>
                  <p className="font-medium">
                    {name}
                    {source.disabled ? (
                      <span className="badge badge-sm badge-ghost ml-2">Disabled</span>
                    ) : null}
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                    {ordered.map((step) => (
                      <li key={step.id}>
                        <span>
                          {step.start.type === 'now'
                            ? 'Today'
                            : step.start.type === 'yearsFromNow'
                              ? `In ${step.start.value} ${step.start.value === 1 ? 'year' : 'years'}`
                              : formatLongDate(step.start.date)}
                        </span>
                        : {describeStepAmount(step, source)}, {describeStepGrowth(step)}.
                      </li>
                    ))}
                  </ol>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function rmdSummaryLine(
  account: SavingsAccount,
  firstRmd: FirstRmd | undefined,
  rmdStart: number,
  endAge: number | null,
  presentation: boolean,
): string {
  if (!accountHasRmd(account.kind)) return ''
  if (account.amount <= 0.005) return ' No RMD until this account has a balance.'
  if (firstRmd) {
    const when =
      firstRmd.age != null
        ? `age ${firstRmd.age}`
        : firstRmd.yearOffset === 0
          ? 'today'
          : `year ${firstRmd.yearOffset}`
    const soldStr = presentation ? '$•••' : usd.format(firstRmd.move.sold)
    return ` First RMD at ${when}: sells ${soldStr} into ${firstRmd.move.toName}.`
  }
  if (endAge != null && endAge < rmdStart) {
    return ` Projection ends at age ${endAge}, before RMDs at ${rmdStart}.`
  }
  return ''
}
