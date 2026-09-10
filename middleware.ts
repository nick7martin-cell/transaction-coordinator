import { NextResponse, type NextRequest } from "next/server";
import {
  authEnforced,
  supabaseAuthConfigured,
} from "@/lib/supabase/env";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set(["/login"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && supabaseAuthConfigured()) {
      const { supabaseResponse, user } = await refreshSupabaseSession(request);
      if (user) {
        const home = request.nextUrl.clone();
        home.pathname = "/";
        home.search = "";
        return NextResponse.redirect(home);
      }
      return supabaseResponse;
    }
    return NextResponse.next();
  }

  if (!authEnforced()) {
    return NextResponse.next();
  }

  if (!supabaseAuthConfigured()) {
    if (pathname.startsWith("/api/")) {
      return Response.json(
        {
          error:
            "Login is not configured. Set NEXT_PUBLIC_SUPABASE_ANON_KEY and HANDLED_ALLOWED_EMAIL in Vercel.",
        },
        { status: 503 }
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("error", "config");
    return NextResponse.redirect(loginUrl);
  }

  const { supabaseResponse, user } = await refreshSupabaseSession(request);

  if (user) {
    return supabaseResponse;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
