import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type SessionPayload = {
  nonce: string;
  exp: number;
  iat: number;
};

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signValue(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function parseSessionCookieValue(value: string): SessionPayload | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as SessionPayload;
    if (
      typeof parsed.nonce !== "string" ||
      typeof parsed.exp !== "number" ||
      typeof parsed.iat !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractBearerToken(headerValue?: string | null): string | null {
  if (!headerValue) return null;
  const match = /^bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1]?.trim() || null;
}

export function isValidAdminBearer(
  headerValue: string | null | undefined,
  adminKey: string,
): boolean {
  const token = extractBearerToken(headerValue);
  return token === adminKey;
}

export async function createSessionCookieValue(
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    nonce: randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  const signature = signValue(encoded, secret);
  return `${encoded}.${signature}`;
}

export async function verifySessionCookieValue(
  cookieValue: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!cookieValue) return false;

  const [encoded, signature] = cookieValue.split(".");
  if (!encoded || !signature) return false;

  const expectedSignature = signValue(encoded, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);

  if (left.length !== right.length) return false;
  if (!timingSafeEqual(left, right)) return false;

  const payload = parseSessionCookieValue(encoded);
  if (!payload) return false;

  const now = Math.floor(Date.now() / 1000);
  return payload.exp > now;
}
