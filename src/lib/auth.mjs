import { createHmac, timingSafeEqual } from 'node:crypto';
import { ContentError } from './storage.mjs';
const cookieName = 'reforged-author';
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || '';
function equal(a, b) { const aa = Buffer.from(a || ''), bb = Buffer.from(b || ''); return aa.length === bb.length && aa.length > 0 && timingSafeEqual(aa, bb); }
function sign(value) { return createHmac('sha256', secret()).update(value).digest('base64url'); }
export function createSession(name, token) {
  const configured = { Marc: process.env.ADMIN_MARC_TOKEN, David: process.env.ADMIN_DAVID_TOKEN, 'Project authors': process.env.ADMIN_TOKEN };
  if (!secret()) throw new ContentError(503, 'Author access needs a server session secret and author credentials.');
  if (!equal(token, configured[name])) throw new ContentError(401, 'The author name or access key is incorrect.');
  const payload = Buffer.from(JSON.stringify({ name, expires: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return { author: name, cookie: `${cookieName}=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NETLIFY ? '; Secure' : ''}` };
}
export function authorFrom(request) {
  if (!secret()) return null;
  const raw = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw) return null;
  const [value, signature] = raw.split('.');
  if (!equal(signature, sign(value))) return null;
  try { const session = JSON.parse(Buffer.from(value, 'base64url').toString()); return session.expires > Date.now() && ['Marc', 'David', 'Project authors'].includes(session.name) ? session.name : null; } catch { return null; }
}
export function requireAuthor(request) {
  const author = authorFrom(request);
  if (!author) throw new ContentError(401, 'Your author session has expired. Sign in again; your draft is still on this device.');
  return author;
}
export function sameOrigin(request) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin) throw new ContentError(403, 'This request must come from the author workspace on this site.');
  }
}
export const expiredCookie = `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
