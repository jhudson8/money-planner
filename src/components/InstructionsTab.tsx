import { calendarYearAtOffset } from '../dates'
import { usd, yearsPhrase } from '../format'
import { maskUsd, usePresentation } from '../presentation'
import { ageAtPlanYear, replenishYears, walletWindowFunding } from '../simulation'
import type { AccountMove, Plan, Projection, YearProjection } from '../types'

type InstructionsTabProps = {
  plan: Plan
  projection: Projection
}

type YearActions = {
  point: YearProjection
  sales: AccountMove[]
  transfers: AccountMove[]
  rmds: AccountMove[]
  totalSold: number
  totalTax: number
  totalNet: number
}

function yearActions(point: YearProjection): YearActions {
  const moves = point.accountMoves ?? []
  const sales = moves.filter((m) => m.reason === 'sale')
  const transfers = moves.filter((m) => m.reason === 'transfer')
  const rmds = moves.filter((m) => m.reason === 'rmd')
  const all = [...sales, ...transfers, ...rmds]
  return {
    point,
    sales,
    transfers,
    rmds,
    totalSold: all.reduce((sum, m) => sum + m.sold, 0),
    totalTax: all.reduce((sum, m) => sum + m.tax, 0),
    totalNet: all.reduce((sum, m) => sum + m.net, 0),
  }
}

function hasActions(actions: YearActions): boolean {
  return actions.sales.length + actions.transfers.length + actions.rmds.length > 0
}

function yearHeading(point: YearProjection): string {
  const calendar = calendarYearAtOffset(point.yearOffset)
  if (point.yearOffset === 0) {
    return point.age != null ? `Today · ${calendar} · age ${point.age}` : `Today · ${calendar}`
  }
  if (point.age != null) return `${calendar} · age ${point.age}`
  return `${calendar} · year ${point.yearOffset}`
}

export function InstructionsTab({ plan, projection }: InstructionsTabProps) {
  const presentation = usePresentation()
  const today = projection.points[0]
  const todayActions = today ? yearActions(today) : null
  const upcoming = projection.points
    .slice(1)
    .map(yearActions)
    .filter(hasActions)
    .slice(0, 12)
  const windowYears = replenishYears(plan)
  const ageToday = ageAtPlanYear(plan, 0)
  const needThisYear = today ? Math.max(0, today.expenses - today.income) : 0
  const windowFunding = walletWindowFunding(plan)
  const walletName =
    plan.accounts.find((a) => a.kind === 'shortTerm')?.name.trim() || 'Short-term wallet'

  return (
    <div className="flex flex-col gap-6">
      <section className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body gap-3">
          <h2 className="card-title">Instructions</h2>
          <p className="text-sm text-base-content/70">
            Concrete moves implied by this plan: what to sell, estimated tax, and where the money
            should go. Amounts are model estimates — not tax advice.
            {ageToday != null ? ` You are age ${ageToday} today.` : ''}
          </p>
        </div>
      </section>

      <WalletWindowPanel
        funding={windowFunding}
        walletName={walletName}
        presentation={presentation}
      />

      {todayActions ? (
        <TodayPanel
          actions={todayActions}
          needThisYear={needThisYear}
          windowYears={windowYears}
          presentation={presentation}
        />
      ) : null}

      <section className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="card-title text-lg">Upcoming moves</h3>
            <p className="text-sm text-base-content/65">
              Later years where the model sells, transfers, or takes an RMD. Empty years with only
              spending from the wallet are skipped.
            </p>
          </div>

          {upcoming.length === 0 ? (
            <div className="alert alert-info text-sm">
              <span>
                No sales, transfers, or RMDs are scheduled in the near term. Everyday spending stays
                in the wallet until a refill, maturity transfer, or RMD year.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {upcoming.map((actions) => (
                <UpcomingYearCard
                  key={actions.point.yearOffset}
                  actions={actions}
                  presentation={presentation}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function WalletWindowPanel({
  funding,
  walletName,
  presentation,
}: {
  funding: ReturnType<typeof walletWindowFunding>
  walletName: string
  presentation: boolean
}) {
  const windowLabel = yearsPhrase(funding.windowYears)
  const needsFill = funding.gap > 0.005

  return (
    <section className="card bg-base-100 shadow-sm border border-warning/40">
      <div className="card-body gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">
              Initial wallet fill
            </p>
            <h3 className="text-xl font-bold">
              Fund the {windowLabel} replenish window
            </h3>
            <p className="text-sm text-base-content/65 mt-1 max-w-2xl">
              Target is the sum of spending minus income for the next {windowLabel}. Move enough
              into <strong>{walletName}</strong> so that window is covered after tax.
            </p>
          </div>
          {needsFill ? (
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-warning badge-lg tabular-nums font-semibold">
                Need {maskUsd(funding.gap, presentation, usd)} in wallet
              </span>
              {funding.tax > 0.005 ? (
                <span className="badge badge-error badge-outline badge-lg tabular-nums font-semibold">
                  Tax ~{maskUsd(funding.tax, presentation, usd)}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="badge badge-success badge-outline">
              Wallet already covers {windowLabel}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Stat
            label={`${windowLabel} target`}
            value={maskUsd(funding.target, presentation, usd)}
            hint="Spending − income over the replenish window"
          />
          <Stat
            label="In wallet today"
            value={maskUsd(funding.walletNow, presentation, usd)}
            hint={walletName}
          />
          <Stat
            label="Still to fund"
            value={maskUsd(funding.gap, presentation, usd)}
            hint="Net dollars the wallet should receive"
            danger={needsFill}
          />
        </div>

        {!needsFill ? (
          <div className="rounded-box border border-success/30 bg-success/5 p-4 text-sm text-base-content/80">
            Your wallet already holds at least{' '}
            <strong className="tabular-nums">{maskUsd(funding.target, presentation, usd)}</strong>{' '}
            for the next {windowLabel}. No initial refill is required.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-base-content/80">
              Sell about{' '}
              <strong className="tabular-nums">
                {maskUsd(
                  funding.moves.reduce((sum, m) => sum + m.sold, 0),
                  presentation,
                  usd,
                )}
              </strong>{' '}
              from long-term (and retirement if needed) so{' '}
              <strong className="tabular-nums">{maskUsd(funding.filled, presentation, usd)}</strong>{' '}
              lands in {walletName}
              {funding.tax > 0.005 ? (
                <>
                  {' '}
                  after setting aside about{' '}
                  <strong className="tabular-nums text-error">
                    {maskUsd(funding.tax, presentation, usd)}
                  </strong>{' '}
                  for tax
                </>
              ) : null}
              .
            </p>

            {funding.moves.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {funding.moves.map((move, index) => (
                  <InstructionStep
                    key={`window-${move.fromId}-${index}`}
                    number={index + 1}
                    kind="sale"
                    move={move}
                    presentation={presentation}
                  />
                ))}
              </ol>
            ) : (
              <div className="alert alert-warning text-sm">
                <span>
                  Need {maskUsd(funding.gap, presentation, usd)} more in the wallet, but no eligible
                  account has a balance to sell (transfer-locked accounts are skipped).
                </span>
              </div>
            )}

            {funding.shortfall > 0.5 ? (
              <div className="alert alert-error text-sm">
                <span>
                  Only {maskUsd(funding.filled, presentation, usd)} of the{' '}
                  {maskUsd(funding.gap, presentation, usd)} needed could be funded. Shortfall{' '}
                  {maskUsd(funding.shortfall, presentation, usd)}.
                </span>
              </div>
            ) : null}

            {funding.tax > 0.005 ? (
              <div className="rounded-box border border-error/30 bg-error/5 p-4 text-sm">
                <p className="font-semibold text-error">
                  Estimated tax to set aside:{' '}
                  <span className="tabular-nums">{maskUsd(funding.tax, presentation, usd)}</span>
                </p>
                <p className="text-xs text-base-content/70 mt-1">
                  Gross sales{' '}
                  <span className="tabular-nums">
                    {maskUsd(
                      funding.moves.reduce((sum, m) => sum + m.sold, 0),
                      presentation,
                      usd,
                    )}
                  </span>
                  ; net into wallet{' '}
                  <span className="tabular-nums">
                    {maskUsd(funding.filled, presentation, usd)}
                  </span>
                  . Tax leaves net worth in this model.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}

function TodayPanel({
  actions,
  needThisYear,
  windowYears,
  presentation,
}: {
  actions: YearActions
  needThisYear: number
  windowYears: number
  presentation: boolean
}) {
  const { point, sales, transfers, rmds } = actions
  const active = hasActions(actions)

  return (
    <section className="card bg-base-100 shadow-sm border border-primary/30">
      <div className="card-body gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Do this now
            </p>
            <h3 className="text-xl font-bold">{yearHeading(point)}</h3>
            <p className="text-sm text-base-content/65 mt-1">
              Spending need this year (expenses − income):{' '}
              <span className="font-semibold tabular-nums text-base-content">
                {maskUsd(needThisYear, presentation, usd)}
              </span>
              . Wallet holds about {yearsPhrase(windowYears)} of net spending when kept full.
            </p>
          </div>
          {active ? (
            <TotalsBadges actions={actions} presentation={presentation} />
          ) : (
            <span className="badge badge-success badge-outline">No sales required today</span>
          )}
        </div>

        {!active ? (
          <div className="rounded-box border border-success/30 bg-success/5 p-4 text-sm text-base-content/80">
            Pay this year&apos;s spending from the active wallet. Nothing needs to be sold or
            transferred today according to the model.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-3">
              {sales.map((move, index) => (
                <InstructionStep
                  key={`sale-${move.fromId}-${index}`}
                  number={index + 1}
                  kind="sale"
                  move={move}
                  presentation={presentation}
                />
              ))}
              {transfers.map((move, index) => (
                <InstructionStep
                  key={`xfer-${move.fromId}-${index}`}
                  number={sales.length + index + 1}
                  kind="transfer"
                  move={move}
                  presentation={presentation}
                />
              ))}
              {rmds.map((move, index) => (
                <InstructionStep
                  key={`rmd-${move.fromId}-${index}`}
                  number={sales.length + transfers.length + index + 1}
                  kind="rmd"
                  move={move}
                  presentation={presentation}
                />
              ))}
            </ol>

            <TaxSummary actions={actions} presentation={presentation} />
          </div>
        )}
      </div>
    </section>
  )
}

function TotalsBadges({
  actions,
  presentation,
}: {
  actions: YearActions
  presentation: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="badge badge-warning badge-lg tabular-nums font-semibold">
        Sell {maskUsd(actions.totalSold, presentation, usd)}
      </span>
      <span className="badge badge-error badge-outline badge-lg tabular-nums font-semibold">
        Tax ~{maskUsd(actions.totalTax, presentation, usd)}
      </span>
      <span className="badge badge-success badge-outline badge-lg tabular-nums font-semibold">
        Move {maskUsd(actions.totalNet, presentation, usd)}
      </span>
    </div>
  )
}

function InstructionStep({
  number,
  kind,
  move,
  presentation,
}: {
  number: number
  kind: 'sale' | 'transfer' | 'rmd'
  move: AccountMove
  presentation: boolean
}) {
  const title =
    kind === 'sale'
      ? `Sell from ${move.fromName}`
      : kind === 'transfer'
        ? `Transfer / mature ${move.fromName}`
        : `Take RMD from ${move.fromName}`

  const verb =
    kind === 'sale' ? 'Sell' : kind === 'transfer' ? 'Sell / transfer' : 'Distribute (RMD)'

  const destinationHint =
    kind === 'sale'
      ? `Move ${maskUsd(move.net, presentation, usd)} into ${move.toName} (wallet).`
      : kind === 'transfer'
        ? `Move ${maskUsd(move.net, presentation, usd)} into ${move.toName}.`
        : `Move ${maskUsd(move.net, presentation, usd)} into ${move.toName} (primary long-term).`

  return (
    <li className="rounded-box border border-base-200 bg-base-200/30 p-4 flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-content text-sm font-bold">
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold text-base">{title}</h4>
          <span
            className={`badge badge-sm ${
              kind === 'sale'
                ? 'badge-warning'
                : kind === 'transfer'
                  ? 'badge-primary'
                  : 'badge-info'
            }`}
          >
            {kind === 'sale' ? 'Wallet refill' : kind === 'transfer' ? 'Account transfer' : 'RMD'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <Stat
            label={`${verb}`}
            value={maskUsd(move.sold, presentation, usd)}
            hint="Gross amount from this account"
          />
          <Stat
            label="Estimated tax"
            value={maskUsd(move.tax, presentation, usd)}
            hint="Leaves the accounts (not paid from the destination)"
            danger={move.tax > 0.005}
          />
          <Stat
            label={`To ${move.toName}`}
            value={maskUsd(move.net, presentation, usd)}
            hint="Net after tax"
          />
        </div>

        <p className="text-sm text-base-content/75 leading-relaxed">
          {verb}{' '}
          <strong className="tabular-nums">{maskUsd(move.sold, presentation, usd)}</strong> from{' '}
          <strong>{move.fromName}</strong>
          {move.tax > 0.005 ? (
            <>
              . Set aside about{' '}
              <strong className="tabular-nums text-error">
                {maskUsd(move.tax, presentation, usd)}
              </strong>{' '}
              for tax
            </>
          ) : (
            '. No tax on this move in the model'
          )}
          . {destinationHint}
        </p>
      </div>
    </li>
  )
}

function Stat({
  label,
  value,
  hint,
  danger = false,
}: {
  label: string
  value: string
  hint: string
  danger?: boolean
}) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50">
        {label}
      </p>
      <p className={`text-base font-bold tabular-nums ${danger ? 'text-error' : 'text-base-content'}`}>
        {value}
      </p>
      <p className="text-[11px] text-base-content/55">{hint}</p>
    </div>
  )
}

function TaxSummary({
  actions,
  presentation,
}: {
  actions: YearActions
  presentation: boolean
}) {
  if (actions.totalTax <= 0.005) {
    return (
      <div className="rounded-box border border-base-200 bg-base-200/40 p-3 text-sm text-base-content/75">
        Estimated tax on today&apos;s moves: <strong>$0</strong> in this simplified model.
      </div>
    )
  }

  return (
    <div className="rounded-box border border-error/30 bg-error/5 p-4 flex flex-col gap-1 text-sm">
      <p className="font-semibold text-error">
        Estimated tax to set aside:{' '}
        <span className="tabular-nums">{maskUsd(actions.totalTax, presentation, usd)}</span>
      </p>
      <p className="text-base-content/70 text-xs leading-relaxed">
        After selling{' '}
        <span className="tabular-nums font-medium">
          {maskUsd(actions.totalSold, presentation, usd)}
        </span>
        , about{' '}
        <span className="tabular-nums font-medium">
          {maskUsd(actions.totalNet, presentation, usd)}
        </span>{' '}
        reaches the destination accounts. Tax is modeled as leaving your net worth — it is not taken
        from the wallet or income.
      </p>
    </div>
  )
}

function UpcomingYearCard({
  actions,
  presentation,
}: {
  actions: YearActions
  presentation: boolean
}) {
  const { point, sales, transfers, rmds } = actions

  return (
    <article className="rounded-box border border-base-200 bg-base-200/20 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{yearHeading(point)}</h4>
        <div className="flex flex-wrap gap-1.5">
          {sales.length > 0 ? (
            <span className="badge badge-sm badge-warning">
              {sales.length} sale{sales.length === 1 ? '' : 's'}
            </span>
          ) : null}
          {transfers.length > 0 ? (
            <span className="badge badge-sm badge-primary">
              {transfers.length} transfer{transfers.length === 1 ? '' : 's'}
            </span>
          ) : null}
          {rmds.length > 0 ? (
            <span className="badge badge-sm badge-info">
              {rmds.length} RMD{rmds.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {[...sales, ...transfers, ...rmds].map((move, index) => (
          <li
            key={`${point.yearOffset}-${move.reason}-${move.fromId}-${index}`}
            className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 rounded-box bg-base-100 border border-base-200 px-3 py-2"
          >
            <span>
              <span className="font-medium">{move.fromName}</span>
              <span className="text-base-content/50"> → </span>
              <span className="font-medium">{move.toName}</span>
              <span className="badge badge-ghost badge-xs ml-2 align-middle">
                {move.reason === 'sale' ? 'sell' : move.reason === 'transfer' ? 'transfer' : 'rmd'}
              </span>
            </span>
            <span className="tabular-nums text-xs sm:text-sm text-base-content/75">
              sell {maskUsd(move.sold, presentation, usd)}
              {move.tax > 0.005 ? (
                <>
                  {' '}
                  · tax{' '}
                  <span className="text-error">{maskUsd(move.tax, presentation, usd)}</span>
                </>
              ) : null}
              {' '}
              · net {maskUsd(move.net, presentation, usd)}
            </span>
          </li>
        ))}
      </ul>

      {actions.totalTax > 0.005 ? (
        <p className="text-xs text-error font-medium tabular-nums">
          Estimated tax that year: {maskUsd(actions.totalTax, presentation, usd)}
        </p>
      ) : null}
    </article>
  )
}
