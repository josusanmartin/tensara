import { NextResponse, type NextRequest } from "next/server";

const ROBOTS_HEADER = "noindex, nofollow, noarchive, nosnippet";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Tensara"',
      "X-Robots-Tag": ROBOTS_HEADER,
    },
  });
}

function decodeBasicAuth(value: string) {
  if (!value.startsWith("Basic ")) return null;

  try {
    const decoded = atob(value.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function isCliSubmissionEndpoint(pathname: string) {
  return (
    pathname === "/api/submissions/submit" ||
    pathname === "/api/submissions/direct-submit"
  );
}

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/robots.txt") {
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": ROBOTS_HEADER,
      },
    });
  }

  const username = process.env.TENSARA_WEB_USERNAME;
  const password = process.env.TENSARA_WEB_PASSWORD;

  if (username && password) {
    const authorization = req.headers.get("authorization") ?? "";

    if (
      isCliSubmissionEndpoint(req.nextUrl.pathname) &&
      authorization.startsWith("Bearer ")
    ) {
      const response = NextResponse.next();
      response.headers.set("X-Robots-Tag", ROBOTS_HEADER);
      return response;
    }

    const credentials = decodeBasicAuth(authorization);
    if (
      credentials?.username !== username ||
      credentials.password !== password
    ) {
      return unauthorized();
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", ROBOTS_HEADER);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
