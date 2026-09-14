import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
} from 'recharts'
import { compactUsd, formatPercent, signedUsd, signedUsdWithMonthly, usd, usdWithMonthly, usdYearAndMonth, yearsPhrase } from '../format'
import { maskCompactUsd, maskUsd, pctOfToday, pctVsStart, shareOf, signedPctOfToday, usePresentation } from '../presentation'
import { rmdStartAge } from '../rmd'
import { accountHasRmd, ageAtPlanYear, isRetirementAccount, replenishYears, yearsToProject } from '../simulation'
import type { AccountKind, AccountMove, NamedAmount, Plan, Projection, YearProjection } from '../types'

type ChartTabProps = {
  plan: Plan
  projection: Projection
}

type ChartMenu = {
  point: YearProjection
  x: number
  y: number
}

const KIND_COLORS: Record<AccountKind, string[]> = {
  shortTerm: ['#38bdf8'],
  longTerm: ['#34d399', '#10b981', '#059669'],
  traditional401k: ['#fb923c', '#f97316'],
  rothIra: ['#c084fc', '#a855f7'],
  traditionalIra: ['#22d3ee', '#06b6d4'],
  sepIra: ['#f472b6', '#ec4899'],
}

function colorForPart(
  part: { id: string; kind: AccountKind },
  parts: Array<{ id: string; kind: AccountKind }>,
): string {
  const palette = KIND_COLORS[part.kind]
  const index = parts.filter((item) => item.kind === part.kind).findIndex((item) => item.id === part.id)
  return palette[Math.max(0, index) % palette.length]
}

function partKey(id: string): string {
  return `p_${id}`
}

function isReplenish(point: YearProjection): boolean {
  return (point.walletRefill ?? 0) > 0.005
}

function isRmdYear(point: YearProjection): boolean {
  return (point.rmdTransferred ?? 0) > 0.005
}

type ChartLayers = {
  rmd: boolean
  replenish: boolean
  income: boolean
  expenses: boolean
}

function yearHasVisibleMoves(point: YearProjection, layers: ChartLayers): boolean {
  return (layers.replenish && isReplenish(point)) || (layers.rmd && isRmdYear(point))
}

export function ChartTab({ plan, projection }: ChartTabProps) {
  const presentation = usePresentation()
  const [layers, setLayers] = useState<ChartLayers>({
    rmd: true,
    replenish: true,
    income: true,
    expenses: true,
  })
  const showFlowAxis = layers.rmd || layers.income || layers.expenses
  const years = yearsToProject(plan)
  const windowYears = replenishYears(plan)
  const windowLabel = yearsPhrase(windowYears)
  const showAge = projection.points.every((point) => point.age !== null)
  const rmdStart = rmdStartAge(plan.birthDate)
  const ageToday = ageAtPlanYear(plan, 0)
  const depletedPoint =
    projection.depletedInYear === null
      ? null
      : projection.points.find((point) => point.yearOffset === projection.depletedInYear)
  const depletedLabel =
    projection.depletedInYear === null
      ? showAge && projection.points.at(-1)?.age != null
        ? `Lasts through age ${projection.points.at(-1)?.age}`
        : `Lasts through year ${years}`
      : depletedPoint?.age != null
        ? `Runs out at age ${depletedPoint.age}`
        : `Runs out in year ${projection.depletedInYear}`

  const stackedParts = useMemo(() => {
    const order = new Map(plan.accounts.map((account, index) => [account.id, index]))
    return [...projection.parts].sort((a, b) => {
      const aWallet = a.kind === 'shortTerm' ? 0 : 1
      const bWallet = b.kind === 'shortTerm' ? 0 : 1
      if (aWallet !== bWallet) return aWallet - bWallet
      const aRetire = Number(isRetirementAccount(a.kind))
      const bRetire = Number(isRetirementAccount(b.kind))
      if (aRetire !== bRetire) return aRetire - bRetire
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    })
  }, [plan.accounts, projection.parts])
  const maxNetWorth = Math.max(1, ...projection.points.map((point) => point.netWorth))

  const refillPoints = useMemo(
    () => projection.points.filter(isReplenish),
    [projection],
  )
  const rmdPoints = useMemo(
    () => projection.points.filter(isRmdYear),
    [projection],
  )
  const hasRmdBalance = (plan.accounts ?? []).some(
    (account) => accountHasRmd(account.kind) && account.amount > 0.005,
  )
  const firstAge = projection.points[0]?.age
  const lastAge = projection.points.at(-1)?.age
  const todayPoint = projection.points[0]
  const todaySpent = todayPoint ? Math.abs(todayPoint.cashFlow) : 0
  const todayDrop =
    todayPoint && todayPoint.yearOffset === 0
      ? projection.startNetWorth - todayPoint.netWorth
      : 0
  const rmdLineX =
    showAge && firstAge != null && lastAge != null
      ? rmdStart <= firstAge
        ? firstAge
        : rmdStart <= lastAge
          ? rmdStart
          : null
      : ageToday != null && Math.max(0, rmdStart - ageToday) <= years
        ? Math.max(0, rmdStart - ageToday)
        : null

  const startNW = projection.startNetWorth > 0 ? projection.startNetWorth : 1
  const chartData = useMemo(
    () =>
      projection.points.map((point) => {
        const stacked: Record<string, number> = {}
        for (const part of stackedParts) {
          const raw = Math.max(0, point.parts[part.id] ?? 0)
          stacked[partKey(part.id)] = presentation ? (raw / startNW) * 100 : raw
        }
        return {
          ...point,
          income: presentation ? (point.income / startNW) * 100 : point.income,
          expenses: presentation ? (point.expenses / startNW) * 100 : point.expenses,
          rmdTransferred: presentation ? (point.rmdTransferred / startNW) * 100 : point.rmdTransferred,
          walletRefill: presentation ? (point.walletRefill / startNW) * 100 : point.walletRefill,
          refillMarker: isReplenish(point) ? 0 : null,
          rmdMarker: isRmdYear(point) ? 0 : null,
          ...stacked,
        }
      }),
    [projection, stackedParts, presentation, startNW],
  )

  const pointer = useRef({ x: 0, y: 0 })
  const hoverPoint = useRef<YearProjection | null>(null)
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<ChartMenu | null>(null)

  useEffect(() => {
    setMenu(null)
  }, [projection])

  useEffect(() => {
    if (!menu) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (chartWrapRef.current?.contains(target)) return
      if ((event.target as HTMLElement | null)?.closest?.('[data-year-menu]')) return
      setMenu(null)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menu])

  function openMenu(point: YearProjection, x: number, y: number, toggle = true) {
    setMenu((current) =>
      toggle && current?.point.yearOffset === point.yearOffset ? null : { point, x, y },
    )
  }

  const xKey = showAge ? 'age' : 'yearOffset'

  function pointFromChartEvent(state: MouseHandlerDataParam): YearProjection | null {
    const raw = state.activeIndex ?? state.activeTooltipIndex
    const index = typeof raw === 'number' ? raw : raw != null && raw !== '' ? Number(raw) : Number.NaN
    if (Number.isInteger(index) && chartData[index]) return chartData[index]
    if (state.activeLabel == null) return null
    return (
      chartData.find((point) => (showAge ? point.age : point.yearOffset) === state.activeLabel) ?? null
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="stats stats-vertical xl:stats-horizontal w-full bg-base-100 shadow-sm overflow-x-hidden">
        <div className="stat">
          <div className="stat-title whitespace-normal">Combined growth</div>
          <div className="stat-value text-xl sm:text-2xl whitespace-normal">
            {formatPercent(projection.blendedReturnPercent, 2)}
          </div>
          <div className="stat-desc whitespace-normal">
            Weighted by balances · {plan.keepWalletFull ? 'rolling ' : ''}
            {windowLabel} wallet
          </div>
        </div>
        <div className="stat">
          <div className="stat-title whitespace-normal">
            {showAge ? `At age ${plan.planUntilAge}` : `In ${years} years`}
          </div>
          <div className="stat-value text-xl sm:text-2xl whitespace-normal break-words">
            {presentation
              ? pctVsStart(projection.endNetWorth, projection.startNetWorth)
              : usd.format(projection.endNetWorth)}
          </div>
          <div className="stat-desc whitespace-normal">
            {projection.points.at(-1)?.age != null
              ? `Age ${projection.points.at(-1)?.age} · ${depletedLabel}`
              : depletedLabel}
          </div>
        </div>
      </section>

      {projection.depletedInYear !== null ? (
        <div className="alert alert-warning">
          <span>
            Savings reach $0
            {depletedPoint?.age != null
              ? ` at age ${depletedPoint.age}`
              : ` in year ${projection.depletedInYear}`}
            . Lower spending or raise the growth rates to keep the balance funded.
          </span>
        </div>
      ) : null}

      <section className="card min-w-0 bg-base-100 shadow-sm">
        <div className="card-body min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <LayerToggle
              label="RMD"
              checked={layers.rmd}
              onChange={(rmd) => setLayers((current) => ({ ...current, rmd }))}
            />
            <LayerToggle
              label="Replenish"
              checked={layers.replenish}
              onChange={(replenish) => setLayers((current) => ({ ...current, replenish }))}
            />
            <LayerToggle
              label="Income"
              checked={layers.income}
              onChange={(income) => setLayers((current) => ({ ...current, income }))}
            />
            <LayerToggle
              label="Expenses"
              checked={layers.expenses}
              onChange={(expenses) => setLayers((current) => ({ ...current, expenses }))}
            />
          </div>
          <p className="text-xs text-base-content/60">{showAge ? 'Age' : 'Years from now'}</p>
          <div
            ref={chartWrapRef}
            className="h-72 w-full min-w-0 sm:h-96"
            onMouseMove={(event) => {
              pointer.current = { x: event.clientX, y: event.clientY }
            }}
            onContextMenu={(event) => {
              const point = hoverPoint.current
              if (!point || !yearHasVisibleMoves(point, layers)) return
              event.preventDefault()
              openMenu(point, event.clientX, event.clientY, false)
            }}
          >
            <ResponsiveContainer>
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 18 }}
                onMouseMove={(state) => {
                  hoverPoint.current = pointFromChartEvent(state)
                }}
                onClick={(state, event) => {
                  const point = pointFromChartEvent(state)
                  if (!point || !yearHasVisibleMoves(point, layers)) {
                    setMenu(null)
                    return
                  }
                  const mouse = event as unknown as MouseEvent
                  openMenu(point, mouse.clientX ?? pointer.current.x, mouse.clientY ?? pointer.current.y)
                }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis
                  dataKey={xKey}
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickLine={false}
                  minTickGap={28}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="nw"
                  domain={presentation ? [0, (maxNetWorth / startNW) * 100] : [0, maxNetWorth]}
                  tickFormatter={(value: number) =>
                    presentation
                      ? `${value.toFixed(0)}%`
                      : maskCompactUsd(value, false, compactUsd)
                  }
                  width={56}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="flow"
                  orientation="right"
                  hide={!showFlowAxis}
                  tickFormatter={(value: number) =>
                    presentation
                      ? `${value.toFixed(0)}%`
                      : maskCompactUsd(value, false, compactUsd)
                  }
                  width={showFlowAxis ? 56 : 0}
                  tickLine={false}
                />
                <Tooltip
                  allowEscapeViewBox={{ x: true, y: true }}
                  wrapperStyle={{ display: 'none' }}
                  cursor={{ stroke: 'var(--color-warning)', strokeDasharray: '4 3' }}
                  content={(props) =>
                    menu ? null : (
                      <YearTooltip
                        active={props.active}
                        payload={props.payload as ReadonlyArray<{ payload?: YearProjection }> | undefined}
                        parts={stackedParts}
                        pointer={pointer}
                        startNetWorth={projection.startNetWorth}
                        presentation={presentation}
                      />
                    )
                  }
                />
                <Legend />
                {stackedParts.map((part) => (
                  <Area
                    key={part.id}
                    yAxisId="nw"
                    type="linear"
                    stackId="accounts"
                    dataKey={partKey(part.id)}
                    name={part.name}
                    stroke={colorForPart(part, stackedParts)}
                    fill={colorForPart(part, stackedParts)}
                    fillOpacity={0.75}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                ))}
                {(layers.replenish && !plan.keepWalletFull ? refillPoints : []).map((point) => (
                  <ReferenceLine
                    key={`refill-${point.yearOffset}`}
                    yAxisId="nw"
                    x={(showAge ? point.age : point.yearOffset) ?? undefined}
                    stroke="var(--color-warning)"
                    strokeDasharray="5 4"
                    strokeWidth={2}
                    ifOverflow="visible"
                  />
                ))}
                {layers.rmd && rmdLineX != null ? (
                  <ReferenceLine
                    yAxisId="nw"
                    x={rmdLineX}
                    stroke="var(--color-info)"
                    strokeDasharray="2 3"
                    strokeWidth={2}
                    ifOverflow="visible"
                    label={{
                      value: `RMDs age ${rmdStart}`,
                      fill: 'var(--color-info)',
                      fontSize: 11,
                      position: 'insideTopLeft',
                    }}
                  />
                ) : null}
                {layers.replenish ? (
                  <Bar
                    yAxisId="nw"
                    dataKey="walletRefill"
                    name="Replenish"
                    fill="var(--color-warning)"
                    fillOpacity={0.9}
                    maxBarSize={32}
                    isAnimationActive={false}
                    legendType="none"
                  />
                ) : null}
                {layers.rmd ? (
                  <Bar
                    yAxisId="flow"
                    dataKey="rmdTransferred"
                    name="RMD"
                    fill="var(--color-info)"
                    fillOpacity={0.85}
                    maxBarSize={18}
                    isAnimationActive={false}
                    legendType="rect"
                  />
                ) : null}
                {layers.income ? (
                  <Line
                    yAxisId="flow"
                    type="linear"
                    dataKey="income"
                    name="Income"
                    stroke="var(--color-success)"
                    dot={false}
                    strokeWidth={2}
                  />
                ) : null}
                {layers.expenses ? (
                  <Line
                    yAxisId="flow"
                    type="linear"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="var(--color-error)"
                    dot={false}
                    strokeWidth={2}
                  />
                ) : null}
                {layers.replenish ? (
                  <Scatter
                    yAxisId="nw"
                    dataKey="refillMarker"
                    name="Replenish"
                    fill="var(--color-warning)"
                    legendType="diamond"
                    isAnimationActive={false}
                    shape={ReplenishShape}
                  />
                ) : null}
                {layers.rmd ? (
                  <Scatter
                    yAxisId="nw"
                    dataKey="rmdMarker"
                    name="RMD"
                    fill="var(--color-info)"
                    legendType="circle"
                    isAnimationActive={false}
                    shape={RmdShape}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {todayPoint && todayDrop > 0.5 ? (
            <div className="alert mt-2">
              <span>
                The first chart year is after this year&apos;s spending and tax, not the{' '}
                {maskUsd(projection.startNetWorth, presentation, usd)} entered as total savings today. Started{' '}
                {maskUsd(projection.startNetWorth, presentation, usd)}
                {todayPoint.taxesPaid > 0.005
                  ? ` · tax on sales ${maskUsd(todayPoint.taxesPaid, presentation, usd)}`
                  : ''}
                {todaySpent > 0.005 ? ` · taken from wallet ${maskUsd(todaySpent, presentation, usd)}` : ''}
                {' · '}
                {maskUsd(todayPoint.netWorth, presentation, usd)} remains. Income is not added to savings.
              </span>
            </div>
          ) : null}

          {hasRmdBalance && lastAge != null && lastAge < rmdStart ? (
            <div className="alert alert-warning mt-2">
              <span>
                This chart ends at age {lastAge}, before RMDs start at age {rmdStart}. Raise
                &quot;Project until age&quot; on the Plan tab to at least {rmdStart} to see 401(k) and
                IRA required sales.
              </span>
            </div>
          ) : null}
          {ageToday != null ? (
            <p className="text-sm text-base-content/70">
              Blue circles and bars mark 401(k) / Traditional IRA / SEP IRA RMDs from age {rmdStart}:
              each year 1 ÷ (100 − age) is sold into the primary long-term source. Yellow marks wallet
              refills from long-term. Click a marker for the sale. Roth IRA has no RMD during your
              lifetime.
              {!plan.birthDate
                ? ` No date of birth is set, so this chart treats you as age ${ageToday} today.`
                : ''}
            </p>
          ) : (
            <p className="text-sm text-warning">
              RMDs need an age. Set a date of birth so 401(k) and IRA accounts can be sold when
              required.
            </p>
          )}
          {rmdPoints.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-base-content/70">
                RMDs run every year from {replenishLabel(rmdPoints[0], showAge)} through{' '}
                {replenishLabel(rmdPoints[rmdPoints.length - 1], showAge)}. At 73 that is 1/27 of the
                balance; the fraction rises as age approaches 100. The 401(k) band can still rise if
                growth is higher than that fraction.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-year-menu
                  className={`btn btn-sm ${
                    menu?.point.yearOffset === rmdPoints[0].yearOffset ? 'btn-info' : 'btn-outline btn-info'
                  }`}
                  onClick={(event) => openMenu(rmdPoints[0], event.clientX, event.clientY)}
                >
                  First RMD · {replenishLabel(rmdPoints[0], showAge)}
                </button>
              </div>
            </div>
          ) : hasRmdBalance && lastAge != null && lastAge >= rmdStart ? (
            <p className="text-sm text-warning">
              RMDs should have started by age {rmdStart}, but no 401(k) or IRA sale was recorded.
              Check that those accounts have a balance.
            </p>
          ) : null}
          {refillPoints.length === 0 ? (
            <p className="text-sm text-base-content/70">
              No wallet refills on this plan. Income covers the next {windowLabel} of spending, so
              nothing extra is sold from long-term for the wallet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-base-content/70">
                {plan.keepWalletFull
                  ? `Yellow marks a wallet top-up every year so the next ${windowLabel} of spending minus income stay in the wallet. Click a year for the sale and tax.`
                  : 'Yellow bars, lines, and diamonds mark wallet refills. Click or right-click a marker for the account moves and tax.'}
              </p>
              {plan.keepWalletFull ? null : (
              <div className="flex flex-wrap gap-2">
                {refillPoints.map((point) => (
                  <button
                    key={point.yearOffset}
                    type="button"
                    data-year-menu
                    className={`btn btn-sm ${
                      menu?.point.yearOffset === point.yearOffset ? 'btn-warning' : 'btn-outline btn-warning'
                    }`}
                    onClick={(event) => openMenu(point, event.clientX, event.clientY)}
                  >
                    {replenishLabel(point, showAge)}
                  </button>
                ))}
              </div>
              )}
            </div>
          )}
        </div>
      </section>

      {menu ? (
        <ReplenishMenu
          menu={menu}
          parts={stackedParts}
          menuRef={menuRef}
          onClose={() => setMenu(null)}
          presentation={presentation}
          startNetWorth={projection.startNetWorth}
        />
      ) : null}
    </div>
  )
}

function LayerToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="checkbox checkbox-sm"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

function ReplenishShape({
  cx,
  cy,
  payload,
}: {
  cx?: number
  cy?: number
  payload?: { refillMarker?: number | null; rmdMarker?: number | null }
}) {
  if (cx == null || cy == null || payload?.refillMarker == null) return null
  const shift = payload.rmdMarker != null ? 10 : 0
  return (
    <g transform={`translate(${cx + shift},${cy - 12})`} className="cursor-pointer">
      <title>Wallet refill — click or right-click for details</title>
      <circle r={18} fill="var(--color-warning)" fillOpacity={0.2} />
      <polygon
        points="0,-11 11,0 0,11 -11,0"
        fill="var(--color-warning)"
        stroke="var(--color-base-content)"
        strokeWidth={1.5}
      />
    </g>
  )
}

function RmdShape({
  cx,
  cy,
  payload,
}: {
  cx?: number
  cy?: number
  payload?: { refillMarker?: number | null; rmdMarker?: number | null }
}) {
  if (cx == null || cy == null || payload?.rmdMarker == null) return null
  const shift = payload.refillMarker != null ? -10 : 0
  return (
    <g transform={`translate(${cx + shift},${cy - 12})`} className="cursor-pointer">
      <title>RMD — click or right-click for the 401(k) / IRA sale</title>
      <circle r={16} fill="var(--color-info)" fillOpacity={0.2} />
      <circle r={7} fill="var(--color-info)" stroke="var(--color-base-content)" strokeWidth={1.5} />
    </g>
  )
}

function replenishLabel(point: YearProjection, showAge: boolean): string {
  if (point.yearOffset === 0) {
    return showAge && point.age != null ? `Today · age ${point.age}` : 'Today'
  }
  if (showAge && point.age != null) return `Age ${point.age}`
  return `Year ${point.yearOffset}`
}

function yearTitle(point: YearProjection): string {
  if (point.age !== null) {
    return point.yearOffset === 0 ? `Today · age ${point.age}` : `Age ${point.age}`
  }
  return point.yearOffset === 0 ? 'Today' : `Year ${point.yearOffset}`
}

const VIEW_PAD = 8
const CURSOR_GAP = 16

function ReplenishMenu({
  menu,
  parts,
  menuRef,
  onClose,
  presentation,
  startNetWorth,
}: {
  menu: ChartMenu
  parts: { id: string; name: string }[]
  menuRef: { current: HTMLDivElement | null }
  onClose: () => void
  presentation: boolean
  startNetWorth: number
}) {
  const [position, setPosition] = useState({ top: VIEW_PAD, left: VIEW_PAD })
  const point = menu.point
  const sales = (point.accountMoves ?? []).filter((move) => move.reason === 'sale')
  const rmds = (point.accountMoves ?? []).filter((move) => move.reason === 'rmd')
  const transfers = (point.accountMoves ?? []).filter((move) => move.reason === 'transfer')
  const tax = sales.reduce((sum, move) => sum + move.tax, 0)
  const sold = sales.reduce((sum, move) => sum + move.sold, 0)
  const received = sales.reduce((sum, move) => sum + move.net, 0)
  const rmdTax = rmds.reduce((sum, move) => sum + move.tax, 0)
  const rmdSold = rmds.reduce((sum, move) => sum + move.sold, 0)
  const isRmd = rmds.length > 0
  const isRefill = sales.length > 0
  const isTransfer = transfers.length > 0

  useLayoutEffect(() => {
    setPosition(placePanel(menuRef.current, menu.x, menu.y))
  }, [menu, menuRef])

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={`rounded-box border bg-base-100 shadow-lg w-72 max-w-[calc(100vw-1rem)] overflow-y-auto text-xs leading-snug ${
        isRmd && !isRefill ? 'border-info' : 'border-warning'
      }`}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 60,
        maxHeight: `calc(100vh - ${VIEW_PAD * 2}px)`,
      }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-base-300 px-2 py-1.5">
        <div>
          <p className="font-semibold">
            {isRmd && !isRefill && !isTransfer
              ? 'Required minimum distribution'
              : isTransfer && !isRefill && !isRmd
                ? 'Account transfer'
                : isRmd
                  ? 'Wallet refill and RMD'
                  : 'Wallet refill'}
          </p>
          <p className="text-[10px] text-base-content/60">{yearTitle(point)}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="p-2">
        {isTransfer ? (
          <>
            <p className="font-medium text-primary">Account transfer</p>
            <MoveList moves={transfers} presentation={presentation} startNetWorth={startNetWorth} />
          </>
        ) : null}
        {isRmd ? (
          <>
            <p className="text-base-content/80">
              Sold {relMoney(rmdSold, presentation, startNetWorth, true)} from 401(k) / IRA into the primary source
              {rmdTax > 0 ? ` after ${relMoney(rmdTax, presentation, startNetWorth, true)} tax` : ''}.
            </p>
            <MoveList moves={rmds} presentation={presentation} startNetWorth={startNetWorth} />
          </>
        ) : null}
        {isRefill ? (
          <>
            <p className={`text-base-content/80 ${isRmd ? 'mt-2' : ''}`}>
              Sold {relMoney(sold, presentation, startNetWorth, true)} from long-term. Wallet received {relMoney(received, presentation, startNetWorth, true)} after tax.
            </p>
            {tax > 0 ? (
              <p className="mt-1 font-medium text-error">
                Net worth {relSigned(tax * -1, presentation, startNetWorth, true)} — tax left the accounts
              </p>
            ) : (
              <p className="mt-1 text-base-content/70">No tax on this refill.</p>
            )}
            <p className="font-medium mt-1.5">Wallet refill</p>
            <MoveList moves={sales} presentation={presentation} startNetWorth={startNetWorth} />
          </>
        ) : null}
        <p className="mt-1 text-base-content/70">
          Net worth after {presentation ? pctVsStart(point.netWorth, startNetWorth) : usd.format(point.netWorth)}
        </p>

        <p className="font-medium mt-1.5">Accounts after</p>
        <ItemList
          items={parts.map((part) => ({
            id: part.id,
            name: part.name,
            amount: point.parts[part.id] ?? 0,
            change: point.partChange?.[part.id],
            changeLabel: point.yearOffset === 0 ? 'opening refill' : 'since last year',
          }))}
          presentation={presentation}
          startNetWorth={startNetWorth}
          yearTotal={point.netWorth}
        />
      </div>
    </div>,
    document.body,
  )
}

function YearTooltip({
  active,
  payload,
  parts,
  pointer,
  startNetWorth,
  presentation,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: YearProjection }>
  parts: { id: string; name: string }[]
  pointer: { current: { x: number; y: number } }
  startNetWorth: number
  presentation: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: VIEW_PAD, left: VIEW_PAD })

  useLayoutEffect(() => {
    if (!active) return

    function reposition() {
      setPosition(placePanel(panelRef.current, pointer.current.x, pointer.current.y))
    }

    function onMove(event: MouseEvent) {
      pointer.current = { x: event.clientX, y: event.clientY }
      reposition()
    }

    reposition()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', reposition)
    }
  }, [active, payload, pointer])

  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return createPortal(
    <div
      ref={panelRef}
      className="rounded-box border border-base-300 bg-base-100 p-2 text-xs leading-snug w-80 max-w-[calc(100vw-1rem)] overflow-y-auto"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 50,
        pointerEvents: 'none',
        maxHeight: `calc(100vh - ${VIEW_PAD * 2}px)`,
      }}
    >
      <p className="font-semibold">{yearTitle(point)}</p>
      <p className="text-base-content/70 mb-1">
        {point.age !== null && point.yearOffset > 0
          ? `${point.yearOffset} years from now · `
          : ''}
        Net worth {presentation ? pctVsStart(point.netWorth, startNetWorth) : usd.format(point.netWorth)}
        {point.yearOffset === 0 && startNetWorth - point.netWorth > 0.5 ? (
          <>
            {' '}
            · started {presentation ? 'today' : usd.format(startNetWorth)}
            {point.taxesPaid > 0.005
              ? ` · tax ${relMoney(point.taxesPaid, presentation, startNetWorth, true)}`
              : ''}
            {Math.abs(point.cashFlow) > 0.005
              ? ` · spending ${relMoney(Math.abs(point.cashFlow), presentation, startNetWorth, true)}`
              : ''}
          </>
        ) : null}
        {point.yearOffset > 0
          ? ` · growth ${relMoney(point.growth, presentation, startNetWorth)}`
          : ''}
        {isRmdYear(point) ? (
          <span className="text-info"> · click marker for RMD sale</span>
        ) : isReplenish(point) ? (
          <span className="text-warning"> · click marker for refill details</span>
        ) : null}
      </p>

      {(point.accountMoves ?? []).some((move) => move.reason === 'transfer') ? (
        <>
          <p className="font-medium text-primary">Account transfer</p>
          <MoveList
            moves={(point.accountMoves ?? []).filter((move) => move.reason === 'transfer')}
            presentation={presentation}
            startNetWorth={startNetWorth}
          />
        </>
      ) : null}

      {(point.accountMoves ?? []).some((move) => move.reason === 'rmd') ? (
        <>
          <p className="font-medium text-info">Required minimum distribution</p>
          <MoveList
            moves={(point.accountMoves ?? []).filter((move) => move.reason === 'rmd')}
            presentation={presentation}
            startNetWorth={startNetWorth}
          />
        </>
      ) : null}

      <p className={`font-medium ${(point.accountMoves ?? []).some((move) => move.reason === 'rmd') ? 'mt-1.5' : ''}`}>
        Accounts
      </p>
      <ItemList
        items={parts.map((part) => {
          const rmdSold = (point.accountMoves ?? [])
            .filter((move) => move.reason === 'rmd' && move.fromId === part.id)
            .reduce((sum, move) => sum + move.sold, 0)
          return {
            id: part.id,
            name: part.name,
            amount: point.parts[part.id] ?? 0,
            change: point.partChange?.[part.id],
            changeLabel: point.yearOffset === 0 ? 'opening refill' : 'since last year',
            growth: point.yearOffset > 0 ? (point.partGrowth?.[part.id] ?? 0) : undefined,
            rmdSold: rmdSold > 0.005 ? rmdSold : undefined,
          }
        })}
        presentation={presentation}
        startNetWorth={startNetWorth}
        yearTotal={point.netWorth}
      />

      <p className="font-medium mt-1.5 text-success">
        Income {relFlow(point.income, presentation, startNetWorth)}
      </p>
      <ItemList
        items={point.incomeItems ?? []}
        empty="No income this year"
        showMonthly
        presentation={presentation}
        startNetWorth={startNetWorth}
        yearTotal={point.income}
        yearLabel="income"
      />

      <p className="font-medium mt-1.5 text-error">
        Spending {relFlow(point.expenses, presentation, startNetWorth)}
      </p>
      <ItemList
        items={point.expenseItems ?? []}
        empty="No expenses this year"
        showMonthly
        presentation={presentation}
        startNetWorth={startNetWorth}
        yearTotal={point.expenses}
        yearLabel="spending"
      />

      {Math.abs(point.cashFlow) > 0.005 ? (
        <p className="mt-1.5 text-base-content/70">
          Taken from wallet {relMoney(Math.abs(point.cashFlow), presentation, startNetWorth, true)}
        </p>
      ) : null}
    </div>,
    document.body,
  )
}

function placePanel(
  panel: HTMLDivElement | null,
  mouseX: number,
  mouseY: number,
): { top: number; left: number } {
  const width = panel?.offsetWidth ?? 320
  const height = panel?.offsetHeight ?? 280
  const maxLeft = window.innerWidth - width - VIEW_PAD
  const maxTop = window.innerHeight - height - VIEW_PAD

  let left = mouseX + CURSOR_GAP
  let top = mouseY + CURSOR_GAP
  if (left > maxLeft) left = mouseX - width - CURSOR_GAP
  if (top > maxTop) top = mouseY - height - CURSOR_GAP

  return {
    left: Math.min(Math.max(VIEW_PAD, left), Math.max(VIEW_PAD, maxLeft)),
    top: Math.min(Math.max(VIEW_PAD, top), Math.max(VIEW_PAD, maxTop)),
  }
}

function relMoney(
  amount: number,
  presentation: boolean,
  startNetWorth: number,
  withMonthly = false,
): string {
  if (presentation) return pctOfToday(amount, startNetWorth)
  return withMonthly ? usdWithMonthly(amount) : usd.format(amount)
}

function relSigned(
  amount: number,
  presentation: boolean,
  startNetWorth: number,
  withMonthly = false,
): string {
  if (presentation) return signedPctOfToday(amount, startNetWorth)
  return withMonthly ? signedUsdWithMonthly(amount) : signedUsd(amount)
}

function relFlow(annual: number, presentation: boolean, startNetWorth: number): string {
  if (presentation) return pctOfToday(annual, startNetWorth)
  return usdYearAndMonth(annual)
}

function MoveList({
  moves,
  presentation,
  startNetWorth,
}: {
  moves: AccountMove[]
  presentation: boolean
  startNetWorth: number
}) {
  if (moves.length === 0) {
    return <p className="text-[10px] text-base-content/60 pl-1">None</p>
  }

  const tax = moves.reduce((sum, move) => sum + move.tax, 0)

  return (
    <ul className="mt-0.5">
      {moves.map((move, index) => (
        <li key={`${move.fromId}:${move.toId}:${move.reason}:${index}`} className="pl-1">
          <p className="text-base-content/80">
            {move.fromName} → {move.toName}
          </p>
          {move.reason === 'rmd' ? (
            <p className="text-[10px] text-base-content/60">
              Sold {relMoney(move.sold, presentation, startNetWorth, true)}
              {move.tax > 0 ? ` · tax ${relMoney(move.tax, presentation, startNetWorth, true)}` : ''} · {move.toName}{' '}
              {relMoney(move.net, presentation, startNetWorth, true)}
            </p>
          ) : move.reason === 'transfer' ? (
            <p className="text-[10px] text-base-content/60">
              Transferred {relMoney(move.sold, presentation, startNetWorth, true)}
              {move.tax > 0 ? ` · tax ${relMoney(move.tax, presentation, startNetWorth, true)}` : ''} · {move.toName} received{' '}
              {relMoney(move.net, presentation, startNetWorth, true)}
            </p>
          ) : (
            <p className="text-[10px] text-base-content/60">
              Sold {relMoney(move.sold, presentation, startNetWorth, true)}
              {move.tax > 0 ? ` · tax ${relMoney(move.tax, presentation, startNetWorth, true)}` : ''} · wallet{' '}
              {relSigned(move.net, presentation, startNetWorth, true)}
            </p>
          )}
        </li>
      ))}
      {tax > 0 ? (
        <li className="pl-1 mt-1 text-error">
          Net worth {relSigned(-tax, presentation, startNetWorth, true)} — tax left the accounts
        </li>
      ) : null}
    </ul>
  )
}

function ItemList({
  items,
  empty,
  showMonthly = false,
  presentation = false,
  startNetWorth = 0,
  yearTotal,
  yearLabel = 'this year',
}: {
  items: Array<NamedAmount & { changeLabel?: string; rmdSold?: number }>
  empty?: string
  showMonthly?: boolean
  presentation?: boolean
  startNetWorth?: number
  yearTotal?: number
  yearLabel?: string
}) {
  if (items.length === 0) {
    return empty ? <p className="text-[10px] text-base-content/60 pl-1">{empty}</p> : null
  }

  return (
    <ul className="mt-0.5">
      {items.map((item) => {
        const change = item.change ?? 0
        const showChange = item.change != null && Math.abs(change) > 0.005
        const showGrowth = item.growth != null && Math.abs(item.growth) > 0.005
        const detail = (
          presentation
            ? [
                yearTotal != null && yearTotal > 0.005 ? shareOf(item.amount, yearTotal, yearLabel) : null,
                item.rmdSold != null ? `−${pctOfToday(item.rmdSold, startNetWorth)} RMD` : null,
                showChange
                  ? `${signedPctOfToday(change, startNetWorth)} ${item.changeLabel ?? 'since last year'}`
                  : null,
                showGrowth ? `${signedPctOfToday(item.growth ?? 0, startNetWorth)} return` : null,
              ]
            : [
                item.rmdSold != null ? `−${usd.format(item.rmdSold)} RMD` : null,
                showChange ? `${signedUsd(change)} ${item.changeLabel ?? 'since last year'}` : null,
                showGrowth ? `${signedUsd(item.growth ?? 0)} return` : null,
              ]
        )
          .filter(Boolean)
          .join(' · ')
        return (
          <li key={item.id} className="pl-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-base-content/80">{item.name}</span>
              <span className="shrink-0 text-right">
                <span className="tabular-nums">
                  {presentation
                    ? pctOfToday(item.amount, startNetWorth)
                    : showMonthly
                      ? usdWithMonthly(item.amount)
                      : usd.format(item.amount)}
                </span>
                {detail ? (
                  <span className="ml-1.5 whitespace-nowrap text-[10px] text-base-content/60">
                    {detail}
                  </span>
                ) : null}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
