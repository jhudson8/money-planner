import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compactUsd, usd } from '../format'
import { alignHistoricalAccountStartYears, maxHistoricalStartYear, minHistoricalStartYear } from '../marketHistory'
import { maskCompactUsd, maskUsd, usePresentation } from '../presentation'
import { simulate, yearsToProject } from '../simulation'
import type { Plan } from '../types'

type Bin = { midpoint: number; low: number; high: number; count: number }

function percentile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower] ?? 0
  const weight = position - lower
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight
}

export function EndingDistributionPanel({ plan }: { plan: Plan }) {
  const presentation = usePresentation()
  const result = useMemo(() => {
    const anchor = plan.accounts.find((account) => account.returnMode === 'historical')
    if (!anchor) return null
    const years = yearsToProject(plan)
    const minStart = minHistoricalStartYear(years)
    const maxStart = maxHistoricalStartYear(years)
    const endings: number[] = []
    for (let start = minStart; start <= maxStart; start += 1) {
      endings.push(simulate({
        ...plan,
        accounts: alignHistoricalAccountStartYears(
          plan.accounts,
          start,
          years,
          anchor.historicalReturnSeries,
        ),
      }).endNetWorth)
    }
    const sorted = endings.sort((a, b) => a - b)
    const minimum = sorted[0] ?? 0
    const maximum = sorted.at(-1) ?? minimum
    const binCount = Math.min(10, Math.max(5, Math.round(Math.sqrt(sorted.length))))
    const width = maximum > minimum ? (maximum - minimum) / binCount : 1
    const bins: Bin[] = Array.from({ length: binCount }, (_, index) => ({
      low: minimum + index * width,
      high: index === binCount - 1 ? maximum : minimum + (index + 1) * width,
      midpoint: minimum + (index + 0.5) * width,
      count: 0,
    }))
    for (const ending of sorted) {
      const index = Math.min(binCount - 1, Math.max(0, Math.floor((ending - minimum) / width)))
      bins[index]!.count += 1
    }
    return {
      bins,
      count: sorted.length,
      minimum,
      p10: percentile(sorted, 0.1),
      median: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
      maximum,
    }
  }, [plan])

  if (!result) return null

  return (
    <aside className="card border border-base-300 bg-base-100 shadow-xl">
      <div className="card-body gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Historical outcomes</h2>
            <p className="text-[10px] text-base-content/55">
              {result.count} overlapping scenarios · historical frequency, not future probability
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-base-content/55">Median ending</div>
            <div className="text-sm font-bold tabular-nums">
              {maskUsd(result.median, presentation, usd)}
            </div>
          </div>
        </div>
        <div className="h-36 w-full min-w-0">
          <ResponsiveContainer>
            <BarChart data={result.bins} margin={{ top: 4, right: 2, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="midpoint"
                tickFormatter={(value: number) => maskCompactUsd(value, presentation, compactUsd)}
                tickLine={false}
                minTickGap={20}
                fontSize={10}
              />
              <YAxis allowDecimals={false} tickLine={false} fontSize={10} />
              <Tooltip content={<CompactDistributionTooltip presentation={presentation} />} />
              <Bar dataKey="count" fill="var(--color-primary)" fillOpacity={0.72} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-x-3 text-[10px] tabular-nums text-base-content/65">
          <span>10th–90th</span>
          <span className="text-right">{maskUsd(result.p10, presentation, usd)}–{maskUsd(result.p90, presentation, usd)}</span>
          <span>Full range</span>
          <span className="text-right">{maskUsd(result.minimum, presentation, usd)}–{maskUsd(result.maximum, presentation, usd)}</span>
        </div>
      </div>
    </aside>
  )
}

function CompactDistributionTooltip({ active, payload, presentation }: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: Bin }>
  presentation: boolean
}) {
  const bin = payload?.[0]?.payload
  if (!active || !bin) return null
  return (
    <div className="rounded-box border border-base-300 bg-base-100 px-2 py-1 text-[11px] shadow-lg">
      <p className="font-semibold">{maskUsd(bin.low, presentation, usd)}–{maskUsd(bin.high, presentation, usd)}</p>
      <p>{bin.count} historical {bin.count === 1 ? 'scenario' : 'scenarios'}</p>
    </div>
  )
}
