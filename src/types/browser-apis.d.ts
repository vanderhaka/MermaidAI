export {}

declare global {
  interface Window {
    [key: string]: unknown
  }

  interface PerformanceResourceTiming {
    renderBlockingStatus?: '' | 'blocking' | 'non-blocking'
  }
}
