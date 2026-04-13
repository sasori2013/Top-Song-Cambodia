import { NextRequest, NextResponse } from 'next/server';

const SITE_PASSWORD = process.env.SITE_PASSWORD || 'heat2026';
const COOKIE_NAME = 'heat_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Always allow: OG image API (needed for Facebook posting)
  if (pathname.startsWith('/api/og')) {
    return NextResponse.next();
  }

  // ✅ Always allow: login page and its API
  if (pathname === '/login' || pathname === '/api/auth/login') {
    return NextResponse.next();
  }

  // Check auth cookie
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value === SITE_PASSWORD) {
    return NextResponse.next();
  }

  // 🔒 Redirect all unauthenticated requests to login
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
};
