import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { compactUsd, usd, yearsPhrase } from '../format'
import { pctVsStart, usePresentation } from '../presentation'
import { replenishYears, simulate, yearsToProject } from '../simulation'
import type { Plan } from '../types'

/** Replenish windows compared side-by-side on the plan overview chart. */
export const COMPARE_REPLENISH_YEARS = [3, 4, 5, 6, 7, 8] as const

const SERIES_COLORS: Record<(typeof COMPARE_REPLENISH_YEARS)[number], string> = {
  3: '#0ea5e9',
  4: '#10b981',
  5: '#f59e0b',
  6: '#8b5cf6',
  7: '#f43f5e',
  8: '#64748b',
}

function seriesKey(years: number): string {
  return `nw_${years}`
}

type ReplenishCompareChartProps = {
  plan: Plan
}

export function ReplenishCompareChart({ plan }: ReplenishCompareChartProps) {
  const presentation = usePresentation()
  const activeWindow = replenishYears(plan)
  const horizon = yearsToProject(plan)

  const { chartData, endings, startNetWorth, showAge } = useMemo(() => {
    const runs = COMPARE_REPLENISH_YEARS.map((windowYears) => {
      const projection = simulate({ ...plan, replenishYears: windowYears })
      return { windowYears, projection }
    })
    const baseline = runs[0]?.projection
    const start = baseline?.startNetWorth ?? 0
    const useAge = runs.every((run) =>
      run.projection.points.every((point) => point.age != null),
    )
    const maxLen = Math.max(0, ...runs.map((run) => run.projection.points.length))
    const rows: Array<Record<string, number | null>> = []

    for (let i = 0; i < maxLen; i += 1) {
      const sample = runs.find((run) => run.projection.points[i])?.projection.points[i]
      if (!sample) continue
      const row: Record<string, number | null> = {
        yearOffset: sample.yearOffset,
        age: sample.age,
      }
      for (const run of runs) {
        const point = run.projection.points[i]
        const raw = point?.netWorth ?? null
        if (raw == null) {
          row[seriesKey(run.windowYears)] = null
          continue
        }
        row[seriesKey(run.windowYears)] = presentation
          ? start > 0.005
            ? (raw / start) * 100
            : 0
          : raw
      }
      rows.push(row)
    }

    const endByWindow = runs.map((run) => ({
      windowYears: run.windowYears,
      endNetWorth: run.projection.endNetWorth,
      depletedInYear: run.projection.depletedInYear,
      lastAge: run.projection.points.at(-1)?.age ?? null,
    }))

    return {
      chartData: rows,
      endings: endByWindow,
      startNetWorth: start,
      showAge: useAge,
    }
  }, [plan, presentation])

  const maxY = Math.max(
    1,
    ...chartData.flatMap((row) =>
      COMPARE_REPLENISH_YEARS.map((years) => {
        const value = row[seriesKey(years)]
        return typeof value === 'number' ? value : 0
      }),
    ),
  )

  const xKey = showAge ? 'age' : 'yearOffset'

  return (
    <section className="card bg-base-100 shadow-sm border border-base-200">
      <div className="card-body p-4 sm:p-5 gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold">Net worth by replenish window</h3>
            <p className="text-sm text-base-content/65 max-w-2xl">
              Same accounts, returns, and spending — only the wallet replenish window changes
              ({COMPARE_REPLENISH_YEARS[0]}–{COMPARE_REPLENISH_YEARS.at(-1)} years). Updates as you
              move the S&P start year or edit balances.
            </p>
          </div>
          <p className="text-xs text-base-content/55 tabular-nums shrink-0">
            {horizon}-year horizon
            {activeWindow >= COMPARE_REPLENISH_YEARS[0] &&
            activeWindow <= (COMPARE_REPLENISH_YEARS.at(-1) ?? 8)
              ? ` · plan uses ${yearsPhrase(activeWindow)}`
              : ` · plan uses ${yearsPhrase(activeWindow)} (not in chart range)`}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {endings.map((ending) => {
            const active = ending.windowYears === activeWindow
            const depleted = ending.depletedInYear != null
            return (
              <div
                key={ending.windowYears}
                className={`rounded-box border px-2.5 py-2 ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-base-200 bg-base-200/40'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content/55">
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        SERIES_COLORS[
                          ending.windowYears as (typeof COMPARE_REPLENISH_YEARS)[number]
                        ],
                    }}
                  />
                  {yearsPhrase(ending.windowYears)}
                  {active ? <span className="badge badge-primary badge-xs">Plan</span> : null}
                </div>
                <div
                  className={`mt-0.5 text-sm font-bold tabular-nums ${
                    depleted ? 'text-error' : ''
                  }`}
                >
                  {depleted
                    ? ending.lastAge != null
                      ? `$0 @ ${ending.lastAge}`
                      : `$0 y${ending.depletedInYear}`
                    : presentation
                      ? pctVsStart(ending.endNetWorth, startNetWorth)
                      : compactUsd.format(ending.endNetWorth)}
                </div>
              </div>
            )
          })}
        </div>

        <div className="h-64 w-full min-w-0 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-base-content/15" />
              <XAxis
                dataKey={xKey}
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 11 }}
                tickFormatter={(value: number) => String(value)}
                label={{
                  value: showAge ? 'Age' : 'Years from now',
                  position: 'insideBottom',
                  offset: -2,
                  style: { fontSize: 11, fill: 'var(--color-base-content)', opacity: 0.55 },
                }}
              />
              <YAxis
                domain={[0, maxY * 1.05]}
                tick={{ fontSize: 11 }}
                width={56}
                tickFormatter={(value: number) =>
                  presentation ? `${Math.round(value)}%` : compactUsd.format(value)
                }
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="rounded-box border border-base-300 bg-base-100 px-3 py-2 shadow-md text-xs">
                      <div className="font-semibold mb-1">
                        {showAge ? `Age ${label}` : `Year ${label}`}
                      </div>
                      <ul className="flex flex-col gap-0.5">
                        {COMPARE_REPLENISH_YEARS.map((windowYears) => {
                          const entry = payload.find((item) => item.dataKey === seriesKey(windowYears))
                          const value = entry?.value
                          if (typeof value !== 'number') return null
                          return (
                            <li
                              key={windowYears}
                              className={`flex justify-between gap-4 tabular-nums ${
                                windowYears === activeWindow ? 'font-bold' : ''
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="size-2 rounded-full"
                                  style={{ backgroundColor: SERIES_COLORS[windowYears] }}
                                />
                                {yearsPhrase(windowYears)}
                              </span>
                              <span>
                                {presentation
                                  ? `${value.toFixed(1)}%`
                                  : usd.format(value)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => {
                  const years = Number(String(value).replace(/^nw_/, ''))
                  return yearsPhrase(years)
                }}
              />
              {COMPARE_REPLENISH_YEARS.map((windowYears) => {
                const active = windowYears === activeWindow
                return (
                  <Line
                    key={windowYears}
                    type="monotone"
                    dataKey={seriesKey(windowYears)}
                    name={seriesKey(windowYears)}
                    stroke={SERIES_COLORS[windowYears]}
                    strokeWidth={active ? 3 : 1.75}
                    strokeOpacity={active ? 1 : 0.85}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}
