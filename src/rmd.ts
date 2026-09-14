export const RMD_START_AGE = 73
export const RMD_END_AGE = 100

export function rmdStartAge(_birthDate?: string | null): number {
  return RMD_START_AGE
}

/** Whole years from this age until 100. At 73 that is 27; at 99+ that is 1. */
export function rmdYearsRemaining(age: number): number {
  return Math.max(1, RMD_END_AGE - Math.floor(age))
}

export function requiredMinimumDistribution(balance: number, age: number): number {
  if (balance <= 0 || Math.floor(age) < RMD_START_AGE) return 0
  return balance / rmdYearsRemaining(age)
}
