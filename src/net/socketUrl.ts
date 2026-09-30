/** Platform-neutral fallback. Browser callers pass the build-specific URL explicitly. */
export function defaultSocketUrl(
  locationLike = typeof location === "undefined" ? undefined : location,
): string {
  if (
    !locationLike ||
    ["localhost", "127.0.0.1", "[::1]"].includes(locationLike.hostname)
  )
    return "ws://127.0.0.1:3412";
  return `${locationLike.protocol === "https:" ? "wss:" : "ws:"}//${locationLike.host}/games/grand-century/ws`;
}
