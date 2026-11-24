import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

// Dados de apoio dos testes E2E, gravados direto em nexo_test (nunca dev ou producao).
function ownerUrl(): string {
  const url = process.env.TEST_DATABASE_MIGRATE_URL;
  if (!url) throw new Error("Defina TEST_DATABASE_MIGRATE_URL em app/.env");
  const u = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.pathname !== "/nexo_test") {
    throw new Error("Os testes E2E so gravam em nexo_test (127.0.0.1/localhost).");
  }
  return url;
}

export const E2E_PASSWORD = "senha-e2e-ficticia-123456"; // valor so de teste, usado apenas em nexo_test

export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: ownerUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export const tag = () => randomUUID().slice(0, 6);

export async function createClientRow(name: string): Promise<string> {
  return withDb(async (c) => {
    const id = randomUUID();
    await c.query("INSERT INTO clients (id, name, slug, contact_name, contact_email, updated_at) VALUES ($1,$2,$3,$4,$5, now())", [
      id,
      name,
      `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${tag()}`,
      "Contato Ficticio",
      `contato-${tag()}@cliente.test`,
    ]);
    return id;
  });
}

export async function createUserRow(input: { name: string; role?: "USER" | "STAFF" | "ADMIN"; password?: string }): Promise<{ id: string; email: string }> {
  const hash = await hashPassword(input.password ?? E2E_PASSWORD);
  return withDb(async (c) => {
    const id = randomUUID();
    const email = `e2e-${tag()}@ficticio.test`;
    await c.query(`INSERT INTO users (id, name, email, email_verified, role, updated_at) VALUES ($1,$2,$3,true,$4::"GlobalRole", now())`, [id, input.name, email, input.role ?? "USER"]);
    await c.query("INSERT INTO accounts (id, account_id, provider_id, user_id, password, updated_at) VALUES ($1,$2,'credential',$3,$4, now())", [randomUUID(), id, id, hash]);
    return { id, email };
  });
}

export async function addMemberRow(clientId: string, userId: string, role: "CLIENT_OWNER" | "CLIENT_COLLABORATOR" | "STAFF"): Promise<string> {
  return withDb(async (c) => {
    const id = randomUUID();
    await c.query(`INSERT INTO client_members (id, client_id, user_id, role, updated_at) VALUES ($1,$2,$3,$4::"MemberRole", now())`, [id, clientId, userId, role]);
    return id;
  });
}

export async function resetRateLimits(): Promise<void> {
  await withDb((c) => c.query("DELETE FROM rate_limits"));
}

export interface VisualData {
  clientId: string;
  clientName: string;
  owner: { id: string; email: string; name: string };
  colleague: { id: string; email: string };
}

/** Cliente com dados representativos (equipe, convite pendente, auditoria) para capturas e acessibilidade. */
export async function seedVisualData(): Promise<VisualData> {
  const clientName = `Padaria Pão Quente ${tag()}`;
  const clientId = await createClientRow(clientName);
  const owner = await createUserRow({ name: "Mariana Souza (ficticia)" });
  const colleague = await createUserRow({ name: "Carlos Lima (ficticio)" });
  await addMemberRow(clientId, owner.id, "CLIENT_OWNER");
  await addMemberRow(clientId, colleague.id, "CLIENT_COLLABORATOR");
  await withDb(async (c) => {
    const admin = await c.query("SELECT id FROM users WHERE email = 'admin@nexo-demo.test'");
    const adminId = admin.rows[0].id as string;
    await c.query(
      `INSERT INTO invitations (id, client_id, email, role, token_hash, expires_at, invited_by_id)
       VALUES ($1,$2,$3,'CLIENT_COLLABORATOR'::"MemberRole",$4, now() + interval '5 days', $5)`,
      [randomUUID(), clientId, `convite-${tag()}@ficticio.test`, randomUUID().replaceAll("-", "").padEnd(64, "a"), adminId],
    );
    for (const action of ["client.created", "invitation.created", "invitation.accepted"]) {
      await c.query("INSERT INTO audit_logs (id, client_id, actor_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4,'client',$5)", [randomUUID(), clientId, adminId, action, clientId]);
    }
  });
  return { clientId, clientName, owner: { ...owner, name: "Mariana Souza (ficticia)" }, colleague };
}
