import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { buildRetirementChallenge } from '../retirementChallenge'
import type { Plan, Projection } from '../types'

type ChallengeTabProps = {
  plan: Plan
  projection: Projection
  scenarioName: string
}

export function ChallengeTab({ plan, projection, scenarioName }: ChallengeTabProps) {
  const challenge = useMemo(
    () => buildRetirementChallenge(plan, projection, scenarioName),
    [plan, projection, scenarioName],
  )
  const [status, setStatus] = useState<string | null>(null)

  async function copyChallenge() {
    try {
      await navigator.clipboard.writeText(challenge)
      setStatus('Copied the complete adversarial challenge.')
      toast.success('Retirement challenge copied')
    } catch {
      setStatus('Clipboard access failed. Select the text below and copy it manually.')
      toast.error('Could not copy the challenge')
    }
  }

  function downloadChallenge() {
    const blob = new Blob([challenge], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = (scenarioName.trim() || 'retirement-plan')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    link.href = url
    link.download = `${safeName || 'retirement-plan'}-challenge.txt`
    link.click()
    URL.revokeObjectURL(url)
    setStatus('Downloaded the complete adversarial challenge.')
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="card border border-error/40 bg-error/5 shadow-sm">
        <div className="card-body gap-4 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold">External AI Sanity Check</h2>
            <span className="badge badge-error">Try to prove it wrong</span>
          </div>
          <p className="max-w-4xl text-lg font-medium leading-relaxed">
            I challenge another AI to show that this prediction is historically wrong. If it can,
            I would rather know now than believe a retirement plan that does not deserve my trust.
          </p>
          <p className="max-w-4xl text-sm leading-relaxed text-base-content/70">
            This prompt asks for an adversarial review rather than reassurance. It demands independent
            source checks, code inspection, complete historical start-year testing, sequence risk,
            adverse assumptions, failure thresholds, and a forced verdict.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ChallengePoint number="1" title="Disprove the math">Recalculate every year, balance, sale, tax, transfer, and RMD.</ChallengePoint>
            <ChallengePoint number="2" title="Disprove the data">Verify claimed market returns using independent historical sources.</ChallengePoint>
            <ChallengePoint number="3" title="Disprove the outcome">Replay every complete historical sequence and expose the worst cases.</ChallengePoint>
            <ChallengePoint number="4" title="Force a verdict">Label the plan contradicted, fragile, defensible, or unverifiable.</ChallengePoint>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-error btn-sm" onClick={() => void copyChallenge()}>
              Copy challenge for another AI
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={downloadChallenge}>
              Download .txt
            </button>
            <span className="badge badge-ghost badge-sm tabular-nums">
              {challenge.split('\n').length.toLocaleString()} lines · {challenge.length.toLocaleString()} characters
            </span>
          </div>
          {status ? <p className="text-sm text-base-content/70" role="status">{status}</p> : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">Complete challenge</h3>
          <span className="text-xs text-base-content/55">Generated from the active scenario</span>
        </div>
        <textarea
          className="textarea textarea-bordered min-h-[44rem] w-full resize-y font-mono text-xs leading-relaxed"
          value={challenge}
          readOnly
          spellCheck={false}
          aria-label="Adversarial retirement challenge for another AI"
        />
      </section>
    </div>
  )
}

function ChallengePoint({ number, title, children }: { number: string; title: string; children: string }) {
  return (
    <div className="rounded-box border border-error/25 bg-base-100 p-3">
      <div className="flex items-center gap-2">
        <span className="badge badge-error badge-sm">{number}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-base-content/65">{children}</p>
    </div>
  )
}
