/** Baut Weiterleitungen aus dem Host, den der Browser wirklich benutzt. */
export function publicUrl(request: Request, pathname: string): URL {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || "127.0.0.1";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return new URL(pathname, `${proto}://${host}/`);
}
