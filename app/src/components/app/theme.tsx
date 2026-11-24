"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEME_STORAGE_KEY } from "@/components/app/theme-script";
import { ApiError, api } from "@/lib/api/client";

export type ThemeChoice = "SYSTEM" | "LIGHT" | "DARK";

const THEME_EVENT = "nexo-theme-change";

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === "DARK" || (choice === "SYSTEM" && prefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Armazenamento bloqueado: o tema vale so nesta pagina. A preferencia da conta continua no servidor.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Tema efetivo ("light"/"dark") para quem precisa saber (ex.: toasts). */
export function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const update = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    update();
    window.addEventListener(THEME_EVENT, update);
    return () => window.removeEventListener(THEME_EVENT, update);
  }, []);
  return theme;
}

/** Aplica a preferencia gravada na conta e acompanha o sistema quando a escolha e "Sistema". */
export function ThemeSync({ preference }: { preference: ThemeChoice }) {
  useEffect(() => {
    applyTheme(preference);
    if (preference !== "SYSTEM") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("SYSTEM");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);
  return null;
}

const LABEL: Record<ThemeChoice, string> = { LIGHT: "Claro", DARK: "Escuro", SYSTEM: "Sistema" };

/** Troca o tema na hora e grava na conta. Falha ao gravar nao desfaz o tema local, mas avisa. */
export function useThemeChoice(initial: ThemeChoice) {
  // `override` guarda a escolha feita nesta tela; sem ela vale a preferencia que veio do servidor.
  const [override, setOverride] = useState<ThemeChoice | null>(null);
  const choice = override ?? initial;
  const change = useCallback(async (next: ThemeChoice) => {
    setOverride(next);
    applyTheme(next);
    try {
      await api.setTheme(next);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar o tema na sua conta.");
    }
  }, []);
  return { choice, change };
}

export function ThemeToggle({ preference }: { preference: ThemeChoice }) {
  const { choice, change } = useThemeChoice(preference);
  const Icon = choice === "DARK" ? Moon : choice === "LIGHT" ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Tema: ${LABEL[choice]}. Alterar tema`}>
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={choice} onValueChange={(v) => void change(v as ThemeChoice)}>
          <DropdownMenuRadioItem value="LIGHT" className="min-h-11">
            <Sun aria-hidden="true" /> Claro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="DARK" className="min-h-11">
            <Moon aria-hidden="true" /> Escuro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="SYSTEM" className="min-h-11">
            <Monitor aria-hidden="true" /> Sistema
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
