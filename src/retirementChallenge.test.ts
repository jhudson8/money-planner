import { describe, expect, it } from 'vitest'
import { createDefaultPlan } from './defaultPlan'
import { buildRetirementChallenge } from './retirementChallenge'
import { simulate } from './simulation'

describe('buildRetirementChallenge', () => {
  it('demands adversarial historical testing and includes reproducible model output', () => {
    const plan = createDefaultPlan()
    const challenge = buildRetirementChallenge(plan, simulate(plan), 'Challenge test')

    expect(challenge).toContain('try to prove that its conclusion is historically wrong')
    expect(challenge).toContain('Replay the exact plan across every complete historical start year')
    expect(challenge).toContain('HISTORICALLY CONTRADICTED')
    expect(challenge).toContain('HISTORICALLY DEFENSIBLE')
    expect(challenge).toContain('PLAN "Challenge test"')
    expect(challenge).toContain('YEAR-BY-YEAR DETAIL')
  })
})
