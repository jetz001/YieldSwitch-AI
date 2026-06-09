import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const token = req.auth;
  const isAuth = !!token;
  const isAdminPage = req.nextUrl.pathname.startsWith('/admin') || req.nextUrl.pathname.startsWith('/api/admin');

  if (isAdminPage) {
    if (!isAuth) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    if (token.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/dashboard/:path*",
  ],
};
