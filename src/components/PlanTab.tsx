import { useState } from 'react'
import { ageAtYearOffset } from '../dates'
import { rmdStartAge } from '../rmd'
import { AccountsEditor } from './AccountsEditor'
import { NumberField } from './NumberField'
import { CashFlowTab, describeSourceSchedule } from './CashFlowTab'
import { ReplenishCompareChart } from './ReplenishCompareChart'
import {
  accountHasRmd,
  blendedReturnPercent,
  currentNetWorth,
  MAX_REPLENISH_YEARS,
  MIN_REPLENISH_YEARS,
  replenishWaitMode,
  replenishYears,
  sourceAmountInYear,
  yearsToProject,
} from '../simulation'
import { formatPercent, usd, yearsPhrase } from '../format'
import { maskUsd, usePresentation } from '../presentation'
import type { CashFlowSource, Plan, Projection, ReplenishWaitMode } from '../types'

type PlanTabProps = {
  plan: Plan
  projection: Projection
  onChange: (plan: Plan) => void
  onNavigateTab?: (tab: 'income' | 'expenses') => void
}

export function PlanTab({ plan, projection, onChange, onNavigateTab }: PlanTabProps) {
  const presentation = usePresentation()
  const [section, setSection] = useState<'overview' | 'income' | 'expenses'>('overview')

  const ageToday = plan.birthDate ? ageAtYearOffset(plan.birthDate, 0) : null
  const rmdStart = rmdStartAge(plan.birthDate)
  const hasRmdBalance = (plan.accounts ?? []).some(
    (account) => accountHasRmd(account.kind) && account.amount > 0.005,
  )
  const chartEndsBeforeRmd =
    hasRmdBalance && ageToday != null && Math.floor(plan.planUntilAge) < rmdStart

  function patch(partial: Partial<Plan>) {
    onChange({ ...plan, ...partial })
  }

  function updateSources(
    key: 'incomeSources' | 'expenseSources',
    sources: CashFlowSource[],
  ) {
    patch({ [key]: sources })
  }

  function toggleSourceDisabled(
    key: 'incomeSources' | 'expenseSources',
    id: string,
    disabled: boolean,
  ) {
    const list = plan[key] ?? []
    patch({
      [key]: list.map((s) => (s.id === id ? { ...s, disabled } : s)),
    })
  }

  function handleOpenFlow(kind: 'income' | 'expense') {
    const tabTarget: 'income' | 'expenses' = kind === 'income' ? 'income' : 'expenses'
    if (onNavigateTab) {
      onNavigateTab(tabTarget)
    } else {
      setSection(tabTarget)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sub-nav section selector within Plan */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="tabs tabs-box bg-base-100 p-1 border border-base-200 shadow-xs">
          <button
            type="button"
            role="tab"
            className={`tab tab-sm font-medium ${section === 'overview' ? 'tab-active font-semibold' : ''}`}
            onClick={() => setSection('overview')}
          >
            Accounts & Settings
          </button>
          <button
            type="button"
            role="tab"
            className={`tab tab-sm font-medium gap-1.5 ${section === 'income' ? 'tab-active font-semibold' : ''}`}
            onClick={() => setSection('income')}
          >
            Income sources
            <span className="badge badge-xs badge-success text-[10px]">{plan.incomeSources.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`tab tab-sm font-medium gap-1.5 ${section === 'expenses' ? 'tab-active font-semibold' : ''}`}
            onClick={() => setSection('expenses')}
          >
            Expense sources
            <span className="badge badge-xs badge-error text-[10px]">{plan.expenseSources.length}</span>
          </button>
        </div>
      </div>

      {section === 'income' ? (
        <CashFlowTab
          kind="income"
          sources={plan.incomeSources}
          onChange={(incomeSources) => updateSources('incomeSources', incomeSources)}
        />
      ) : section === 'expenses' ? (
        <CashFlowTab
          kind="expense"
          sources={plan.expenseSources}
          onChange={(expenseSources) => updateSources('expenseSources', expenseSources)}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <section className="card bg-base-100 shadow-sm border border-base-200">
            <div className="card-body">
              <h2 className="card-title">Plan Overview</h2>
              <div className="flex max-w-5xl flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <fieldset className="fieldset min-w-0">
                    <legend className="fieldset-legend">Total savings today</legend>
                    <div className="input w-full min-w-0">
                      <span className="grow font-semibold tabular-nums">
                        {maskUsd(currentNetWorth(plan), presentation, usd)}
                      </span>
                    </div>
                    <p className="label whitespace-normal">Sum of the accounts below</p>
                  </fieldset>
                  <fieldset className="fieldset min-w-0">
                    <legend className="fieldset-legend">Combined growth</legend>
                    <div className="input w-full min-w-0">
                      <span className="grow font-semibold tabular-nums">
                        {presentation ? '•••' : formatPercent(blendedReturnPercent(plan.accounts ?? [], yearsToProject(plan)), 2)}
                      </span>
                    </div>
                    <p className="label whitespace-normal">
                      Weighted by today&apos;s balances
                    </p>
                  </fieldset>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <fieldset className="fieldset min-w-0">
                    <legend className="fieldset-legend">Date of birth</legend>
                    <input
                      type="date"
                      className="input w-full min-w-0 max-w-full"
                      value={plan.birthDate ?? ''}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(event) =>
                        patch({ birthDate: event.target.value ? event.target.value : null })
                      }
                    />
                    <p className="label whitespace-normal">
                      {ageToday === null
                        ? 'Sets your age on the chart. From age 73, 401(k) and IRA accounts sell 1 ÷ (100 − age) each year into the primary source.'
                        : `You are ${ageToday} today. From age ${rmdStartAge(plan.birthDate)}, 401(k) and IRA accounts sell 1 ÷ (100 − age) each year into the primary source.`}
                    </p>
                  </fieldset>
                  <NumberField
                    label="Project until age"
                    masked={presentation}
                    value={plan.planUntilAge}
                    min={ageToday != null ? ageToday + 1 : 1}
                    max={120}
                    hint={
                      chartEndsBeforeRmd
                        ? `Raise this to at least ${rmdStart} so 401(k) and IRA RMDs appear. The chart currently ends before required sales start.`
                        : ageToday === null
                          ? 'Enter a date of birth to run the chart to this age. Until then it shows 40 years.'
                          : `The chart runs ${yearsToProject(plan)} years, through age ${plan.planUntilAge}. RMDs start at age ${rmdStart}.`
                    }
                    onChange={(planUntilAge) => patch({ planUntilAge })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Replenish window"
                    masked={presentation}
                    value={replenishYears(plan)}
                    min={MIN_REPLENISH_YEARS}
                    max={MAX_REPLENISH_YEARS}
                    suffix="years"
                    hint={
                      plan.keepWalletFull
                        ? `Hold ${yearsPhrase(replenishYears(plan))} of spending minus income. Each year after spending, enough is sold so that window stays full. Shortcut: Shift+↑ / Shift+↓.`
                        : `Hold ${yearsPhrase(replenishYears(plan))} of spending minus income in the wallet. Refill on that schedule, or sooner if the wallet runs out. Shortcut: Shift+↑ / Shift+↓.`
                    }
                    onChange={(value) =>
                      patch({
                        replenishYears: Math.min(
                          MAX_REPLENISH_YEARS,
                          Math.max(MIN_REPLENISH_YEARS, Math.floor(value)),
                        ),
                      })
                    }
                  />
                  <fieldset className="fieldset min-w-0">
                    <legend className="fieldset-legend">Keep wallet full</legend>
                    <label className="flex cursor-pointer items-center gap-3 py-2">
                      <input
                        type="checkbox"
                        className="toggle toggle-primary"
                        checked={plan.keepWalletFull}
                        onChange={(event) => patch({ keepWalletFull: event.target.checked })}
                      />
                      <span className="text-sm">
                        {plan.keepWalletFull ? 'On · top up every year' : 'Off · refill every window'}
                      </span>
                    </label>
                    <p className="label whitespace-normal">
                      When on, one year of spending minus income is sold into the wallet after each year
                      so it still holds a full replenish window.
                    </p>
                  </fieldset>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <fieldset className="fieldset min-w-0">
                    <legend className="fieldset-legend">Wait before optional refill</legend>
                    <select
                      className="select select-bordered w-full"
                      value={replenishWaitMode(plan)}
                      onChange={(event) =>
                        patch({ replenishWaitMode: event.target.value as ReplenishWaitMode })
                      }
                    >
                      <option value="off">Off · refill on schedule</option>
                      <option value="yoyGrowth">Wait for YoY growth</option>
                      <option value="recoverHigh">Wait for recovery to peak</option>
                    </select>
                    <p className="label whitespace-normal">
                      {replenishWaitMode(plan) === 'yoyGrowth'
                        ? 'Skip optional refills until the primary long-term account is up a set % vs last year.'
                        : replenishWaitMode(plan) === 'recoverHigh'
                          ? 'If high-risk drops, skip optional refills until it gets back to its prior peak.'
                          : 'Scheduled and keep-full refills run normally.'}{' '}
                      Always sell if the low-risk wallet cannot cover that year&apos;s spending.
                      Shortcut: Shift+/ cycles Off → YoY growth → Recovery to peak.
                    </p>
                  </fieldset>
                  {replenishWaitMode(plan) === 'yoyGrowth' ? (
                    <NumberField
                      label="Growth before refill"
                      masked={presentation}
                      value={plan.replenishGrowthPercent ?? 5}
                      min={0}
                      max={50}
                      step={0.5}
                      suffix="% YoY"
                      hint="Primary high-risk account must be at least this much higher than last year before optional replenishing."
                      onChange={(replenishGrowthPercent) =>
                        patch({
                          replenishGrowthPercent: Math.min(
                            50,
                            Math.max(0, replenishGrowthPercent),
                          ),
                        })
                      }
                    />
                  ) : replenishWaitMode(plan) === 'recoverHigh' ? (
                    <div className="rounded-box border border-base-200 bg-base-200/40 p-3 text-xs text-base-content/65 self-end">
                      Tracks the primary long-term peak after each year&apos;s growth. Optional
                      refills stay paused through a drawdown until the balance reaches that peak
                      again. Required refills (empty wallet) still run.
                    </div>
                  ) : (
                    <div className="rounded-box border border-base-200 bg-base-200/40 p-3 text-xs text-base-content/65 self-end">
                      Choose a wait mode to pause scheduled wallet refills after weak high-risk
                      years, unless the wallet needs an emergency refill.
                    </div>
                  )}
                </div>
                {chartEndsBeforeRmd ? (
                  <div className="alert alert-warning">
                    <span>
                      Date of birth is set, but this plan stops at age {Math.floor(plan.planUntilAge)}.
                      401(k), Traditional IRA, and SEP IRA RMDs start at age {rmdStart}. Raise
                      &quot;Project until age&quot; to see those accounts sold.
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <AccountsEditor
            plan={plan}
            projection={projection}
            onChange={(accounts) => patch({ accounts })}
          />

          <ReplenishCompareChart plan={plan} />

          {/* Income & Expense Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CashFlowSummaryCard
              kind="income"
              sources={plan.incomeSources}
              onOpen={() => handleOpenFlow('income')}
              onToggleSource={(id, disabled) => toggleSourceDisabled('incomeSources', id, disabled)}
            />

            <CashFlowSummaryCard
              kind="expense"
              sources={plan.expenseSources}
              onOpen={() => handleOpenFlow('expense')}
              onToggleSource={(id, disabled) => toggleSourceDisabled('expenseSources', id, disabled)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function CashFlowSummaryCard({
  kind,
  sources,
  onOpen,
  onToggleSource,
}: {
  kind: 'income' | 'expense'
  sources: CashFlowSource[]
  onOpen: () => void
  onToggleSource: (id: string, disabled: boolean) => void
}) {
  const presentation = usePresentation()
  const activeSources = sources.filter((s) => !s.disabled)
  const total = activeSources.reduce((sum, s) => sum + sourceAmountInYear(s, 0), 0)
  const accent = kind === 'income' ? 'badge-success' : 'badge-error'
  const toggleAccent = kind === 'income' ? 'toggle-success' : 'toggle-error'

  return (
    <section className="card bg-base-100 shadow-sm border border-base-200">
      <div className="card-body gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="card-title text-base capitalize">{kind} Sources</h3>
            <span className={`badge ${accent} font-semibold text-xs`}>
              {maskUsd(total, presentation, usd)}/yr
            </span>
          </div>
          <button type="button" className="btn btn-xs btn-outline gap-1" onClick={onOpen}>
            Manage {kind} ({sources.length}) →
          </button>
        </div>

        {sources.length === 0 ? (
          <p className="text-sm text-base-content/60">No {kind} sources entered yet.</p>
        ) : (
          <div className="flex flex-col gap-2 mt-1">
            {sources.map((source) => {
              const thisYear = sourceAmountInYear(source, 0)
              const desc = describeSourceSchedule(source)
              return (
                <div
                  key={source.id}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-box bg-base-200/50 hover:bg-base-200/80 transition-colors ${
                    source.disabled ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{source.name.trim() || 'Untitled'}</span>
                      {source.disabled ? (
                        <span className="badge badge-xs badge-ghost">Disabled</span>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-base-content/60 truncate">{desc}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-semibold tabular-nums">
                      {source.disabled ? '—' : `${maskUsd(thisYear, presentation, usd)}/yr`}
                    </span>
                    <input
                      type="checkbox"
                      className={`toggle toggle-xs ${toggleAccent}`}
                      checked={!source.disabled}
                      onChange={(e) => onToggleSource(source.id, !e.target.checked)}
                      aria-label={`Toggle ${source.name}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
