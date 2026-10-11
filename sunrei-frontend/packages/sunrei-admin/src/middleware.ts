import { NextRequest, NextResponse } from 'next/server';

// 로그인 여부는 클라이언트의 Providers와 (dashboard) layout이 adminToken cookie로 확인한다.
// admin 권한은 서버가 JWT role로 확인하므로 여기서는 요청을 그대로 통과시킨다.
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};