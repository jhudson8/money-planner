import { describe, expect, it } from 'vitest'
import legacy from './data/sp500-annual-returns.json'
import documented from './data/documented-us-equity-total-returns.json'

describe('market data provenance', () => {
  it('contains a continuous documented series and marks the reconstructed segment', () => {
    expect(Object.keys(documented.returns)).toHaveLength(153)
    expect(documented.segments[0]).toMatchObject({ startYear: 1872, endYear: 1925 })
    expect(documented.segments[0].method).toContain('Cowles reconstructed composite')
    for (let year = 1872; year <= 2024; year += 1) expect(documented.returns[String(year) as keyof typeof documented.returns]).toBeTypeOf('number')
  })

  it('records the independently sourced Damodaran values and the early mismatch', () => {
    expect(documented.returns['1928']).toBe(43.81)
    expect(documented.returns['2024']).toBe(24.88)
    for (let year = 1928; year <= 1945; year += 1) {
      expect(Math.abs(documented.returns[String(year) as keyof typeof documented.returns] - legacy.returns[String(year) as keyof typeof legacy.returns])).toBeGreaterThan(0.5)
    }
  })
})
