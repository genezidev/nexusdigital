"use client";

import {
  Building2,
  Home,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ThemeSync, ThemeToggle, type ThemeChoice } from "@/components/app/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ApiError, api } from "@/lib/api/client";
import { hardNavigate } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const ICONS = { dashboard: LayoutDashboard, clients: Building2, audit: ScrollText, profile: UserRound, home: Home } satisfies Record<string, LucideIcon>;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Quando true, so fica ativo na rota exata (ex.: /admin nao e ativo em /admin/clients). */
  exact?: boolean;
}

export interface ShellProps {
  area: "admin" | "portal";
  user: { name: string; email: string; roleLabel: string };
  themePreference: ThemeChoice;
  nav: NavItem[];
  contextLabel: string;
  profileHref: string;
  /** Portal: clientes que a pessoa pode escolher. O servidor reconfere a escolha. */
  switcher?: { activeClientId: string | null; clients: { id: string; name: string }[] };
  children: ReactNode;
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 text-sidebar-foreground">
      <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar">
        <Layers className="size-5" aria-hidden="true" />
      </span>
      <span className="text-lg font-semibold tracking-tight">Nexo Digital</span>
    </div>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-primary",
                active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className={cn("size-5", active && "text-sidebar-primary")} aria-hidden="true" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UserMenu({ user, profileHref }: Pick<ShellProps, "user" | "profileHref">) {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await api.logout();
      // Recarga completa: descarta todo estado e cache de rota em memoria da sessao que acabou.
      hardNavigate("/login");
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof ApiError ? error.message : "Não foi possível sair. Tente novamente.");
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-[12rem] gap-2 px-2" aria-label={`Menu da conta de ${user.name}`}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
            <UserRound className="size-4" />
          </span>
          <span className="hidden truncate text-sm font-medium sm:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold">{user.name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref}>
            <UserRound aria-hidden="true" /> Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={(event) => {
            event.preventDefault();
            void logout();
          }}
        >
          <LogOut aria-hidden="true" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClientSwitcher({ switcher }: { switcher: NonNullable<ShellProps["switcher"]> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (switcher.clients.length === 0) return <span className="truncate text-sm text-muted-foreground">Sem cliente ativo</span>;
  if (switcher.clients.length === 1) return <span className="truncate text-sm font-semibold">{switcher.clients[0].name}</span>;
  async function change(clientId: string) {
    setBusy(true);
    try {
      await api.switchClient(clientId);
      toast.success("Cliente alterado.");
      // Remonta a tela do cliente anterior e busca tudo de novo no servidor, que reconfere a participacao.
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível trocar de cliente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Select value={switcher.activeClientId ?? undefined} onValueChange={(v) => void change(v)} disabled={busy}>
      <SelectTrigger aria-label="Cliente ativo" className="w-full max-w-[16rem] min-w-0">
        <SelectValue placeholder="Escolha um cliente" />
      </SelectTrigger>
      <SelectContent>
        {switcher.clients.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AppShell({ area, user, themePreference, nav, contextLabel, profileHref, switcher, children }: ShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="min-h-dvh">
      <ThemeSync preference={themePreference} />
      <a
        href="#conteudo"
        className="sr-only z-[60] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Ir para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 md:flex" aria-label="Navegação principal">
        <Brand />
        <nav aria-label={area === "admin" ? "Administração" : "Portal"}>
          <NavLinks items={nav} />
        </nav>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background px-3 md:px-8">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu de navegação">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-6 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground [&>button]:text-sidebar-foreground">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              <SheetDescription className="sr-only">Escolha uma página do sistema.</SheetDescription>
              <Brand />
              <nav aria-label={area === "admin" ? "Administração" : "Portal"}>
                <NavLinks items={nav} onNavigate={() => setDrawerOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {switcher ? (
              <ClientSwitcher switcher={switcher} />
            ) : (
              <span className="truncate text-sm font-semibold">{contextLabel}</span>
            )}
          </div>

          <ThemeToggle preference={themePreference} />
          <UserMenu user={user} profileHref={profileHref} />
        </header>

        <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 outline-none md:px-8 md:py-8">
          {/* A chave remonta o conteudo ao trocar de cliente: nenhum estado do cliente anterior sobrevive. */}
          <div key={switcher?.activeClientId ?? "sem-cliente"}>{children}</div>
        </main>
      </div>
    </div>
  );
}
