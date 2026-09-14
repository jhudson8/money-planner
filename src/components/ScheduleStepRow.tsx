import type { ReactNode } from 'react'
import { addYearsIso, todayIsoDate } from '../dates'
import { usd } from '../format'
import { maskUsd, usePresentation } from '../presentation'
import { NumberField } from './NumberField'
import type { AmountPeriod, ScheduleStep, Timing, ValueType } from '../types'

type ScheduleStepRowProps = {
  step: ScheduleStep
  index: number
  kind?: 'income' | 'expense'
  canRemove: boolean
  dragHandle?: ReactNode
  isDragging?: boolean
  onChange: (step: ScheduleStep) => void
  onRemove: () => void
}

export function ScheduleStepRow({
  step,
  index,
  kind = 'income',
  canRemove,
  dragHandle,
  isDragging = false,
  onChange,
  onRemove,
}: ScheduleStepRowProps) {
  const presentation = usePresentation()
  const startType = step.start.type
  const amountPeriod = step.amountPeriod === 'monthly' ? 'monthly' : 'annual'

  function setStartType(type: Timing['type']) {
    if (type === 'now') {
      onChange({ ...step, start: { type: 'now' } })
      return
    }
    if (type === 'yearsFromNow') {
      const years = step.start.type === 'yearsFromNow' ? step.start.value : 5
      onChange({ ...step, start: { type: 'yearsFromNow', value: years } })
      return
    }
    const date =
      step.start.type === 'date'
        ? step.start.date
        : step.start.type === 'yearsFromNow'
          ? addYearsIso(todayIsoDate(), step.start.value)
          : addYearsIso(todayIsoDate(), 5)
    onChange({ ...step, start: { type: 'date', date } })
  }

  function setAmountPeriod(next: AmountPeriod) {
    if (step.valueType !== 'absolute' || next === amountPeriod) {
      onChange({ ...step, amountPeriod: next })
      return
    }
    const converted = next === 'monthly' ? step.value / 12 : step.value * 12
    onChange({ ...step, amountPeriod: next, value: converted })
  }

  function setOnce(once: boolean) {
    if (once === step.once) return
    if (once) {
      const lump =
        step.valueType === 'absolute' && step.amountPeriod === 'monthly' ? step.value * 12 : step.value
      onChange({
        ...step,
        once: true,
        value: lump,
        amountPeriod: 'annual',
        annualGrowthPercent: 0,
      })
      return
    }
    onChange({ ...step, once: false })
  }

  return (
    <div
      className={`rounded-box border border-base-300 bg-base-200/60 p-3 ${
        isDragging ? 'border-primary opacity-60 shadow-md' : ''
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {dragHandle}
          <span className="badge badge-sm badge-outline">Period {index + 1}</span>
          {step.once ? (
            <span className="badge badge-sm badge-ghost">
              One-time {kind === 'income' ? 'payment' : 'cost'}
            </span>
          ) : null}
        </div>
        {canRemove ? (
          <button type="button" className="btn btn-ghost btn-xs text-error" onClick={onRemove}>
            Remove period
          </button>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <fieldset className="fieldset min-w-0">
          <legend className="fieldset-legend">Starts</legend>
          <select
            className="select w-full"
            value={startType}
            onChange={(event) => setStartType(event.target.value as Timing['type'])}
          >
            <option value="now">Right now</option>
            <option value="yearsFromNow">In years</option>
            <option value="date">On a date</option>
          </select>
        </fieldset>

        {step.start.type === 'yearsFromNow' ? (
          <NumberField
            label="Years from now"
            masked={presentation}
            value={step.start.value}
            min={0}
            max={80}
            onChange={(value) => onChange({ ...step, start: { type: 'yearsFromNow', value } })}
          />
        ) : null}

        {step.start.type === 'date' ? (
          <fieldset className="fieldset min-w-0">
            <legend className="fieldset-legend">Start date</legend>
            <input
              type="date"
              className="input w-full min-w-0 max-w-full"
              value={step.start.date}
              onChange={(event) =>
                onChange({
                  ...step,
                  start: { type: 'date', date: event.target.value || todayIsoDate() },
                })
              }
            />
          </fieldset>
        ) : null}

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Schedule</legend>
          <select
            className="select w-full"
            value={step.once ? 'once' : 'ongoing'}
            onChange={(event) => setOnce(event.target.value === 'once')}
          >
            <option value="ongoing">Ongoing</option>
            <option value="once">One-time</option>
          </select>
        </fieldset>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Amount type</legend>
          <select
            className="select w-full"
            value={step.valueType}
            onChange={(event) =>
              onChange({ ...step, valueType: event.target.value as ValueType })
            }
          >
            <option value="absolute">Dollar amount</option>
            <option value="relative">% of original</option>
          </select>
        </fieldset>

        {step.valueType === 'absolute' ? (
          <>
            {step.once ? null : (
              <fieldset className="fieldset">
                <legend className="fieldset-legend">Paid</legend>
                <select
                  className="select w-full"
                  value={amountPeriod}
                  onChange={(event) => setAmountPeriod(event.target.value as AmountPeriod)}
                >
                  <option value="annual">Annually</option>
                  <option value="monthly">Monthly</option>
                </select>
              </fieldset>
            )}
            <NumberField
              label={
                step.once
                  ? 'One-time amount'
                  : amountPeriod === 'monthly'
                    ? 'Monthly amount'
                    : 'Annual amount'
              }
              prefix="$"
              masked={presentation}
              value={step.value}
              min={0}
              step={step.once || amountPeriod !== 'monthly' ? 1000 : 100}
              hint={
                step.once
                  ? 'Counted only in the start year. Does not replace ongoing income or expenses.'
                  : amountPeriod === 'monthly'
                    ? `${maskUsd(step.value * 12, presentation, usd)} per year in the projection`
                    : `${maskUsd(step.value / 12, presentation, usd)} per month`
              }
              onChange={(value) => onChange({ ...step, value })}
            />
          </>
        ) : (
          <NumberField
            label="Percent of original"
            suffix="%"
            masked={presentation}
            value={step.value}
            min={0}
            step={10}
            hint={
              step.once
                ? 'One-time percent of the original annual amount, paid in the start year only'
                : '200 means twice the original annual amount'
            }
            onChange={(value) => onChange({ ...step, value })}
          />
        )}

        {step.once ? null : (
          <NumberField
            label="Annual change"
            suffix="% / year"
            masked={presentation}
            value={step.annualGrowthPercent}
            step={0.1}
            hint="Use 5 for inflation, or 0 for a flat amount"
            onChange={(annualGrowthPercent) => onChange({ ...step, annualGrowthPercent })}
          />
        )}
      </div>
    </div>
  )
}
