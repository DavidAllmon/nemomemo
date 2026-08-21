/** Current unix time in seconds. Centralized so tests can rely on vi.useFakeTimers(). */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
