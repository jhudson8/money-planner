import type { Plan, Projection } from './types'
import { buildVerificationPrompt } from './verificationPrompt'

export function buildRetirementChallenge(
  plan: Plan,
  projection: Projection,
  scenarioName?: string,
): string {
  const verification = buildVerificationPrompt(plan, projection, scenarioName)
  return `ADVERSARIAL RETIREMENT CHALLENGE

I may make an irreversible retirement decision based on this projection. Your job is to try to prove that its conclusion is historically wrong. Do not reassure me, agree with the model, or merely summarize it. Look for evidence that would make a reasonable person reject or materially discount the prediction.

Use web research, independent calculations, and the public source code when available. Treat every number and rule below as an untrusted claim.

REQUIRED CHALLENGES
1. Recalculate the complete projection independently. Find arithmetic, ordering, tax, transfer, RMD, cash-flow, and account-balance errors.
2. Inspect https://github.com/jhudson8/money-planner, especially src/simulation.ts, src/rmd.ts, src/dates.ts, src/marketHistory.ts, and src/data/sp500-annual-returns.json. Identify differences between the stated rules, implementation, and reported output. Cite file paths and lines.
3. Verify every claimed historical S&P annual return against reputable independent sources. Prefer total returns including dividends. Cite sources and explain methodology differences.
4. Do not judge the plan from its selected start year alone. Replay the exact plan across every complete historical start year available for the full retirement horizon. Keep all S&P-linked accounts on the same calendar path. Report survival rate, depletion ages, median ending value, worst ending value, and the worst start years.
5. Test sequence-of-returns risk. Explain whether early crashes, long recoveries, or high inflation cause failure even if long-run average returns look adequate.
6. Challenge every flat return assumption against long-run historical evidence appropriate to that account. State whether the assumed return is nominal or real and whether the plan treats it consistently with expense inflation.
7. Separate two questions: (a) does the software calculate its stated simplified model correctly, and (b) is that simplified model historically and practically adequate for a retirement decision? Do not allow internal consistency to substitute for real-world adequacy.
8. Identify omitted risks that could materially reverse the conclusion, including tax-law simplifications, fees, inflation mismatch, healthcare or long-term-care costs, income reliability, lifespan beyond the horizon, and asset returns that do not match the S&P. Quantify them when evidence permits; do not pad the report with immaterial caveats.
9. Run reasonable adverse variations and identify the smallest change in returns, spending, inflation, taxes, or income that causes depletion. Show the calculation.
10. Search first for reasons the prediction fails. If it survives your strongest historically grounded challenges, say so only after showing the evidence and remaining conditions.

REQUIRED VERDICT
Choose exactly one:
- HISTORICALLY CONTRADICTED: evidence shows the retirement conclusion is likely wrong.
- HISTORICALLY FRAGILE: it succeeds only under favorable sequences or small assumption changes cause failure.
- HISTORICALLY DEFENSIBLE: it survives broad historical sequences and reasonable adverse tests, with stated conditions.
- CANNOT VERIFY: required data, source access, or reproducible details are missing.

Begin with the verdict and a plain-English recommendation about whether this projection is strong enough to support retiring. Then provide:
- the strongest evidence against retirement;
- historical sequence results and worst cases;
- every calculation or source-data discrepancy;
- sensitivity thresholds that cause failure;
- what evidence would change your verdict;
- citations and reproducible calculations.

Do not claim certainty. Do not soften a negative result. If you cannot falsify the prediction, explicitly list the challenges it survived and why.

FULL MODEL CLAIMS AND YEAR-BY-YEAR OUTPUT
${verification}`
}
