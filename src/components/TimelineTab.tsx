import { collectTimelineEvents, groupTimelineEvents, type TimelineKind } from '../planCopy'
import { accountHasRmd, ageAtPlanYear, firstRmdByAccount } from '../simulation'
import { rmdStartAge } from '../rmd'
import { usd } from '../format'
import type { Plan, Projection } from '../types'

type TimelineTabProps = {
  plan: Plan
  projection: Projection
}

const KIND_BADGE: Record<TimelineKind, string> = {
  start: 'badge-neutral',
  income: 'badge-success',
  expense: 'badge-error',
  transfer: 'badge-warning',
  rmd: 'badge-info',
  depleted: 'badge-warning',
  horizon: 'badge-info',
}

const KIND_DOT: Record<TimelineKind, string> = {
  start: 'bg-neutral',
  income: 'bg-success',
  expense: 'bg-error',
  transfer: 'bg-warning',
  rmd: 'bg-info',
  depleted: 'bg-warning',
  horizon: 'bg-info',
}

const KIND_LABEL: Record<TimelineKind, string> = {
  start: 'Plan',
  income: 'Income',
  expense: 'Expense',
  transfer: 'Accounts',
  rmd: 'RMD',
  depleted: 'Savings',
  horizon: 'Horizon',
}

export function TimelineTab({ plan, projection }: TimelineTabProps) {
  const groups = groupTimelineEvents(collectTimelineEvents(plan, projection))
  const firstRmds = [...firstRmdByAccount(projection).values()].sort(
    (a, b) => a.yearOffset - b.yearOffset,
  )
  const rmdStart = rmdStartAge(plan.birthDate)
  const ageToday = ageAtPlanYear(plan, 0)
  const lastAge = projection.points.at(-1)?.age
  const hasRmdBalance = (plan.accounts ?? []).some(
    (account) => accountHasRmd(account.kind) && account.amount > 0.005,
  )

  return (
    <div className="flex flex-col gap-6">
      {hasRmdBalance && firstRmds[0] ? (
        <div className="alert alert-info">
          <span>
            401(k) and IRA wallet-refill sales wait until long-term is gone. From age {rmdStart},
            1 ÷ (100 − age) is sold into the primary source. Required sales start{' '}
            {firstRmds[0].yearOffset === 0
              ? 'today'
              : firstRmds[0].age != null
                ? `at age ${firstRmds[0].age}`
                : `in ${firstRmds[0].yearOffset} years`}
            : {usd.format(firstRmds[0].move.sold)} from {firstRmds[0].move.fromName} into{' '}
            {firstRmds[0].move.toName}. Scroll to the blue RMD events — yellow Accounts events are
            wallet refills from long-term.
          </span>
        </div>
      ) : hasRmdBalance && lastAge != null && lastAge < rmdStart ? (
        <div className="alert alert-warning">
          <span>
            Date of birth is set
            {ageToday != null ? ` (age ${ageToday} today)` : ''}, but the plan ends at age {lastAge}
            . RMDs start at age {rmdStart}. Raise &quot;Project until age&quot; on the Plan tab to
            see 401(k) and IRA sales.
          </span>
        </div>
      ) : null}
      {groups.length === 0 ? (
        <div className="alert">
          <span>No events to show. Add income or expenses on the Plan tab.</span>
        </div>
      ) : (
        <ol className="relative ml-3 border-l-2 border-base-300">
          {groups.map((group) => (
            <li key={group.calendarYear} className="relative mb-8 last:mb-0">
              <div className="absolute -left-[9px] mt-1.5 size-4 rounded-full border-2 border-base-100 bg-base-300" />
              <h3 className="mb-3 pl-6 text-sm font-semibold uppercase tracking-wide text-base-content/70">
                {group.heading}
              </h3>
              <div className="flex flex-col gap-3 pl-6">
                {group.events.map((event) => (
                  <article key={event.id} className="card bg-base-100 shadow-sm">
                    <div className="card-body gap-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`size-2.5 shrink-0 rounded-full ${KIND_DOT[event.kind]}`} />
                        <h4 className="font-semibold">{event.title}</h4>
                        <span className={`badge badge-sm ${KIND_BADGE[event.kind]}`}>
                          {KIND_LABEL[event.kind]}
                        </span>
                        {event.whenLabel !== 'today' && !event.whenLabel.startsWith('in ') ? (
                          <span className="text-xs text-base-content/60">{event.whenLabel}</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-base-content/80">{event.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
