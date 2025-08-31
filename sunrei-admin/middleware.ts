import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // TODO: Enable authentication check when login is implemented
  // const token = request.cookies.get('adminToken');
  // const isLoginPage = request.nextUrl.pathname === '/login';

  // if (!token && !isLoginPage) {
  //   return NextResponse.redirect(new URL('/login', request.url));
  // }

  // if (token && isLoginPage) {
  //   return NextResponse.redirect(new URL('/', request.url));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};