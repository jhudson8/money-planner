import sp500Annual from './data/sp500-annual-returns.json'
import documentedAnnual from './data/documented-us-equity-total-returns.json'
import type { HistoricalReturnSeries } from './types'

/**
 * Immutable legacy approximation. It uses December monthly-average price changes plus
 * the prior December trailing annual dividend yield. This is not a standard calendar-year
 * S&P 500 total-return calculation and does not reinvest dividends.
 */
export const SP500_ANNUAL_RETURNS: Readonly<Record<number, number>> = Object.fromEntries(
  Object.entries(sp500Annual.returns).map(([year, pct]) => [Number(year), pct as number]),
)

export const DOCUMENTED_US_EQUITY_RETURNS: Readonly<Record<number, number>> = Object.fromEntries(
  Object.entries(documentedAnnual.returns).map(([year, pct]) => [Number(year), pct as number]),
)

export const LEGACY_RETURN_SERIES: HistoricalReturnSeries = 'legacy-shiller-december'
export const DEFAULT_RETURN_SERIES: HistoricalReturnSeries = 'documented-us-equity-total-return'

export function historicalSeriesLabel(series: HistoricalReturnSeries | undefined): string {
  return series === DEFAULT_RETURN_SERIES
    ? 'Documented U.S. equity total return'
    : 'Legacy Shiller December approximation'
}

export function historicalReturnsForSeries(
  series: HistoricalReturnSeries | undefined,
): Readonly<Record<number, number>> {
  return series === DEFAULT_RETURN_SERIES ? DOCUMENTED_US_EQUITY_RETURNS : SP500_ANNUAL_RETURNS
}

export const SP500_DATA_START = sp500Annual.startYear
export const SP500_DATA_END = sp500Annual.endYear

export type MarketPeriodTone = 'crash' | 'boom' | 'mixed' | 'regular'

export type MarketPeriodDef = {
  id: string
  label: string
  blurb: string
  tone: MarketPeriodTone
  /** Year the story centers on (crash year, boom start, etc.) */
  eventYear: number
  /** Preferred first calendar year of the replay when enough data exists */
  preferredStartYear: number
}

/**
 * Named historical windows. Selecting one sets the start-year slider;
 * the window length always matches the simulation horizon.
 */
export const MARKET_PERIODS: readonly MarketPeriodDef[] = [
  {
    id: 'roaring-twenties-into-crash',
    label: 'Roaring Twenties → Crash',
    blurb: 'Late-1920s boom into 1929 and the Depression.',
    tone: 'crash',
    eventYear: 1929,
    preferredStartYear: 1925,
  },
  {
    id: 'great-depression-crash',
    label: 'Great Depression crash',
    blurb: 'Starts at 1929 — deep drawdowns through the early 1930s.',
    tone: 'crash',
    eventYear: 1929,
    preferredStartYear: 1929,
  },
  {
    id: 'depression-bottom-recovery',
    label: 'Depression bottom → recovery',
    blurb: 'From the 1932 lows through the rebound years.',
    tone: 'boom',
    eventYear: 1933,
    preferredStartYear: 1932,
  },
  {
    id: 'depression-including-relapse',
    label: 'Depression + 1937 relapse',
    blurb: 'Recovery after 1932 with the sharp 1937 setback.',
    tone: 'mixed',
    eventYear: 1937,
    preferredStartYear: 1933,
  },
  {
    id: 'ww2-and-postwar',
    label: 'WWII & postwar boom',
    blurb: 'War years into the strong postwar equity run.',
    tone: 'boom',
    eventYear: 1945,
    preferredStartYear: 1942,
  },
  {
    id: 'fifties-go-go',
    label: '1950s expansion',
    blurb: 'Broad postwar prosperity and high equity returns.',
    tone: 'boom',
    eventYear: 1954,
    preferredStartYear: 1950,
  },
  {
    id: 'sixties-into-stagflation',
    label: '1960s into stagflation',
    blurb: 'Late-60s peak into the difficult early 1970s.',
    tone: 'mixed',
    eventYear: 1973,
    preferredStartYear: 1966,
  },
  {
    id: 'stagflation-crash',
    label: '1973–74 bear market',
    blurb: 'Oil shock, inflation, and a severe equity drawdown.',
    tone: 'crash',
    eventYear: 1974,
    preferredStartYear: 1973,
  },
  {
    id: 'volcker-bull-start',
    label: '1982 bull market start',
    blurb: 'End of the long bear era; start of the great bull.',
    tone: 'boom',
    eventYear: 1982,
    preferredStartYear: 1982,
  },
  {
    id: 'black-monday-surround',
    label: 'Black Monday era',
    blurb: 'Mid-80s boom including 1987’s crash and recovery.',
    tone: 'mixed',
    eventYear: 1987,
    preferredStartYear: 1985,
  },
  {
    id: 'nineties-regular',
    label: 'Early 1990s (regular)',
    blurb: 'A more typical stretch before the late-90s mania.',
    tone: 'regular',
    eventYear: 1993,
    preferredStartYear: 1990,
  },
  {
    id: 'dotcom-boom',
    label: 'Dot-com boom',
    blurb: '1995+ internet mania and outsized gains.',
    tone: 'boom',
    eventYear: 1999,
    preferredStartYear: 1995,
  },
  {
    id: 'dotcom-bust',
    label: 'Dot-com bust',
    blurb: 'Starts at 2000 — multi-year tech wipeout.',
    tone: 'crash',
    eventYear: 2000,
    preferredStartYear: 2000,
  },
  {
    id: 'dotcom-bust-with-runup',
    label: 'Dot-com boom → bust',
    blurb: 'Late boom years then the 2000–02 bust.',
    tone: 'crash',
    eventYear: 2000,
    preferredStartYear: 1997,
  },
  {
    id: 'september-11-surround',
    label: '9/11 surround',
    blurb: 'Late-90s peak through 2001–02 stress (includes 9/11 year).',
    tone: 'crash',
    eventYear: 2001,
    preferredStartYear: 1999,
  },
  {
    id: 'housing-boom',
    label: 'Mid-2000s housing boom',
    blurb: 'Post-dot-com recovery into the housing peak.',
    tone: 'boom',
    eventYear: 2006,
    preferredStartYear: 2003,
  },
  {
    id: 'gfc-crash',
    label: '2008 Global Financial Crisis',
    blurb: 'Starts near the peak into the GFC collapse.',
    tone: 'crash',
    eventYear: 2008,
    preferredStartYear: 2007,
  },
  {
    id: 'gfc-with-runup',
    label: 'Housing boom → GFC',
    blurb: 'Mid-2000s run-up then the 2008 crash.',
    tone: 'crash',
    eventYear: 2008,
    preferredStartYear: 2004,
  },
  {
    id: 'post-gfc-boom',
    label: 'Post-2008 bull market',
    blurb: 'From the 2009 bottom through the long recovery bull.',
    tone: 'boom',
    eventYear: 2009,
    preferredStartYear: 2009,
  },
  {
    id: 'gfc-through-recovery',
    label: 'GFC through recovery',
    blurb: 'Includes 2008 and the powerful rebound years.',
    tone: 'mixed',
    eventYear: 2008,
    preferredStartYear: 2007,
  },
  {
    id: 'twenty-tens-regular',
    label: '2010s expansion (regular)',
    blurb: 'Long, relatively steady bull after the GFC.',
    tone: 'regular',
    eventYear: 2015,
    preferredStartYear: 2010,
  },
  {
    id: 'covid-crash-recovery',
    label: 'COVID crash & rebound',
    blurb: '2020 shock year and the sharp rebound that followed.',
    tone: 'mixed',
    eventYear: 2020,
    preferredStartYear: 2020,
  },
  {
    id: 'covid-with-runup',
    label: 'Late-2010s → COVID',
    blurb: 'Pre-COVID strength into 2020 and after.',
    tone: 'mixed',
    eventYear: 2020,
    preferredStartYear: 2017,
  },
  {
    id: 'inflation-shock-2022',
    label: '2022 inflation bear',
    blurb: 'Post-COVID peak into the 2022 rate-hike selloff.',
    tone: 'crash',
    eventYear: 2022,
    preferredStartYear: 2021,
  },
  {
    id: 'recent-bull-into-now',
    label: 'Recent bull into 2024',
    blurb: 'Latest available stretch ending in 2024.',
    tone: 'boom',
    eventYear: 2024,
    preferredStartYear: 2019,
  },
]

export type ResolvedReturnPath = {
  startYear: number
  /** Last calendar year used by this simulation window. */
  endYear: number
  returns: number[]
  /** Compound average annual return across the simulation window. */
  cagrPercent: number
  /** Simple average of the yearly % returns in the simulation window. */
  averagePercent: number
  worstYearPercent: number
  bestYearPercent: number
  periodId?: string
  label: string
  blurb?: string
  tone?: MarketPeriodTone
  /** Retained for compatibility; full historical windows never wrap. */
  wrapped: boolean
  /** Number of real consecutive calendar years in the path. */
  cycleLength: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function cagr(returnsPct: number[]): number {
  if (returnsPct.length === 0) return 0
  const wealth = returnsPct.reduce((w, r) => w * (1 + r / 100), 1)
  return (Math.pow(wealth, 1 / returnsPct.length) - 1) * 100
}

function average(returnsPct: number[]): number {
  if (returnsPct.length === 0) return 0
  return returnsPct.reduce((sum, r) => sum + r, 0) / returnsPct.length
}

/** Earliest selectable start year in the downloaded series. */
export function minHistoricalStartYear(_simulationYears = 1): number {
  return SP500_DATA_START
}

/** Latest start year with enough consecutive real data for the complete simulation. */
export function maxHistoricalStartYear(simulationYears = 1): number {
  const growthYears = Math.max(1, Math.floor(simulationYears))
  return Math.max(SP500_DATA_START, SP500_DATA_END - growthYears + 1)
}

export function clampHistoricalStartYear(startYear: number, simulationYears = 1): number {
  return clamp(
    Math.round(startYear),
    minHistoricalStartYear(simulationYears),
    maxHistoricalStartYear(simulationYears),
  )
}

/** Preferred preset start when its complete window exists in the downloaded series. */
export function resolveWindowStart(
  preferredStartYear: number,
  _eventYear: number,
  years: number,
  dataStart = SP500_DATA_START,
  dataEnd = SP500_DATA_END,
): number | null {
  const growthYears = Math.max(1, Math.floor(years))
  const latestStart = dataEnd - growthYears + 1
  if (latestStart < dataStart || preferredStartYear < dataStart || preferredStartYear > latestStart) {
    return null
  }
  return Math.round(preferredStartYear)
}

export function getMarketPeriod(id: string | undefined | null): MarketPeriodDef | undefined {
  if (!id) return undefined
  return MARKET_PERIODS.find((period) => period.id === id)
}

/**
 * Build a year-by-year path from `startYear`.
 * Walks forward through real consecutive calendar years. The start is clamped so
 * the complete simulation window ends within the downloaded data.
 */
export function resolveReturnPath(
  startYear: number | undefined | null,
  simulationYears: number,
  periodId?: string | null,
  series: HistoricalReturnSeries = LEGACY_RETURN_SERIES,
): ResolvedReturnPath | null {
  const growthYears = Math.max(1, Math.floor(simulationYears))
  if (startYear == null || !Number.isFinite(startYear)) return null

  const start = clampHistoricalStartYear(startYear, growthYears)
  const end = start + growthYears - 1

  const returns: number[] = []
  for (let year = start; year <= end; year += 1) {
    const value = historicalReturnsForSeries(series)[year]
    if (value == null) return null
    returns.push(value)
  }

  const matchingPeriod =
    (periodId ? getMarketPeriod(periodId) : undefined) ??
    MARKET_PERIODS.find((period) => period.preferredStartYear === start)

  const periodMatches =
    matchingPeriod != null && matchingPeriod.preferredStartYear === start

  return {
    startYear: start,
    endYear: end,
    returns,
    cagrPercent: cagr(returns),
    averagePercent: average(returns),
    worstYearPercent: Math.min(...returns),
    bestYearPercent: Math.max(...returns),
    periodId: periodMatches ? matchingPeriod.id : undefined,
    label: periodMatches ? matchingPeriod.label : `Custom · ${start}–${end}`,
    blurb: periodMatches ? matchingPeriod.blurb : undefined,
    tone: periodMatches ? matchingPeriod.tone : undefined,
    wrapped: false,
    cycleLength: returns.length,
  }
}

export function resolveMarketPeriod(
  periodId: string | undefined | null,
  simulationYears: number,
  series: HistoricalReturnSeries = LEGACY_RETURN_SERIES,
): ResolvedReturnPath | null {
  const def = getMarketPeriod(periodId)
  if (!def) return null
  const start = resolveWindowStart(def.preferredStartYear, def.eventYear, simulationYears)
  if (start == null) return null
  return resolveReturnPath(start, simulationYears, def.id, series)
}

export function listResolvableMarketPeriods(simulationYears: number, series: HistoricalReturnSeries = LEGACY_RETURN_SERIES): ResolvedReturnPath[] {
  return MARKET_PERIODS.map((period) => resolveMarketPeriod(period.id, simulationYears, series)).filter(
    (period): period is ResolvedReturnPath => period != null,
  )
}

/** Keep every account using historical S&P returns on the same replay window. */
export function alignHistoricalAccountStartYears<
  T extends {
    returnMode?: 'flat' | 'historical'
    historicalStartYear?: number
    historicalPeriodId?: string
  },
>(accounts: T[], startYear: number, simulationYears: number): T[] {
  const nextStart = clampHistoricalStartYear(startYear, simulationYears)
  const matching = listResolvableMarketPeriods(simulationYears).find(
    (period) => period.startYear === nextStart,
  )
  return accounts.map((account) =>
    account.returnMode === 'historical'
      ? {
          ...account,
          historicalStartYear: nextStart,
          historicalPeriodId: matching?.periodId,
        }
      : account,
  )
}

export function formatReturnPathSummary(resolved: ResolvedReturnPath, simulationYears?: number): string {
  const years = simulationYears ?? resolved.returns.length
  return `${resolved.label}: ${resolved.startYear}–${resolved.endYear} · avg ${resolved.averagePercent.toFixed(1)}%/yr over ${years}y · CAGR ${resolved.cagrPercent.toFixed(1)}% · range ${resolved.worstYearPercent.toFixed(0)}% to ${resolved.bestYearPercent.toFixed(0)}%`
}

/** Resolve path for an account using start year (preferred) or legacy period id. */
export function resolveAccountReturnPath(
  account: {
    returnMode?: 'flat' | 'historical'
    historicalStartYear?: number
    historicalPeriodId?: string
    historicalReturnSeries?: HistoricalReturnSeries
  },
  simulationYears: number,
): ResolvedReturnPath | null {
  if (account.returnMode !== 'historical') return null
  if (account.historicalStartYear != null) {
    return resolveReturnPath(account.historicalStartYear, simulationYears, account.historicalPeriodId, account.historicalReturnSeries)
  }
  return resolveMarketPeriod(account.historicalPeriodId, simulationYears, account.historicalReturnSeries)
}
