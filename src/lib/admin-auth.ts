import type { APIContext } from 'astro';
import { runtimeEnv, sameOriginRequest } from './cloudflare-runtime';

export const ADMIN_COOKIE = 'rajab_admin_session';
const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
};

const fromBase64Url = (value: string) => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const signingKey = (secret: string) => crypto.subtle.importKey(
  'raw',
  encoder.encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify']
);

export async function createAdminSession(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = toBase64Url(encoder.encode(JSON.stringify({ issuedAt: now, expiresAt: now + SESSION_SECONDS })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifyAdminSession(token: string, secret: string) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      fromBase64Url(signature),
      encoder.encode(payload)
    );
    if (!valid) return false;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { expiresAt?: number };
    return Number(data.expiresAt) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

const cookieValue = (request: Request, name: string) => {
  const match = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
};

export async function requireAdmin(context: Pick<APIContext, 'request' | 'locals'>, mutate = false) {
  if (mutate && !sameOriginRequest(context.request)) throw new Error('FORBIDDEN');
  const env = runtimeEnv(context.locals);
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('UNAUTHORIZED');
  const token = cookieValue(context.request, ADMIN_COOKIE);
  if (!token || !await verifyAdminSession(token, env.SESSION_SECRET)) throw new Error('UNAUTHORIZED');
}

export async function passwordMatches(input: string, expected: string) {
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(input)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
}

export const adminCookie = (token: string, secure: boolean) =>
  `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;

export const clearAdminCookie = (secure: boolean) =>
  `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
