export const SLEEP_MINUTES = [5, 15, 30, 45, 60, 90, 120] as const;
export type SleepMinutes = typeof SLEEP_MINUTES[number];
export const sleepDeadline = (minutes: SleepMinutes, now: number) => now + minutes * 60_000;
export const sleepSecondsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
