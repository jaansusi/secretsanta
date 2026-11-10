/**
 * Rate limits (per client IP, see TRUST_PROXY in main.ts). Decryption codes carry 160 bits of
 * entropy so guessing is hopeless anyway; the limit is defense in depth and keeps the endpoints
 * that hit the database by code cheap to abuse.
 */
export const DEFAULT_THROTTLE = { name: 'default', ttl: 60_000, limit: 300 };

/** Endpoints that look a user up by decryption code. */
export const CODE_CHECK_THROTTLE = { default: { ttl: 60_000, limit: 30 } };
