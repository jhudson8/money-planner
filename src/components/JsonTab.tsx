import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { createDefaultPlan } from '../defaultPlan'
import { parsePlanJson } from '../storage'
import type { Plan } from '../types'

type JsonTabProps = {
  plan: Plan
  onChange: (plan: Plan) => void
}

export function JsonTab({ plan, onChange }: JsonTabProps) {
  const planText = useMemo(() => stringify(plan), [plan])
  const [text, setText] = useState(planText)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) setText(planText)
  }, [planText, dirty])

  function applyFromText(next: string) {
    try {
      const loaded = parsePlanJson(next)
      const normalized = stringify(loaded)
      setText(normalized)
      setDirty(false)
      onChange(loaded)
      setError(null)
      setMessage('Applied JSON — plan, accounts, income, and expenses are updated.')
      toast.success('Plan updated from JSON')
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Could not apply JSON.'
      setMessage(null)
      setError(detail)
      toast.error(detail)
    }
  }

  function discardEdits() {
    setText(planText)
    setDirty(false)
    setError(null)
    setMessage('Discarded unapplied edits.')
  }

  async function copyJson() {
    await navigator.clipboard.writeText(text)
    setError(null)
    setMessage('Copied to clipboard.')
  }

  async function pasteAndApply() {
    try {
      const next = await navigator.clipboard.readText()
      if (!next.trim()) {
        setMessage(null)
        setError('Clipboard is empty.')
        toast.error('Clipboard is empty.')
        return
      }
      setText(next)
      setDirty(true)
      applyFromText(next)
    } catch {
      setMessage(null)
      setError('Could not read the clipboard. Paste into the editor, then click Apply JSON.')
      toast.error('Could not read the clipboard')
    }
  }

  function downloadJson() {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'retirement-plan.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const next = typeof reader.result === 'string' ? reader.result : ''
      setText(next)
      setDirty(true)
      applyFromText(next)
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      applyFromText(text)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => applyFromText(text)}
        >
          Apply JSON
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void pasteAndApply()}>
          Paste &amp; apply
        </button>
        {dirty ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={discardEdits}>
            Discard edits
          </button>
        ) : null}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void copyJson()}>
          Copy
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={downloadJson}>
          Download
        </button>
        <label className="btn btn-outline btn-sm">
          Upload
          <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const next = createDefaultPlan()
            setText(stringify(next))
            setDirty(false)
            onChange(next)
            setError(null)
            setMessage('Restored the example plan.')
            toast.success('Restored example plan')
          }}
        >
          Reset example
        </button>
        {dirty ? (
          <span className="badge badge-warning badge-sm">Unapplied edits</span>
        ) : (
          <span className="badge badge-ghost badge-sm">In sync</span>
        )}
      </div>

      {error ? (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success">
          <span>{message}</span>
        </div>
      ) : null}

      <p className="text-sm text-base-content/70">
        Paste or edit a plan JSON payload, then click <strong>Apply JSON</strong> (or ⌘/Ctrl+Enter).
        That replaces the active scenario&apos;s full plan — accounts, transfers, income, expenses,
        and settings. Scenario library exports and <code className="text-xs">{'{ plan: … }'}</code>{' '}
        wrappers are accepted. Other named scenarios are left alone.
      </p>

      <textarea
        className="textarea font-mono text-sm min-h-[32rem] w-full"
        value={text}
        spellCheck={false}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          setText(event.target.value)
          setDirty(true)
          setMessage(null)
          setError(null)
        }}
      />
    </div>
  )
}

function stringify(plan: Plan): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}
