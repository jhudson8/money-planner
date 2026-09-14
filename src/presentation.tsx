import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'retirement-predictor:presentation'

const PresentationContext = createContext<{
  presentation: boolean
  setPresentation: (value: boolean) => void
}>({ presentation: false, setPresentation: () => {} })

function readStored(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function PresentationProvider({ children }: { children: React.ReactNode }) {
  const [presentation, setPresentation] = useState(readStored)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, presentation ? '1' : '0')
    } catch {
      // ignore
    }
  }, [presentation])

  return (
    <PresentationContext.Provider value={{ presentation, setPresentation }}>
      {children}
    </PresentationContext.Provider>
  )
}

export function usePresentation(): boolean {
  return useContext(PresentationContext).presentation
}

export function useSetPresentation(): (value: boolean) => void {
  return useContext(PresentationContext).setPresentation
}

/** Format a dollar amount. In presentation mode returns a masked placeholder. */
export function maskUsd(amount: number, presentation: boolean, formatter: Intl.NumberFormat): string {
  if (presentation) return '$•••'
  return formatter.format(amount)
}

/** Format a compact dollar amount (e.g. axis tick). In presentation mode returns '•••'. */
export function maskCompactUsd(amount: number, presentation: boolean, formatter: Intl.NumberFormat): string {
  if (presentation) return '•••'
  return formatter.format(amount)
}

/** Format a shorthand dollar amount for tab bar / badges. In presentation mode returns '$•••'. */
export function maskShorthandUsd(amount: number, presentation: boolean, formatter: Intl.NumberFormat): string {
  if (presentation) return '$•••'
  return formatter.format(amount)
}

/** Mask any numeric display value in presentation mode. */
export function maskNumber(value: number | string, presentation: boolean): string {
  if (presentation) return '•••'
  return String(value)
}

/** Return the percent change vs startNetWorth, formatted as e.g. "+42%" */
export function pctVsStart(netWorth: number, startNetWorth: number): string {
  if (startNetWorth <= 0) return '—'
  const pct = ((netWorth - startNetWorth) / startNetWorth) * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}

function formatPct(pct: number, digits: number): string {
  if (!Number.isFinite(pct)) return '—'
  if (Math.abs(pct) < 0.05) return '0%'
  return `${pct.toFixed(digits)}%`
}

/** Absolute amount as a share of today's net worth, e.g. "8.2% of today". */
export function pctOfToday(amount: number, startNetWorth: number, digits = 1): string {
  if (startNetWorth <= 0) return '—'
  return `${formatPct((amount / startNetWorth) * 100, digits)} of today`
}

/** Signed amount as a share of today's net worth, e.g. "+1.4% of today". */
export function signedPctOfToday(amount: number, startNetWorth: number, digits = 1): string {
  if (startNetWorth <= 0) return '—'
  const pct = (amount / startNetWorth) * 100
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return '0% of today'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(digits)}% of today`
}

/** Share of a total, e.g. "37% of this year". */
export function shareOf(amount: number, total: number, label = 'this year'): string {
  if (total <= 0) return '—'
  return `${formatPct((amount / total) * 100, 0)} of ${label}`
}
