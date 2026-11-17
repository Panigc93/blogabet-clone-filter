// Server-only rollout gate. This grants no write/import capability.
export const OLBG_PILOT_IDS = ['565069', '342919', '535122'] as const
export interface OlbgActivationEnv { OLBG_LOCAL_REVIEW?: string; USE_PGLITE?: string; OLBG_PILOT_THREE?: string }
export function olbgActivation(env: OlbgActivationEnv = { OLBG_LOCAL_REVIEW: process.env.OLBG_LOCAL_REVIEW, USE_PGLITE: process.env.USE_PGLITE, OLBG_PILOT_THREE: process.env.OLBG_PILOT_THREE }): 'disabled' | 'local' | 'pilot-three' {
  if (env.USE_PGLITE === '1') return env.OLBG_LOCAL_REVIEW === '1' ? 'local' : 'disabled'
  return env.OLBG_PILOT_THREE === '1' ? 'pilot-three' : 'disabled'
}
