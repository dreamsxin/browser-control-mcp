export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  PORT_CONFLICT: 2,
  SIGNAL_KILL: 3,
} as const

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]
