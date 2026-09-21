import sp500Annual from './data/sp500-annual-returns.json'

/**
 * S&P 500 calendar-year total returns (%), from downloaded Shiller monthly series
 * (Dec–Dec price change + dividend yield on prior Dec). Complete years only.
 */
export const SP500_ANNUAL_RETURNS: Readonly<Record<number, number>> = Object.fromEntries(
  Object.entries(sp500Annual.returns).map(([year, pct]) => [Number(year), pct as number]),
)

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
  /** Last calendar year used before wrapping (end of the source cycle). */
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
  /** True when the path repeats from startYear because the plan outran available data. */
  wrapped: boolean
  /** Length of the unique year cycle before repeating. */
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

/** Latest selectable start year (can be the last data year; path wraps if needed). */
export function maxHistoricalStartYear(_simulationYears = 1): number {
  return SP500_DATA_END
}

export function clampHistoricalStartYear(startYear: number, _simulationYears = 1): number {
  return clamp(Math.round(startYear), SP500_DATA_START, SP500_DATA_END)
}

/** Preferred preset start, clamped into the downloaded series (no sliding). */
export function resolveWindowStart(
  preferredStartYear: number,
  _eventYear: number,
  _years: number,
  dataStart = SP500_DATA_START,
  dataEnd = SP500_DATA_END,
): number | null {
  if (dataEnd < dataStart) return null
  return clamp(preferredStartYear, dataStart, dataEnd)
}

export function getMarketPeriod(id: string | undefined | null): MarketPeriodDef | undefined {
  if (!id) return undefined
  return MARKET_PERIODS.find((period) => period.id === id)
}

/**
 * Build a year-by-year path from `startYear`.
 * Walks forward through the downloaded series; when data runs out, wraps back to
 * the selection start year and continues for the full simulation length.
 */
export function resolveReturnPath(
  startYear: number | undefined | null,
  simulationYears: number,
  periodId?: string | null,
): ResolvedReturnPath | null {
  const growthYears = Math.max(1, Math.floor(simulationYears))
  if (startYear == null || !Number.isFinite(startYear)) return null

  const start = clampHistoricalStartYear(startYear)
  const cycleEnd = SP500_DATA_END
  if (start > cycleEnd) return null

  const cycle: number[] = []
  for (let year = start; year <= cycleEnd; year += 1) {
    const value = SP500_ANNUAL_RETURNS[year]
    if (value == null) return null
    cycle.push(value)
  }
  if (cycle.length === 0) return null

  const returns: number[] = []
  for (let i = 0; i < growthYears; i += 1) {
    returns.push(cycle[i % cycle.length]!)
  }
  const wrapped = growthYears > cycle.length

  const matchingPeriod =
    (periodId ? getMarketPeriod(periodId) : undefined) ??
    MARKET_PERIODS.find((period) => clampHistoricalStartYear(period.preferredStartYear) === start)

  const periodMatches =
    matchingPeriod != null && clampHistoricalStartYear(matchingPeriod.preferredStartYear) === start

  const rangeLabel = wrapped
    ? `${start}–${cycleEnd}, then repeats`
    : `${start}–${start + growthYears - 1}`

  return {
    startYear: start,
    endYear: cycleEnd,
    returns,
    cagrPercent: cagr(returns),
    averagePercent: average(returns),
    worstYearPercent: Math.min(...returns),
    bestYearPercent: Math.max(...returns),
    periodId: periodMatches ? matchingPeriod.id : undefined,
    label: periodMatches ? matchingPeriod.label : `Custom · ${rangeLabel}`,
    blurb: periodMatches ? matchingPeriod.blurb : undefined,
    tone: periodMatches ? matchingPeriod.tone : undefined,
    wrapped,
    cycleLength: cycle.length,
  }
}

export function resolveMarketPeriod(
  periodId: string | undefined | null,
  simulationYears: number,
): ResolvedReturnPath | null {
  const def = getMarketPeriod(periodId)
  if (!def) return null
  const start = resolveWindowStart(def.preferredStartYear, def.eventYear, simulationYears)
  if (start == null) return null
  return resolveReturnPath(start, simulationYears, def.id)
}

export function listResolvableMarketPeriods(simulationYears: number): ResolvedReturnPath[] {
  return MARKET_PERIODS.map((period) => resolveMarketPeriod(period.id, simulationYears)).filter(
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
  const wrap = resolved.wrapped
    ? ` · wraps every ${resolved.cycleLength}y from ${resolved.startYear}`
    : ''
  return `${resolved.label}: ${resolved.startYear}–${resolved.endYear}${wrap} · avg ${resolved.averagePercent.toFixed(1)}%/yr over ${years}y · CAGR ${resolved.cagrPercent.toFixed(1)}% · range ${resolved.worstYearPercent.toFixed(0)}% to ${resolved.bestYearPercent.toFixed(0)}%`
}

/** Resolve path for an account using start year (preferred) or legacy period id. */
export function resolveAccountReturnPath(
  account: {
    returnMode?: 'flat' | 'historical'
    historicalStartYear?: number
    historicalPeriodId?: string
  },
  simulationYears: number,
): ResolvedReturnPath | null {
  if (account.returnMode !== 'historical') return null
  if (account.historicalStartYear != null) {
    return resolveReturnPath(account.historicalStartYear, simulationYears, account.historicalPeriodId)
  }
  return resolveMarketPeriod(account.historicalPeriodId, simulationYears)
}
