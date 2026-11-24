import type { ThemePreference } from "@/generated/prisma/enums";
import type { Db } from "@/server/db/client";

// Preferencia da PROPRIA pessoa (userId vem da sessao): users nao tem client_id nem RLS.
export async function setThemePreference(db: Db, userId: string, theme: ThemePreference) {
  await db.user.update({ where: { id: userId }, data: { themePreference: theme } });
}
