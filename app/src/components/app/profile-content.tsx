import { ChangePasswordForm, ThemeChooser } from "@/components/app/profile-forms";
import type { ThemeChoice } from "@/components/app/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Conteudo do perfil, compartilhado por /portal/profile e /admin/profile. So dados da PROPRIA pessoa (sessao).
export function ProfileContent({
  user,
  roleLabel,
  themePreference,
  clientName,
}: {
  user: { name: string; email: string };
  roleLabel: string;
  themePreference: ThemeChoice;
  clientName?: string | null;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Seus dados</CardTitle>
          <CardDescription>Para alterar nome ou e-mail, fale com o administrador da agência.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Nome</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">E-mail</dt>
              <dd className="font-medium break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Papel</dt>
              <dd className="font-medium">{roleLabel}</dd>
            </div>
            {clientName ? (
              <div>
                <dt className="text-sm text-muted-foreground">Cliente ativo</dt>
                <dd className="font-medium">{clientName}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Trocar senha</CardTitle>
          <CardDescription>Ao trocar, os outros aparelhos conectados são desconectados.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tema</CardTitle>
          <CardDescription>A escolha fica salva na sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeChooser preference={themePreference} />
        </CardContent>
      </Card>
    </div>
  );
}
