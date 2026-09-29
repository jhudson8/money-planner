# Historical return data

## Series available in the simulator

### Documented U.S. equity total return (default for new historical selections)

* **1872–1925:** the immutable legacy values, derived from Robert Shiller's monthly data. Shiller states that the pre-1926 price, dividend, and earnings observations come from Cowles and Associates; dividends and earnings were interpolated from annual data. These years are therefore labeled **reconstructed U.S. stock composite data**, not S&P 500 returns.
* **1926–1927:** the same legacy Shiller-derived approximation is retained as a bridge.
* **1928–2024:** Aswath Damodaran's NYU Stern “S&P 500 (includes dividends)” calendar-year returns, downloaded on 2026-09-29 from <https://pages.stern.nyu.edu/adamodar/New_Home_Page/datafile/histretSP.html>.

The generator is `scripts/generate-market-data.mjs`. It reads a saved copy of Damodaran's HTML table, verifies anchor values (1928 = 43.81%, 2024 = 24.88%), joins it to the pre-1928 bridge, and writes `src/data/documented-us-equity-total-returns.json`.

### Legacy Shiller December approximation (saved-plan compatibility)

`src/data/sp500-annual-returns.json` is kept unchanged so existing plans reproduce their prior projections. Its metadata describes the calculation as:

```
100 × ((DecemberPrice[y] / DecemberPrice[y-1] − 1)
       + DecemberTrailingAnnualDividend[y-1] / DecemberPrice[y-1])
```

The December `SP500` observation in the cited Shiller dataset is a **monthly average of daily closing prices**, not the closing value on the last trading day. `Dividend` is a trailing annual dividend figure observed in December. The formula adds that yield once; it does not model the dates on which dividends were paid or reinvest them. It is therefore an annual approximation and must not be described as the standard S&P 500 calendar-year total return.

The original generator, raw input snapshot, and checksum were not committed with this file. The current upstream CSV has revised historical observations and does not reproduce every checked-in value exactly. The legacy JSON itself is consequently the authoritative compatibility artifact; its exact upstream snapshot remains uncertain.

## Why 1928–1945 differs from Damodaran

Every legacy value from 1928 through 1945 differs from Damodaran by more than 0.5 percentage points. This is systematic rather than a year alignment typo:

1. The legacy price endpoints are December monthly averages.
2. Its dividend component is the prior December trailing annual dividend divided by the prior December monthly-average price.
3. It simply adds price return and dividend yield and does not reinvest distributions.
4. Damodaran publishes the year's price appreciation plus dividends for the S&P 500/backfilled large-stock index.
5. Shiller's historical source data can be revised; the raw snapshot used for the legacy file is unavailable.

The provenance tests pin the series length, segment labels, Damodaran anchor values, and the 1928–1945 comparison threshold. They intentionally do not fetch live data during the test run.
