// Shared session policy. Safe to import from both the Node.js runtime and the
// edge middleware bundle.

export const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60 // 90 days
export const SESSION_IDLE_TIMEOUT_MS = 90 * 24 * 60 * 60 * 1000 // 90 days
