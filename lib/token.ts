import { jwtVerify, SignJWT } from "jose";
import { authSecret } from "@/lib/secret";

export type SessionToken = { sub: string; email: string; name: string };

export async function signSession(user: SessionToken): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(authSecret());
}

export async function verifyToken(token: string): Promise<SessionToken | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.name !== "string") {
      return null;
    }
    return { sub: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}
