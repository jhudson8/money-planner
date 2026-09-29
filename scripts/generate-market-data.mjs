/**
 * Regenerate the documented market series from a saved copy of Damodaran's HTML table.
 * Usage: node scripts/generate-market-data.mjs /path/to/histretSP.html
 *
 * The pre-1928 bridge intentionally comes from the immutable legacy JSON. The legacy file's
 * original raw Shiller snapshot and generator were never committed, so it cannot be recreated
 * exactly from the currently revised upstream CSV.
 */
import fs from 'node:fs'
import path from 'node:path'

const htmlPath = process.argv[2]
if (!htmlPath) throw new Error('Pass the downloaded Damodaran histretSP.html path')
const root = path.resolve(import.meta.dirname, '..')
const legacy = JSON.parse(fs.readFileSync(path.join(root, 'src/data/sp500-annual-returns.json'), 'utf8'))
const html = fs.readFileSync(htmlPath, 'utf8')
const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
  [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
    cell[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim(),
  ),
)
const damodaran = Object.fromEntries(rows.filter((row) => /^\d{4}$/.test(row[0] ?? '') && /%$/.test(row[1] ?? ''))
  .map((row) => [Number(row[0]), Number(row[1].replace('%', ''))]))
if (damodaran[1928] !== 43.81 || damodaran[2024] !== 24.88) throw new Error('Unexpected source table')
const returns = Object.fromEntries(Array.from({ length: 2024 - 1872 + 1 }, (_, i) => {
  const year = 1872 + i
  return [year, year < 1928 ? legacy.returns[year] : damodaran[year]]
}))
const output = {
  id: 'documented-us-equity-total-return', label: 'Documented U.S. equity total return', startYear: 1872, endYear: 2024,
  segments: [
    { startYear: 1872, endYear: 1925, source: 'Robert Shiller monthly U.S. stock composite data via datasets/s-and-p-500', method: 'Legacy reconstructed annual approximation: December monthly-average price change plus prior December trailing annual dividend divided by prior December price. Pre-1926 source data are Cowles reconstructed composite observations, interpolated from annual data.' },
    { startYear: 1926, endYear: 1927, source: 'Robert Shiller monthly S&P composite data via datasets/s-and-p-500', method: 'Legacy reconstructed annual approximation retained to bridge the series before Damodaran begins.' },
    { startYear: 1928, endYear: 2024, source: 'NYU Stern, Aswath Damodaran, Historical Returns on Stocks, Bonds and Bills, downloaded 2026-09-29', method: 'Calendar-year S&P 500 return including dividends, as published.' },
  ],
  sourceUrls: ['https://pages.stern.nyu.edu/adamodar/New_Home_Page/datafile/histretSP.html', 'https://github.com/datasets/s-and-p-500'], returns,
}
fs.writeFileSync(path.join(root, 'src/data/documented-us-equity-total-returns.json'), `${JSON.stringify(output, null, 2)}\n`)
