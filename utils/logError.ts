// utils/logError.ts
// Report a handled error instead of swallowing it silently.
// Logs in development; hook a crash reporter (Sentry/Crashlytics) in here later.
export function logError(where: string, err: unknown): void {
  if (__DEV__) console.warn(`[${where}]`, err);
}
