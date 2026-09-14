# Retirement Predictor

A local retirement planner. Enter savings, time-varying income and expenses, and a withdrawal rate, then view projected net worth.

https://jhudson8.github.io/money-planner/

## Run

```bash
npm install
npm run dev
```

Plans and named scenarios save automatically in the browser. The JSON tab can export or import a copy of the active scenario. foo

## Tests

Run the unit tests once with `npm test`, or use `npm run test:watch` during development.
Tests use Vitest and live alongside the source in `src/*.test.ts`.
Date tests use a fixed clock so results do not depend on when they run.
