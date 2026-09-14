export const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const shorthandUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatShorthandUsd(amount: number): string {
  return shorthandUsd.format(amount)
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`
}

export function signedUsd(value: number): string {
  const formatted = usd.format(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

/** Annual amount with an equivalent per-month figure, e.g. "$120,000/yr · $10,000/mo". */
export function usdYearAndMonth(annual: number): string {
  if (Math.abs(annual) < 0.005) return `${usd.format(0)}/yr · ${usd.format(0)}/mo`
  return `${usd.format(annual)}/yr · ${usd.format(annual / 12)}/mo`
}

/** Balance or one-off amount with a per-month equivalent, e.g. "$120,000 · $10,000/mo". */
export function usdWithMonthly(amount: number): string {
  if (Math.abs(amount) < 0.005) return usd.format(0)
  return `${usd.format(amount)} · ${usd.format(amount / 12)}/mo`
}

/** Signed amount with a per-month equivalent, e.g. "+$10,000 · $833/mo". */
export function signedUsdWithMonthly(value: number): string {
  if (Math.abs(value) < 0.005) return usd.format(0)
  return `${signedUsd(value)} · ${usd.format(Math.abs(value) / 12)}/mo`
}

export function yearsPhrase(years: number): string {
  const n = Math.max(1, Math.floor(years))
  return n === 1 ? '1 year' : `${n} years`
}
