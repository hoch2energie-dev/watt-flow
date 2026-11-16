import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/secret";
import { verifyToken } from "@/lib/token";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/health" ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    const forwarded = request.headers.get("x-forwarded-host");
    const host = forwarded || (url.hostname === "0.0.0.0" ? request.headers.get("host") : null);
    if (host) {
      const [hostname, port] = host.split(":");
      url.hostname = hostname;
      url.port = port || "";
      const proto = request.headers.get("x-forwarded-proto");
      if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
    }
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
