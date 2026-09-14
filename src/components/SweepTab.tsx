import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { formatPercent, usd, yearsPhrase } from '../format'
import { labelForKind } from '../simulation'
import { maskUsd, usePresentation } from '../presentation'
import {
  applySweepSetting,
  isHistoricalAccount,
  runHistoricalSweep,
  SWEEP_MAX_GROWTH_PERCENT,
  SWEEP_MAX_REPLENISH_YEARS,
  SWEEP_MIN_GROWTH_PERCENT,
  SWEEP_MIN_REPLENISH_YEARS,
  type SweepReport,
  type SweepSetting,
} from '../sweepAnalysis'
import type { Plan, SavingsAccount } from '../types'
import { NumberField } from './NumberField'

type SweepTabProps = {
  plan: Plan
  onChange: (plan: Plan) => void
}

function clampSweepReplenish(value: number): number {
  if (!Number.isFinite(value)) return SWEEP_MIN_REPLENISH_YEARS
  return Math.min(
    SWEEP_MAX_REPLENISH_YEARS,
    Math.max(SWEEP_MIN_REPLENISH_YEARS, Math.floor(value)),
  )
}

function clampSweepGrowth(value: number): number {
  if (!Number.isFinite(value)) return SWEEP_MIN_GROWTH_PERCENT
  return Math.min(
    SWEEP_MAX_GROWTH_PERCENT,
    Math.max(SWEEP_MIN_GROWTH_PERCENT, Math.floor(value)),
  )
}

export function SweepTab({ plan, onChange }: SweepTabProps) {
  const presentation = usePresentation()
  const historicalAccounts = useMemo(
    () => plan.accounts.filter(isHistoricalAccount),
    [plan.accounts],
  )
  const [accountId, setAccountId] = useState(
    () => historicalAccounts[0]?.id ?? plan.accounts[0]?.id ?? '',
  )
  const [replenishMin, setReplenishMin] = useState(SWEEP_MIN_REPLENISH_YEARS)
  const [replenishMax, setReplenishMax] = useState(SWEEP_MAX_REPLENISH_YEARS)
  const [growthMin, setGrowthMin] = useState(SWEEP_MIN_GROWTH_PERCENT)
  const [growthMax, setGrowthMax] = useState(SWEEP_MAX_GROWTH_PERCENT)
  const [report, setReport] = useState<SweepReport | null>(null)
  const [running, setRunning] = useState(false)

  const selected =
    plan.accounts.find((account) => account.id === accountId) ?? plan.accounts[0] ?? null
  const selectedIsHistorical = selected ? isHistoricalAccount(selected) : false

  function runSweep(account: SavingsAccount) {
    if (!isHistoricalAccount(account)) {
      setReport(null)
      toast.message('Select an account that uses S&P historical returns')
      return
    }
    const nextReplenishMin = clampSweepReplenish(replenishMin)
    const nextReplenishMax = clampSweepReplenish(replenishMax)
    const nextGrowthMin = clampSweepGrowth(growthMin)
    const nextGrowthMax = clampSweepGrowth(growthMax)
    setReplenishMin(nextReplenishMin)
    setReplenishMax(nextReplenishMax)
    setGrowthMin(nextGrowthMin)
    setGrowthMax(nextGrowthMax)
    setRunning(true)
    window.setTimeout(() => {
      try {
        const next = runHistoricalSweep(plan, account.id, {
          replenishMin: nextReplenishMin,
          replenishMax: nextReplenishMax,
          growthMin: nextGrowthMin,
          growthMax: nextGrowthMax,
        })
        setReport(next)
        if (next) {
          toast.success(
            `Swept ${next.settingCount} policies across ${next.trialCount.toLocaleString()} runs`,
          )
        }
      } finally {
        setRunning(false)
      }
    }, 20)
  }

  function applySetting(setting: SweepSetting) {
    onChange(applySweepSetting(plan, setting))
    toast.success(
      `Applied replenish ${yearsPhrase(setting.replenishYears)}, growth ${formatPercent(setting.growthPercent, 0)} (YoY wait mode)`,
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">S&P start-year sweep</h2>
        <p className="text-sm text-base-content/70 max-w-3xl">
          Pick an S&P historical account. The sweep tries every start year that fits the simulation
          window, every replenish window in your range, and every growth-before-refill % in your
          range (wait-for-growth is turned on for the runs). Results rank{' '}
          <strong>policies</strong> — replenish + growth — by how they do across{' '}
          <em>all</em> start years (survival rate, then median ending net worth), not by one lucky
          calendar start.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <fieldset className="fieldset py-0">
            <legend className="fieldset-legend">Account</legend>
            <select
              className="select select-bordered w-72 max-w-full"
              value={selected?.id ?? ''}
              onChange={(event) => {
                setAccountId(event.target.value)
                setReport(null)
              }}
            >
              {plan.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name || labelForKind(account.kind)}
                  {isHistoricalAccount(account) ? ' · S&P' : ' · flat %'}
                </option>
              ))}
            </select>
          </fieldset>
          <div className="w-28">
            <NumberField
              label="Min replenish"
              value={replenishMin}
              min={SWEEP_MIN_REPLENISH_YEARS}
              max={SWEEP_MAX_REPLENISH_YEARS}
              step={1}
              onChange={(value) => {
                setReplenishMin(clampSweepReplenish(value))
                setReport(null)
              }}
            />
          </div>
          <div className="w-28">
            <NumberField
              label="Max replenish"
              value={replenishMax}
              min={SWEEP_MIN_REPLENISH_YEARS}
              max={SWEEP_MAX_REPLENISH_YEARS}
              step={1}
              onChange={(value) => {
                setReplenishMax(clampSweepReplenish(value))
                setReport(null)
              }}
            />
          </div>
          <div className="w-28">
            <NumberField
              label="Min growth %"
              value={growthMin}
              min={SWEEP_MIN_GROWTH_PERCENT}
              max={SWEEP_MAX_GROWTH_PERCENT}
              step={1}
              onChange={(value) => {
                setGrowthMin(clampSweepGrowth(value))
                setReport(null)
              }}
            />
          </div>
          <div className="w-28">
            <NumberField
              label="Max growth %"
              value={growthMax}
              min={SWEEP_MIN_GROWTH_PERCENT}
              max={SWEEP_MAX_GROWTH_PERCENT}
              step={1}
              onChange={(value) => {
                setGrowthMax(clampSweepGrowth(value))
                setReport(null)
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary mb-1"
            disabled={!selectedIsHistorical || running}
            onClick={() => selected && runSweep(selected)}
          >
            {running ? 'Running…' : 'Run sweep'}
          </button>
        </div>

        {!selectedIsHistorical && selected ? (
          <div className="alert alert-warning">
            <span>
              <strong>{selected.name || labelForKind(selected.kind)}</strong> uses a flat return rate.
              Switch it to S&P historical returns on the Plan tab, then run the sweep here.
            </span>
          </div>
        ) : null}

        {historicalAccounts.length === 0 ? (
          <div className="alert">
            <span>
              No accounts use S&P historical returns yet. On the Plan tab, set an account&apos;s return
              mode to historical, then come back.
            </span>
          </div>
        ) : null}
      </section>

      {report ? (
        <>
          <p className="text-sm text-base-content/70">
            <strong>{report.accountName}</strong> · {report.simulationYears}-year horizon · start years{' '}
            {report.startYearMin}–{report.startYearMax} · replenish {report.replenishMin}–
            {report.replenishMax} · growth {report.growthMin}–{report.growthMax}% ·{' '}
            {report.settingCount} policies · {report.trialCount.toLocaleString()} runs
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <ResultsTable
              title="Best 10 policies"
              tone="best"
              settings={report.best}
              presentation={presentation}
              onApply={applySetting}
            />
            <ResultsTable
              title="Worst 10 policies"
              tone="worst"
              settings={report.worst}
              presentation={presentation}
              onApply={applySetting}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

function ResultsTable({
  title,
  tone,
  settings,
  presentation,
  onApply,
}: {
  title: string
  tone: 'best' | 'worst'
  settings: SweepSetting[]
  presentation: boolean
  onApply: (setting: SweepSetting) => void
}) {
  return (
    <section className="overflow-x-auto">
      <h3 className={`text-lg font-semibold mb-2 ${tone === 'best' ? 'text-success' : 'text-error'}`}>
        {title}
      </h3>
      <table className="table table-sm">
        <thead>
          <tr>
            <th>#</th>
            <th>Replenish</th>
            <th>Growth %</th>
            <th>Survival</th>
            <th>Median end</th>
            <th>Mean end</th>
            <th>Worst end</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {settings.map((setting, index) => (
            <tr key={`${setting.replenishYears}-${setting.growthPercent}`}>
              <td>{index + 1}</td>
              <td>{yearsPhrase(setting.replenishYears)}</td>
              <td>{formatPercent(setting.growthPercent, 0)}</td>
              <td>
                {formatPercent(setting.survivalRate * 100, 0)}
                <span className="text-base-content/50 text-xs">
                  {' '}
                  ({setting.survivedCount}/{setting.startYearCount})
                </span>
              </td>
              <td>{maskUsd(setting.medianEndNetWorth, presentation, usd)}</td>
              <td>{maskUsd(setting.meanEndNetWorth, presentation, usd)}</td>
              <td>{maskUsd(setting.worstEndNetWorth, presentation, usd)}</td>
              <td>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => onApply(setting)}
                >
                  Apply
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
