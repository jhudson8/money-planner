import { createId } from './ids'
import type { AccountKind, AmountPeriod, CashFlowSource, Plan, SavingsAccount, ScheduleStep } from './types'

type StepInput = Omit<ScheduleStep, 'id' | 'amountPeriod' | 'once'> & {
  amountPeriod?: AmountPeriod
  once?: boolean
}

function step(partial: StepInput): ScheduleStep {
  return { id: createId(), amountPeriod: 'annual', once: false, ...partial }
}

function source(name: string, steps: StepInput[]): CashFlowSource {
  return { id: createId(), name, steps: steps.map(step) }
}

export function createAccount(
  kind: AccountKind,
  partial: Partial<Omit<SavingsAccount, 'id' | 'kind'>> = {},
): SavingsAccount {
  const defaults: Record<AccountKind, Pick<SavingsAccount, 'name' | 'annualReturnPercent' | 'taxRatePercent' | 'depletionOrder' | 'amount'>> =
    {
      shortTerm: {
        name: 'Short-term wallet',
        amount: 0,
        annualReturnPercent: 2,
        taxRatePercent: 0,
        depletionOrder: 0,
      },
      longTerm: {
        name: 'Long-term',
        amount: 0,
        annualReturnPercent: 6,
        taxRatePercent: 15,
        depletionOrder: 1,
      },
      traditional401k: {
        name: '401(k)',
        amount: 0,
        annualReturnPercent: 6,
        taxRatePercent: 22,
        depletionOrder: 100,
      },
      rothIra: {
        name: 'Roth IRA',
        amount: 0,
        annualReturnPercent: 6,
        taxRatePercent: 0,
        depletionOrder: 103,
      },
      traditionalIra: {
        name: 'Traditional IRA',
        amount: 0,
        annualReturnPercent: 6,
        taxRatePercent: 22,
        depletionOrder: 101,
      },
      sepIra: {
        name: 'SEP IRA',
        amount: 0,
        annualReturnPercent: 6,
        taxRatePercent: 22,
        depletionOrder: 102,
      },
    }
  return { id: createId(), kind, ...defaults[kind], ...partial }
}

export function createEmptyLongTerm(order: number): SavingsAccount {
  return createAccount('longTerm', {
    name: `Long-term ${order}`,
    depletionOrder: order,
  })
}

export function createDefaultPlan(): Plan {
  return {
    version: 16,
    birthDate: null,
    planUntilAge: 90,
    replenishYears: 10,
    keepWalletFull: false,
    replenishWaitMode: 'off',
    replenishGrowthPercent: 5,
    accounts: [
      createAccount('shortTerm'),
      createAccount('longTerm', { name: 'Brokerage', amount: 500_000, depletionOrder: 1 }),
      createAccount('traditional401k'),
      createAccount('rothIra'),
      createAccount('traditionalIra'),
      createAccount('sepIra'),
    ],
    incomeSources: [
      source('Salary', [
        {
          start: { type: 'now' },
          valueType: 'absolute',
          value: 120_000,
          annualGrowthPercent: 3,
        },
        {
          start: { type: 'yearsFromNow', value: 25 },
          valueType: 'absolute',
          value: 0,
          annualGrowthPercent: 0,
        },
      ]),
      source('Social Security', [
        {
          start: { type: 'yearsFromNow', value: 27 },
          valueType: 'absolute',
          value: 30_000,
          annualGrowthPercent: 2,
        },
      ]),
    ],
    expenseSources: [
      source('Living expenses', [
        {
          start: { type: 'now' },
          valueType: 'absolute',
          value: 60_000,
          annualGrowthPercent: 2.5,
        },
      ]),
      source('Health insurance', [
        {
          start: { type: 'now' },
          valueType: 'absolute',
          value: 12_000,
          annualGrowthPercent: 4,
        },
        {
          start: { type: 'yearsFromNow', value: 25 },
          valueType: 'absolute',
          value: 4_000,
          annualGrowthPercent: 2,
        },
      ]),
    ],
  }
}

export function createEmptySource(name: string): CashFlowSource {
  return source(name, [
    {
      start: { type: 'now' },
      valueType: 'absolute',
      value: 0,
      annualGrowthPercent: 0,
    },
  ])
}

export function createEmptyStep(): ScheduleStep {
  return step({
    start: { type: 'yearsFromNow', value: 5 },
    valueType: 'absolute',
    value: 0,
    annualGrowthPercent: 0,
  })
}
