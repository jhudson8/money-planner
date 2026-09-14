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
import { createEmptyStep } from '../defaultPlan'
import { sourceAmountInYear } from '../simulation'
import { usd } from '../format'
import { maskUsd, usePresentation } from '../presentation'
import { ScheduleStepRow } from './ScheduleStepRow'
import type { CashFlowSource, ScheduleStep } from '../types'

type SourceCardProps = {
  source: CashFlowSource
  kind: 'income' | 'expense'
  onChange: (source: CashFlowSource) => void
  onRemove: () => void
}

export function SourceCard({ source, kind, onChange, onRemove }: SourceCardProps) {
  const presentation = usePresentation()
  const thisYear = sourceAmountInYear(source, 0)
  const activeThisYear = sourceAmountInYear({ ...source, disabled: false }, 0)
  const accent = kind === 'income' ? 'badge-success' : 'badge-error'
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
    <article className={`card bg-base-100 shadow-sm transition-opacity ${source.disabled ? 'opacity-60 hover:opacity-90' : ''}`}>
      <div className="card-body gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              className="input input-lg min-w-0 w-full font-semibold"
              value={source.name}
              onChange={(event) => onChange({ ...source, name: event.target.value })}
              aria-label="Source name"
            />
            <div className="flex flex-wrap items-center gap-2">
              {source.disabled ? (
                <>
                  <span className="badge badge-ghost text-base-content/60">Disabled</span>
                  <span className="text-xs text-base-content/50">
                    ({maskUsd(activeThisYear, presentation, usd)} this year when enabled)
                  </span>
                </>
              ) : (
                <span className={`badge ${accent}`}>{maskUsd(thisYear, presentation, usd)} this year</span>
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
                className={`toggle toggle-sm ${kind === 'income' ? 'toggle-success' : 'toggle-error'}`}
                checked={!source.disabled}
                onChange={(event) => onChange({ ...source, disabled: !event.target.checked })}
                aria-label={`Enable or disable ${source.name.trim() || (kind === 'income' ? 'income' : 'expense')}`}
              />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>

        <p className="text-sm text-base-content/70">
          Each period replaces the previous ongoing amount from that start onward. A one-time
          period is paid only in its start year and does not replace salary or other ongoing
          amounts. Drag the handle to reorder periods.
        </p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderSteps}>
          <SortableContext
            items={source.steps.map((step) => step.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {source.steps.map((step, index) => (
                <SortablePeriod
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

        <div className="card-actions justify-end">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onChange({ ...source, steps: [...source.steps, createEmptyStep()] })}
          >
            Add time period
          </button>
        </div>
      </div>
    </article>
  )
}

function SortablePeriod({
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

function GripIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
      <path d="M7 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7 16a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM16 16a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  )
}
