import { useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createEmptySource, createEmptyStep } from '../defaultPlan'
import { sourceAmountInYear, timingToYearOffset } from '../simulation'
import { usd } from '../format'
import { maskUsd, usePresentation } from '../presentation'
import { ScheduleStepRow } from './ScheduleStepRow'
import type { CashFlowSource, ScheduleStep } from '../types'

export type CashFlowTabProps = {
  kind: 'income' | 'expense'
  sources: CashFlowSource[]
  onChange: (sources: CashFlowSource[]) => void
}

export function describeSourceSchedule(source: CashFlowSource): string {
  if (source.steps.length === 0) return 'No periods configured'

  const stepCount = source.steps.length === 1 ? '1 period' : `${source.steps.length} periods`

  const sorted = [...source.steps].sort(
    (a, b) => timingToYearOffset(a.start) - timingToYearOffset(b.start),
  )
  const first = sorted[0]
  let startText = 'Starts today'
  if (first.start.type === 'yearsFromNow') {
    startText = `Starts in ${first.start.value} ${first.start.value === 1 ? 'yr' : 'yrs'}`
  } else if (first.start.type === 'date') {
    startText = `Starts ${first.start.date}`
  }

  const hasGrowth = sorted.some((s) => !s.once && s.annualGrowthPercent !== 0)
  const hasOnce = sorted.some((s) => s.once)

  const extras: string[] = []
  if (hasGrowth) {
    const growthRates = [
      ...new Set(
        sorted
          .filter((s) => !s.once && s.annualGrowthPercent !== 0)
          .map((s) => `${s.annualGrowthPercent > 0 ? '+' : ''}${s.annualGrowthPercent}%/yr`),
      ),
    ]
    extras.push(growthRates.join(', '))
  }
  if (hasOnce) {
    extras.push('has one-time')
  }

  return [startText, stepCount, ...extras].filter(Boolean).join(' · ')
}

export function CashFlowTab({ kind, sources, onChange }: CashFlowTabProps) {
  const presentation = usePresentation()
  const [selectedId, setSelectedId] = useState<string | null>(() => sources[0]?.id ?? null)
  const [searchQuery, setSearchQuery] = useState('')

  const accentBadge = kind === 'income' ? 'badge-success' : 'badge-error'
  const toggleAccent = kind === 'income' ? 'toggle-success' : 'toggle-error'

  const activeSources = sources.filter((s) => !s.disabled)
  const totalThisYear = activeSources.reduce((sum, s) => sum + sourceAmountInYear(s, 0), 0)
  const totalMonthly = totalThisYear / 12
  const anyDisabled = sources.some((s) => s.disabled)

  const activeSource = sources.find((s) => s.id === selectedId) ?? sources[0] ?? null

  const filteredSources = useMemo(() => {
    if (!searchQuery.trim()) return sources
    const q = searchQuery.toLowerCase().trim()
    return sources.filter((s) => s.name.toLowerCase().includes(q))
  }, [sources, searchQuery])

  function handleAddSource() {
    const newSource = createEmptySource(kind === 'income' ? 'New income' : 'New expense')
    onChange([...sources, newSource])
    setSelectedId(newSource.id)
  }

  function handleRemoveSource(id: string) {
    const nextSources = sources.filter((s) => s.id !== id)
    onChange(nextSources)
    if (selectedId === id) {
      const idx = sources.findIndex((s) => s.id === id)
      const next = nextSources[idx] ?? nextSources[idx - 1] ?? nextSources[0] ?? null
      setSelectedId(next ? next.id : null)
    }
  }

  function handleUpdateSource(updated: CashFlowSource) {
    onChange(sources.map((s) => (s.id === updated.id ? updated : s)))
  }

  function handleToggleAll() {
    const nextDisabled = !anyDisabled
    onChange(sources.map((s) => ({ ...s, disabled: nextDisabled })))
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner / Stats */}
      <section className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold capitalize">{kind} Sources</h1>
                <span className={`badge ${accentBadge} font-medium`}>
                  {activeSources.length} active
                </span>
                {sources.length > activeSources.length ? (
                  <span className="badge badge-ghost text-xs">
                    {sources.length - activeSources.length} disabled
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-base-content/70">
                {kind === 'income'
                  ? 'Salary, Social Security, rental earnings, pensions, and other cash inflows that reduce wallet spending.'
                  : 'Living costs, housing, healthcare, insurance, travel, and recurring expenditures paid from your wallet.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col items-start sm:items-end bg-base-200/60 rounded-box px-3.5 py-1.5 border border-base-300/50">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-base-content/60">
                  Total Active (This Year)
                </span>
                <div className="flex items-baseline gap-1.5 font-semibold text-lg tabular-nums">
                  <span className={kind === 'income' ? 'text-success' : 'text-error'}>
                    {maskUsd(totalThisYear, presentation, usd)}/yr
                  </span>
                  <span className="text-xs font-normal text-base-content/60">
                    · {maskUsd(totalMonthly, presentation, usd)}/mo
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {sources.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleToggleAll}
                  >
                    {anyDisabled ? 'Enable all' : 'Disable all'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={handleAddSource}
                >
                  <PlusIcon />
                  Add {kind}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Master / Details Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sub-Nav (Master List) */}
        <aside className="lg:col-span-5 xl:col-span-4 flex flex-col gap-3">
          <div className="card bg-base-100 shadow-sm border border-base-200">
            <div className="card-body p-3 sm:p-4 gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-base-content/60">
                  {kind} entries ({sources.length})
                </span>
                <span className="text-xs text-base-content/50">
                  Select an entry to view or edit
                </span>
              </div>

              {sources.length > 4 ? (
                <div className="relative">
                  <input
                    type="text"
                    placeholder={`Filter ${kind} sources...`}
                    className="input input-sm input-bordered w-full pr-8 text-xs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1.5 text-xs text-base-content/50 hover:text-base-content"
                      onClick={() => setSearchQuery('')}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ) : null}

              {sources.length === 0 ? (
                <div className="text-center py-8 px-4 flex flex-col items-center gap-2">
                  <p className="text-sm text-base-content/70">No {kind} sources entered yet.</p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm mt-1"
                    onClick={handleAddSource}
                  >
                    Add {kind} source
                  </button>
                </div>
              ) : filteredSources.length === 0 ? (
                <div className="text-center py-6 text-sm text-base-content/60">
                  No sources match &quot;{searchQuery}&quot;
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[calc(100vh-17rem)] overflow-y-auto pr-1">
                  {filteredSources.map((source) => {
                    const isSelected = source.id === activeSource?.id
                    const thisYear = sourceAmountInYear(source, 0)
                    const activeThisYear = sourceAmountInYear({ ...source, disabled: false }, 0)
                    const scheduleDesc = describeSourceSchedule(source)

                    return (
                      <div
                        key={source.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(source.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedId(source.id)
                          }
                        }}
                        className={`group relative text-left p-3 rounded-box border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-base-200/80 border-primary shadow-sm ring-1 ring-primary'
                            : 'bg-base-100 hover:bg-base-200/50 border-base-200 hover:border-base-300'
                        } ${source.disabled ? 'opacity-60 hover:opacity-85' : ''}`}
                      >
                        {/* Accent left indicator */}
                        <div
                          className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${
                            isSelected ? 'bg-primary' : 'bg-transparent'
                          }`}
                        />

                        <div className="flex flex-col gap-1.5 pl-1.5">
                          {/* Name and Toggle */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm truncate text-base-content">
                              {source.name.trim() || 'Untitled'}
                            </span>
                            <div
                              className="flex items-center gap-1.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-[10px] text-base-content/60 select-none">
                                {source.disabled ? 'Off' : 'On'}
                              </span>
                              <input
                                type="checkbox"
                                className={`toggle toggle-xs ${toggleAccent}`}
                                checked={!source.disabled}
                                onChange={(e) => {
                                  handleUpdateSource({
                                    ...source,
                                    disabled: !e.target.checked,
                                  })
                                }}
                                aria-label={`Toggle ${source.name}`}
                              />
                            </div>
                          </div>

                          {/* Amount and Status Badge */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {source.disabled ? (
                              <>
                                <span className="badge badge-xs badge-ghost">Disabled</span>
                                <span className="text-[11px] text-base-content/50 tabular-nums">
                                  ({maskUsd(activeThisYear, presentation, usd)}/yr when on)
                                </span>
                              </>
                            ) : (
                              <>
                                <span className={`badge badge-sm font-semibold tabular-nums ${accentBadge}`}>
                                  {maskUsd(thisYear, presentation, usd)}/yr
                                </span>
                                <span className="text-base-content/70 tabular-nums">
                                  {maskUsd(thisYear / 12, presentation, usd)}/mo
                                </span>
                              </>
                            )}
                          </div>

                          {/* High-level schedule subtitle */}
                          <div className="flex items-center justify-between text-[11px] text-base-content/60 mt-0.5">
                            <span className="truncate pr-1">{scheduleDesc}</span>
                            {isSelected ? (
                              <span className="text-primary font-bold shrink-0">→</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {sources.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm w-full gap-1 mt-1"
                  onClick={handleAddSource}
                >
                  <PlusIcon />
                  New {kind} source
                </button>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Right Detail Pane */}
        <main className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
          {activeSource ? (
            <SourceDetailPane
              source={activeSource}
              kind={kind}
              onChange={handleUpdateSource}
              onRemove={() => handleRemoveSource(activeSource.id)}
            />
          ) : (
            <div className="card bg-base-100 shadow-sm border border-base-200">
              <div className="card-body p-8 text-center flex flex-col items-center gap-3">
                <h3 className="font-semibold text-lg">No {kind} source selected</h3>
                <p className="text-sm text-base-content/70 max-w-sm">
                  Choose a source from the list on the left to inspect and configure its schedule, or create a new one.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={handleAddSource}
                >
                  <PlusIcon />
                  Add {kind} source
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function SourceDetailPane({
  source,
  kind,
  onChange,
  onRemove,
}: {
  source: CashFlowSource
  kind: 'income' | 'expense'
  onChange: (source: CashFlowSource) => void
  onRemove: () => void
}) {
  const presentation = usePresentation()
  const thisYear = sourceAmountInYear(source, 0)
  const activeThisYear = sourceAmountInYear({ ...source, disabled: false }, 0)
  const accentBadge = kind === 'income' ? 'badge-success' : 'badge-error'
  const toggleAccent = kind === 'income' ? 'toggle-success' : 'toggle-error'

  const canReorder = source.steps.length > 1
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function updateStep(id: string, next: ScheduleStep) {
    onChange({
      ...source,
      steps: source.steps.map((step) => (step.id === id ? next : step)),
    })
  }

  function reorderSteps(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = source.steps.findIndex((step) => step.id === active.id)
    const newIndex = source.steps.findIndex((step) => step.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onChange({ ...source, steps: arrayMove(source.steps, oldIndex, newIndex) })
  }

  return (
    <article className="card bg-base-100 shadow-sm border border-base-200">
      <div className="card-body p-4 sm:p-6 gap-5">
        {/* Detail Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-3 border-b border-base-200">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
              Source Name
            </label>
            <input
              className="input input-bordered input-lg font-bold w-full max-w-lg text-lg"
              value={source.name}
              onChange={(event) => onChange({ ...source, name: event.target.value })}
              placeholder="e.g. Salary, Consulting, Living costs"
              aria-label="Source name"
            />
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {source.disabled ? (
                <>
                  <span className="badge badge-ghost font-medium">Disabled</span>
                  <span className="text-xs text-base-content/50">
                    ({maskUsd(activeThisYear, presentation, usd)}/yr when enabled)
                  </span>
                </>
              ) : (
                <>
                  <span className={`badge ${accentBadge} font-semibold`}>
                    {maskUsd(thisYear, presentation, usd)} this year
                  </span>
                  <span className="text-xs text-base-content/70">
                    · {maskUsd(thisYear / 12, presentation, usd)}/mo
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-start">
            <label className="label cursor-pointer gap-2 py-0">
              <span className="label-text text-xs text-base-content/70 select-none">
                {source.disabled ? 'Disabled' : 'Active'}
              </span>
              <input
                type="checkbox"
                className={`toggle ${toggleAccent}`}
                checked={!source.disabled}
                onChange={(event) => onChange({ ...source, disabled: !event.target.checked })}
                aria-label={`Toggle active for ${source.name}`}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-error hover:bg-error/10"
              onClick={onRemove}
            >
              Delete source
            </button>
          </div>
        </div>

        {/* Schedule & Periods Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base">Schedule Periods</h3>
            <span className="text-xs text-base-content/60 font-medium">
              {source.steps.length} {source.steps.length === 1 ? 'period' : 'periods'} configured
            </span>
          </div>
          <p className="text-xs text-base-content/70 max-w-2xl">
            Each period replaces the previous ongoing amount from that start onward. A one-time
            period is paid only in its start year and does not replace salary or other ongoing
            amounts. Drag the handle to reorder periods.
          </p>
        </div>

        {/* Periods List with DnD */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderSteps}>
          <SortableContext
            items={source.steps.map((step) => step.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {source.steps.map((step, index) => (
                <SortablePeriodItem
                  key={step.id}
                  step={step}
                  index={index}
                  kind={kind}
                  canRemove={source.steps.length > 1}
                  canReorder={canReorder}
                  onChange={(next) => updateStep(step.id, next)}
                  onRemove={() =>
                    onChange({
                      ...source,
                      steps: source.steps.filter((item) => item.id !== step.id),
                    })
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add Period Action */}
        <div className="card-actions justify-end pt-2 border-t border-base-200">
          <button
            type="button"
            className="btn btn-outline btn-sm gap-1.5"
            onClick={() => onChange({ ...source, steps: [...source.steps, createEmptyStep()] })}
          >
            <PlusIcon />
            Add time period
          </button>
        </div>
      </div>
    </article>
  )
}

function SortablePeriodItem({
  step,
  index,
  kind,
  canRemove,
  canReorder,
  onChange,
  onRemove,
}: {
  step: ScheduleStep
  index: number
  kind: 'income' | 'expense'
  canRemove: boolean
  canReorder: boolean
  onChange: (step: ScheduleStep) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
    disabled: !canReorder,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <ScheduleStepRow
        step={step}
        index={index}
        kind={kind}
        canRemove={canRemove}
        isDragging={isDragging}
        dragHandle={
          canReorder ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs cursor-grab touch-none active:cursor-grabbing"
              aria-label={`Drag to reorder period ${index + 1}`}
              {...attributes}
              {...listeners}
            >
              <GripIcon />
            </button>
          ) : null
        }
        onChange={onChange}
        onRemove={onRemove}
      />
    </div>
  )
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="size-4"
      aria-hidden
    >
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  )
}

function GripIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="size-4"
      aria-hidden
    >
      <path d="M7 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7 16a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 16a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  )
}
