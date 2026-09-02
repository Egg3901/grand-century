const DEFAULT_ALLOWED_LICENSES = new Set(['CC0', 'CC0-1.0']);

function normalizeLicense(value) {
  return String(value).trim().replace(/^CC0 1\.0$/i, 'CC0-1.0').toUpperCase();
}

/** OHM is CC0 by default, but an element-level license tag takes precedence. */
export function evaluateOhmLicense(tags = {}, allowed = DEFAULT_ALLOWED_LICENSES) {
  const declared = tags.license ? normalizeLicense(tags.license) : null;
  const effective = declared ?? 'CC0';
  return {
    declared,
    effective,
    status: allowed.has(effective) ? 'allowed' : 'review_required',
  };
}

export function requireAllowedOhmLicense(tags, context = 'OHM element') {
  const result = evaluateOhmLicense(tags);
  if (result.status !== 'allowed') {
    throw new Error(`[ohm] ${context} declares ${result.effective}; license review is required`);
  }
  return result;
}
