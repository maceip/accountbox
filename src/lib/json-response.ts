/** JSON Response helper for API route handlers. */
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Log the real error server-side and return a generic message to the client,
 *  so internal/upstream error text (Gmail/GitHub strings) never leaks to the
 *  browser. `extra` is merged into the response body (e.g. `{ linked: true }`). */
export function jsonError(
  context: string,
  error: unknown,
  status = 502,
  extra?: Record<string, unknown>,
) {
  console.error(`[api] ${context}`, error);
  return json({ ...extra, error: "Request failed" }, status);
}
