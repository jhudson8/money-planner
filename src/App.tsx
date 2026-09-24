import { useEffect, useMemo, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { PresentationProvider, pctVsStart, usePresentation, useSetPresentation } from './presentation'
import { CashFlowTab } from './components/CashFlowTab'
import { ChartTab } from './components/ChartTab'
import { InstructionsTab } from './components/InstructionsTab'
import { JsonTab } from './components/JsonTab'
import { PlanTab } from './components/PlanTab'
import { ScenarioBar } from './components/ScenarioBar'
import { SummaryTab } from './components/SummaryTab'
import { SweepTab } from './components/SweepTab'
import { TimelineTab } from './components/TimelineTab'
import { ChallengeTab } from './components/ChallengeTab'
import { createDefaultPlan } from './defaultPlan'
import { shorthandUsd, usd, yearsPhrase } from './format'
import {
  alignHistoricalAccountStartYears,
  clampHistoricalStartYear,
} from './marketHistory'
import {
  currentNetWorth,
  cycleReplenishWaitMode,
  labelForKind,
  MAX_REPLENISH_YEARS,
  MIN_REPLENISH_YEARS,
  replenishWaitMode,
  replenishWaitModeLabel,
  replenishWaitModeOrdinal,
  replenishYears,
  simulate,
  yearsToProject,
} from './simulation'
import { getLastSpSliderAccountId } from './spSliderFocus'
import {
  activeScenario,
  coercePlan,
  createScenario,
  loadLibrary,
  saveLibrary,
  uniqueScenarioName,
  withActivePlan,
} from './storage'
import { historicalStartYearBounds } from './sweepAnalysis'
import type { Plan, ScenarioLibrary } from './types'
import { logVerificationPrompt } from './verificationPrompt'

const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'income', label: 'Income' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'summary', label: 'Summary' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'chart', label: 'Net worth' },
  { id: 'sweep', label: 'S&P sweep' },
  { id: 'challenge', label: 'External AI Sanity Check' },
  { id: 'json', label: 'JSON' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  return (
    <PresentationProvider>
      <Toaster position="bottom-center" richColors closeButton />
      <AppInner />
    </PresentationProvider>
  )
}

function AppInner() {
  const [library, setLibrary] = useState<ScenarioLibrary>(() => loadLibrary())
  const [tab, setTab] = useState<TabId>('plan')
  const scenario = activeScenario(library)
  const plan = scenario.plan
  const projection = useMemo(() => simulate(plan), [plan])

  useEffect(() => {
    logVerificationPrompt(plan, projection, scenario.name)
  }, [plan, projection, scenario.name])

  useEffect(() => {
    if (plan.version !== 16) {
      const next = coercePlan(plan)
      if (next) {
        setLibrary((current) => withActivePlan(current, next))
        return
      }
    }
    saveLibrary(library)
  }, [library, plan])

  useEffect(() => {
    function typingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return (
        tag === 'TEXTAREA' ||
        target.isContentEditable ||
        (tag === 'INPUT' &&
          target instanceof HTMLInputElement &&
          (target.type === 'text' ||
            target.type === 'search' ||
            target.type === 'email' ||
            target.type === 'password' ||
            target.type === 'url' ||
            target.type === 'number'))
      )
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
      if (typingTarget(event.target)) return

      if (event.key === '/' || event.key === '?' || event.code === 'Slash') {
        event.preventDefault()
        setLibrary((current) => {
          const active = activeScenario(current)
          const next = cycleReplenishWaitMode(replenishWaitMode(active.plan))
          toast.success(`${replenishWaitModeLabel(next)} (${replenishWaitModeOrdinal(next)})`, {
            id: 'wait-high-risk-growth',
            description: 'Shift+/ cycles Off → YoY growth → Recovery to peak',
          })
          return withActivePlan(current, {
            ...active.plan,
            replenishWaitMode: next,
          })
        })
        return
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const delta = event.key === 'ArrowRight' ? 1 : -1
        setLibrary((current) => {
          const active = activeScenario(current)
          const accounts = active.plan.accounts ?? []
          const accountId = getLastSpSliderAccountId()
          if (!accountId) {
            toast.message('Focus an account’s S&P start-year slider first', {
              id: 'sp-start-year',
              description: 'Shift+← / Shift+→ to adjust',
            })
            return current
          }
          const account = accounts.find((item) => item.id === accountId)
          if (!account || account.returnMode !== 'historical') {
            toast.message('Last focused account is not on a historical S&P path', {
              id: 'sp-start-year',
            })
            return current
          }
          const simYears = yearsToProject(active.plan)
          const { min: minStart, max: maxStart } = historicalStartYearBounds(active.plan)
          const currentStart = Math.min(
            account.historicalStartYear ?? minStart,
            maxStart,
          )
          const nextStart = Math.min(
            maxStart,
            Math.max(minStart, clampHistoricalStartYear(currentStart + delta, simYears)),
          )
          const accountName = account.name.trim() || labelForKind(account.kind)
          const historicalCount = accounts.filter((item) => item.returnMode === 'historical').length
          if (nextStart === currentStart) {
            toast.message(`${accountName}: S&P start already ${currentStart}`, {
              id: 'sp-start-year',
            })
            return current
          }
          toast.success(
            `${historicalCount} S&P ${historicalCount === 1 ? 'account' : 'accounts'}: ${nextStart} → ${nextStart + simYears - 1}`,
            {
              id: 'sp-start-year',
              description: 'Shift+← / Shift+→ to adjust',
            },
          )
          return withActivePlan(current, {
            ...active.plan,
            accounts: alignHistoricalAccountStartYears(accounts, nextStart, simYears),
          })
        })
        return
      }

      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

      event.preventDefault()
      const delta = event.key === 'ArrowUp' ? 1 : -1
      setLibrary((current) => {
        const active = activeScenario(current)
        const currentYears = replenishYears(active.plan)
        const nextYears = Math.min(
          MAX_REPLENISH_YEARS,
          Math.max(MIN_REPLENISH_YEARS, currentYears + delta),
        )
        if (nextYears === currentYears) {
          toast.message(`Replenish window already ${yearsPhrase(currentYears)}`, {
            id: 'replenish-window',
          })
          return current
        }
        toast.success(`Replenish window: ${yearsPhrase(nextYears)}`, {
          id: 'replenish-window',
          description: 'Shift+↑ / Shift+↓ to adjust',
        })
        return withActivePlan(current, { ...active.plan, replenishYears: nextYears })
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function setPlan(next: Plan) {
    setLibrary((current) => withActivePlan(current, next))
  }

  function switchScenario(id: string) {
    setLibrary((current) => (current.scenarios.some((item) => item.id === id) ? { ...current, activeId: id } : current))
  }

  function renameScenario(name: string) {
    setLibrary((current) => {
      const active = activeScenario(current)
      return {
        ...current,
        scenarios: current.scenarios.map((item) =>
          item.id === active.id ? { ...item, name } : item,
        ),
      }
    })
  }

  function saveAsNew() {
    setLibrary((current) => {
      const active = activeScenario(current)
      const copy = createScenario(
        uniqueScenarioName(current, active.name.trim() || 'Untitled'),
        active.plan,
      )
      return {
        ...current,
        activeId: copy.id,
        scenarios: [...current.scenarios, copy],
      }
    })
  }

  function newExample() {
    setLibrary((current) => {
      const copy = createScenario(uniqueScenarioName(current, 'Example'), createDefaultPlan())
      return {
        ...current,
        activeId: copy.id,
        scenarios: [...current.scenarios, copy],
      }
    })
  }

  function deleteScenario() {
    const active = activeScenario(library)
    if (library.scenarios.length < 2) return
    if (!window.confirm(`Delete scenario "${active.name.trim() || 'Untitled'}"? This cannot be undone.`)) {
      return
    }
    setLibrary((current) => {
      if (current.scenarios.length < 2) return current
      const index = current.scenarios.findIndex((item) => item.id === current.activeId)
      const remaining = current.scenarios.filter((item) => item.id !== current.activeId)
      const next = remaining[Math.max(0, index - 1)] ?? remaining[0]
      return { ...current, activeId: next.id, scenarios: remaining }
    })
  }

  const presentation = usePresentation()
  const startNW = currentNetWorth(plan)
  const years = yearsToProject(plan)
  const endAge = projection.points.at(-1)?.age ?? null
  const depletedAge =
    projection.depletedInYear != null
      ? (projection.points.find((p) => p.yearOffset === projection.depletedInYear)?.age ?? null)
      : null

  return (
    <div className="min-h-screen bg-base-200" data-presentation={presentation ? '1' : '0'}>
      <header className="sticky top-0 z-20 bg-base-100 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
          <ScenarioBar
            library={library}
            onSwitch={switchScenario}
            onRename={renameScenario}
            onSaveAs={saveAsNew}
            onNewExample={newExample}
            onDelete={deleteScenario}
          />
          <div className="flex flex-wrap items-center gap-2">
            <TabList
              tab={tab}
              onChange={setTab}
              trend={
                projection.endNetWorth > startNW
                  ? 'up'
                  : projection.endNetWorth < startNW
                    ? 'down'
                    : null
              }
              startNetWorth={startNW}
              endNetWorth={projection.endNetWorth}
              endAge={endAge}
              years={years}
              depletedAge={depletedAge}
            />
            <HeaderControls />
          </div>
          {presentation ? (
            <div className="alert alert-info py-2 text-sm">
              <span>Presentation mode — dollar amounts are hidden; chart shows % change from today.</span>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 overflow-x-hidden">
        {tab === 'plan' ? (
          <PlanTab
            plan={plan}
            projection={projection}
            onChange={setPlan}
            onNavigateTab={setTab}
          />
        ) : null}
        {tab === 'income' ? (
          <CashFlowTab
            kind="income"
            sources={plan.incomeSources}
            onChange={(incomeSources) => setPlan({ ...plan, incomeSources })}
          />
        ) : null}
        {tab === 'expenses' ? (
          <CashFlowTab
            kind="expense"
            sources={plan.expenseSources}
            onChange={(expenseSources) => setPlan({ ...plan, expenseSources })}
          />
        ) : null}
        {tab === 'instructions' ? (
          <InstructionsTab plan={plan} projection={projection} />
        ) : null}
        {tab === 'timeline' ? <TimelineTab plan={plan} projection={projection} /> : null}
        {tab === 'summary' ? <SummaryTab plan={plan} projection={projection} /> : null}
        {tab === 'chart' ? <ChartTab plan={plan} projection={projection} /> : null}
        {tab === 'sweep' ? <SweepTab plan={plan} onChange={setPlan} /> : null}
        {tab === 'challenge' ? (
          <ChallengeTab plan={plan} projection={projection} scenarioName={scenario.name} />
        ) : null}
        {tab === 'json' ? (
          <JsonTab key={scenario.id} plan={plan} onChange={setPlan} />
        ) : null}
      </main>
    </div>
  )
}

function HeaderControls() {
  const presentation = usePresentation()
  const setPresentation = useSetPresentation()
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <label
        className="swap swap-rotate btn btn-ghost btn-sm btn-square"
        title="Dark theme"
        aria-label="Dark theme"
      >
        <input type="checkbox" className="theme-controller" value="business" />
        <SunIcon className="swap-off size-4" />
        <MoonIcon className="swap-on size-4" />
      </label>
      <button
        type="button"
        className={`btn btn-ghost btn-sm btn-square ${presentation ? 'btn-active text-primary' : ''}`}
        title={presentation ? 'Exit presentation mode' : 'Presentation mode — hide dollar amounts'}
        aria-label={presentation ? 'Exit presentation mode' : 'Presentation mode'}
        aria-pressed={presentation}
        onClick={() => setPresentation(!presentation)}
      >
        {presentation ? <EyeOffIcon /> : <PresentationIcon />}
      </button>
    </div>
  )
}

function TabList({
  tab,
  onChange,
  trend,
  startNetWorth,
  endNetWorth,
  endAge,
  years,
  depletedAge,
}: {
  tab: TabId
  onChange: (tab: TabId) => void
  trend: 'up' | 'down' | null
  startNetWorth: number
  endNetWorth: number
  endAge: number | null
  years: number
  depletedAge: number | null
}) {
  const presentation = usePresentation()
  const depleted = endNetWorth <= 0.005

  const endNetWorthText = depleted
    ? null
    : presentation
      ? pctVsStart(endNetWorth, startNetWorth)
      : shorthandUsd.format(endNetWorth)

  const trendLabel =
    trend === 'up'
      ? 'Projected net worth is higher than today'
      : trend === 'down'
        ? 'Projected net worth is lower than today'
        : null

  const chartTitle = depleted
    ? `Net worth reached $0${depletedAge != null ? ` at age ${depletedAge}` : ''}`
    : presentation
      ? `Projected net worth after ${years} years: ${pctVsStart(endNetWorth, startNetWorth)} vs today`
      : `Projected net worth after ${years} years${endAge != null ? ` (age ${endAge})` : ''}: ${usd.format(endNetWorth)} · Started at ${usd.format(startNetWorth)} today`

  return (
    <div role="tablist" className="tabs tabs-box flex flex-wrap min-w-0 flex-1">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          className={`tab gap-1.5 ${tab === item.id ? 'tab-active' : ''}`}
          aria-label={
            item.id === 'summary' && trendLabel
              ? `Summary, ${trendLabel.toLowerCase()}`
              : item.id === 'chart'
                ? chartTitle
                : undefined
          }
          title={item.id === 'chart' ? chartTitle : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.id === 'chart' ? (
            depleted ? (
              <span
                className="badge badge-sm font-semibold tabular-nums badge-error text-error-content"
                title={chartTitle}
              >
                {depletedAge != null ? `$0 at ${depletedAge}` : '$0'}
              </span>
            ) : (
              <span className="badge badge-sm font-normal tabular-nums">
                {endNetWorthText}
              </span>
            )
          ) : null}
          {item.id === 'summary' && trend === 'up' ? (
            <span className="text-success inline-flex" title={trendLabel ?? undefined}>
              <TrendingUpIcon />
            </span>
          ) : null}
          {item.id === 'summary' && trend === 'down' ? (
            <span className="text-error inline-flex" title={trendLabel ?? undefined}>
              <TrendingDownIcon />
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
      />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 14.25A8.25 8.25 0 1 1 9.75 3 6.75 6.75 0 0 0 21 14.25Z"
      />
    </svg>
  )
}

function PresentationIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="size-4" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 4.5h16.5M4.5 4.5v9.75A1.75 1.75 0 0 0 6.25 16h11.5a1.75 1.75 0 0 0 1.75-1.75V4.5M12 16v3.5m-3.5 0h7"
      />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="size-4" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.45 10.45 0 0 0 1.93 12C3.23 15.98 7.24 19 12 19c.99 0 1.94-.16 2.83-.46M6.23 6.23A10.45 10.45 0 0 1 12 5c4.76 0 8.77 3.02 10.07 7-.38 1.16-.96 2.23-1.7 3.16M6.23 6.23 3 3m3.23 3.23 11.54 11.54M21 21l-3.23-3.23"
      />
    </svg>
  )
}

function TrendingUpIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="size-4"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"
      />
    </svg>
  )
}

function TrendingDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="size-4"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181"
      />
    </svg>
  )
}
