import { NextRequest, NextResponse } from 'next/server';

const SITE_PASSWORD = process.env.SITE_PASSWORD || 'heat2026';
const COOKIE_NAME = 'heat_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: NextRequest) {
  const { password, from } = await req.json();

  if (password === SITE_PASSWORD) {
    const res = NextResponse.json({ success: true });
    res.cookies.set(COOKIE_NAME, SITE_PASSWORD, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    return res;
  }

  return NextResponse.json({ success: false, error: 'パスワードが違います' }, { status: 401 });
}
