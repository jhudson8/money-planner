/** Last account whose historical S&P start-year slider was focused or selected. */
let lastAccountId: string | null = null

export function setLastSpSliderAccountId(id: string | null): void {
  lastAccountId = id
}

export function getLastSpSliderAccountId(): string | null {
  return lastAccountId
}
