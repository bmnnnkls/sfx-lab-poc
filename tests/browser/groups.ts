/**
 * The smoke groups: one folder under `tests/browser/` each, and one Playwright project each (`smoke-<group>`).
 * Audio specs live in `audio/`, shared helpers in `support/`. `tests/architecture.test.ts` checks that every spec sits in
 * one of these folders, so a spec added anywhere else can't silently stop running.
 */
export const SMOKE_GROUPS = ['pulse', 'workbench', 'timeline', 'samples', 'library'] as const

export type SmokeGroup = (typeof SMOKE_GROUPS)[number]
