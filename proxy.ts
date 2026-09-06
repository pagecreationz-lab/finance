import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isAuthorizedRequest, unauthorizedResponse } from '@/lib/authorization';

export function proxy(request: NextRequest) {
  if (isAuthorizedRequest(request)) return NextResponse.next();
  return unauthorizedResponse();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg|og.png).*)'],
};
