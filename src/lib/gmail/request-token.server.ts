export function gmailAccessTokenFromHeaders(headers: Headers): string | null {
  const authorization = headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const token = match?.[1]?.trim();
  return token || null;
}

export function gmailAccessTokenFromRequest(request: Request): string | null {
  return gmailAccessTokenFromHeaders(request.headers);
}
