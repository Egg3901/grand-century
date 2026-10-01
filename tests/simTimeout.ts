/**
 * World v8 (2,091 provinces, 155 nations) costs about three times as much per
 * simulated day as the 387-province world these timeouts were tuned against.
 * Long-running simulation tests scale their limits through this helper so the
 * factor lives in one place.
 */
export const SIM_TIMEOUT_SCALE = 3;
export const simTimeout = (ms: number): number => ms * SIM_TIMEOUT_SCALE;
