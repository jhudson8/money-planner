import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type NumberFieldProps = {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  prefix?: string
  suffix?: string
  hint?: string
  /** When true, hide the value behind a fixed mask (presentation mode). */
  masked?: boolean
}

const MASK_DISPLAY = '••••••'

function toDraft(value: number, grouped: boolean): string {
  if (!Number.isFinite(value)) return ''
  return grouped ? maskGrouped(String(value)) : String(value)
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim()
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null
  const next = Number(cleaned)
  return Number.isFinite(next) ? next : null
}

function maskGrouped(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  const negative = trimmed.startsWith('-')
  const body = negative ? trimmed.slice(1) : trimmed
  const cleaned = body.replace(/[^\d.]/g, '')
  if (cleaned === '' || cleaned === '.') return `${negative ? '-' : ''}${cleaned}`

  const dot = cleaned.indexOf('.')
  const hasDot = dot !== -1
  const intRaw = hasDot ? cleaned.slice(0, dot) : cleaned
  const fracRaw = hasDot ? cleaned.slice(dot + 1).replace(/\./g, '') : ''
  const intGrouped = intRaw === '' ? '0' : Number(intRaw).toLocaleString('en-US')
  const sign = negative ? '-' : ''
  return hasDot ? `${sign}${intGrouped}.${fracRaw}` : `${sign}${intGrouped}`
}

function digitCountBefore(value: string, caret: number): number {
  return (value.slice(0, caret).match(/\d/g) ?? []).length
}

function caretFromDigitCount(value: string, digits: number): number {
  if (digits <= 0) return value.startsWith('-') ? 1 : 0
  let seen = 0
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index] ?? '')) {
      seen += 1
      if (seen >= digits) return index + 1
    }
  }
  return value.length
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  hint,
  masked = false,
}: NumberFieldProps) {
  const grouped = prefix === '$'
  const focused = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)
  const [draft, setDraft] = useState(() => toDraft(value, grouped))

  useEffect(() => {
    if (!focused.current) {
      setDraft(toDraft(value, grouped))
    }
  }, [value, grouped])

  useLayoutEffect(() => {
    const input = inputRef.current
    const caret = caretRef.current
    if (input == null || caret == null) return
    input.setSelectionRange(caret, caret)
    caretRef.current = null
  }, [draft])

  function commitDraft(raw: string) {
    const next = parseNumber(raw)
    if (next === null) return
    onChange(next)
  }

  return (
    <fieldset className="fieldset min-w-0">
      <legend className="fieldset-legend">{label}</legend>
      <label className="input w-full min-w-0">
        {prefix ? <span className="label">{prefix}</span> : null}
        {masked ? (
          <input
            type="text"
            autoComplete="off"
            className="grow tracking-widest text-base-content/50"
            value={MASK_DISPLAY}
            readOnly
            aria-label={`${label} (hidden in presentation mode)`}
          />
        ) : (
          <input
            ref={inputRef}
            type={grouped ? 'text' : 'number'}
            inputMode={grouped ? 'decimal' : undefined}
            autoComplete="off"
            className="grow"
            min={grouped ? undefined : min}
            max={grouped ? undefined : max}
            step={grouped ? undefined : step}
            value={draft}
            onFocus={() => {
              focused.current = true
            }}
            onBlur={() => {
              focused.current = false
              const next = parseNumber(draft)
              if (next === null) {
                setDraft(toDraft(value, grouped))
                return
              }
              setDraft(toDraft(next, grouped))
            }}
            onChange={(event) => {
              const raw = event.target.value
              if (!grouped) {
                setDraft(raw)
                commitDraft(raw)
                return
              }
              const maskedVal = maskGrouped(raw)
              caretRef.current = caretFromDigitCount(
                maskedVal,
                digitCountBefore(raw, event.target.selectionStart ?? raw.length),
              )
              setDraft(maskedVal)
              commitDraft(maskedVal)
            }}
          />
        )}
        {suffix ? <span className="label">{suffix}</span> : null}
      </label>
      {hint && !masked ? <p className="label whitespace-normal">{hint}</p> : null}
    </fieldset>
  )
}
