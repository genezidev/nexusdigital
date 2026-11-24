import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// PRIMEIRA BARREIRA, nao a decisao. Aqui so se confere se existe cookie de sessao (sem banco, como o Next
// recomenda para o Proxy). Cookie presente nao prova nada: quem decide e o servidor em cada pagina, acao e
// handler, lendo a sessao no banco e chamando resolveTenantContext. Cookie ausente poupa uma ida ao banco.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (getSessionCookie(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Entre para continuar.", requestId: crypto.randomUUID() } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const login = new URL("/login", request.url);
  // O destino volta como caminho interno; o login valida de novo (safeNext).
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*", "/api/admin/:path*", "/api/portal/:path*", "/api/me/:path*"],
};
