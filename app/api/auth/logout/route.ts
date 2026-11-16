import { NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";
import { SESSION_COOKIE } from "@/lib/secret";

export async function POST(request: Request) {
  const response = NextResponse.redirect(publicUrl(request, "/login"), 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
