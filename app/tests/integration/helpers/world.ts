import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { GlobalRole, MemberRole } from "@/generated/prisma/enums";
import { createDb, type Db } from "@/server/db/client";

function requireTestUrl(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name} em app/.env`);
  const u = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.pathname !== "/nexo_test") {
    throw new Error(`${name} precisa apontar para nexo_test em 127.0.0.1/localhost`);
  }
  return value;
}

/** Conexao do app (papel nexo_app, sujeito a RLS). */
export const appDb: Db = createDb(requireTestUrl("TEST_DATABASE_URL"));
/** Conexao do dono (superusuario, ignora RLS): so para montar fixtures e conferir o estado real. */
export const ownerDb: Db = createDb(requireTestUrl("TEST_DATABASE_MIGRATE_URL"));

export const TEST_PASSWORD = "senha-de-teste-123456"; // valor so de teste, usado apenas em nexo_test

const tag = () => randomUUID().slice(0, 8);

export async function makeUser(role: GlobalRole = "USER", label = "u") {
  const id = randomUUID();
  const email = `${label}-${tag()}@teste.test`;
  await ownerDb.user.create({ data: { id, email, name: `${label} ficticio`, role, emailVerified: true } });
  await ownerDb.account.create({
    data: { userId: id, providerId: "credential", accountId: id, password: await hashPassword(TEST_PASSWORD) },
  });
  return { id, email };
}

export async function makeClient(label: string) {
  const row = await ownerDb.client.create({ data: { name: `Cliente ${label}`, slug: `${label.toLowerCase()}-${tag()}` } });
  return row.id;
}

export async function addMember(clientId: string, userId: string, role: MemberRole) {
  return ownerDb.clientMember.create({ data: { clientId, userId, role } });
}

export async function makeInvitationRow(clientId: string, invitedById: string, label: string) {
  const now = new Date();
  return ownerDb.invitation.create({
    data: {
      clientId,
      invitedById,
      email: `${label}-${tag()}@convidado.test`,
      role: "CLIENT_COLLABORATOR",
      tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 3600_000),
    },
  });
}

export interface World {
  clientA: string;
  clientB: string;
  admin: { id: string; email: string };
  ownerA: { id: string; email: string };
  collabA: { id: string; email: string };
  ownerB: { id: string; email: string };
  staffAssignedA: { id: string; email: string };
  staffUnassigned: { id: string; email: string };
  memberOwnerB: string;
  memberOwnerA: string;
  invitationA: string;
  invitationB: string;
}

/** Dois clientes com dados proprios (membros, convites, auditoria) e usuarios de cada papel. */
export async function makeWorld(): Promise<World> {
  const [clientA, clientB] = [await makeClient("A"), await makeClient("B")];
  const admin = await makeUser("ADMIN", "admin");
  const ownerA = await makeUser("USER", "dono-a");
  const collabA = await makeUser("USER", "colab-a");
  const ownerB = await makeUser("USER", "dono-b");
  const staffAssignedA = await makeUser("STAFF", "staff-a");
  const staffUnassigned = await makeUser("STAFF", "staff-livre");
  const mOwnerA = await addMember(clientA, ownerA.id, "CLIENT_OWNER");
  await addMember(clientA, collabA.id, "CLIENT_COLLABORATOR");
  await addMember(clientA, staffAssignedA.id, "STAFF");
  const mOwnerB = await addMember(clientB, ownerB.id, "CLIENT_OWNER");
  const invA = await makeInvitationRow(clientA, admin.id, "conv-a");
  const invB = await makeInvitationRow(clientB, admin.id, "conv-b");
  await ownerDb.auditLog.create({ data: { clientId: clientA, actorId: admin.id, action: "seed.a", entityType: "client", entityId: clientA } });
  await ownerDb.auditLog.create({ data: { clientId: clientB, actorId: admin.id, action: "seed.b", entityType: "client", entityId: clientB } });
  return {
    clientA,
    clientB,
    admin,
    ownerA,
    collabA,
    ownerB,
    staffAssignedA,
    staffUnassigned,
    memberOwnerA: mOwnerA.id,
    memberOwnerB: mOwnerB.id,
    invitationA: invA.id,
    invitationB: invB.id,
  };
}
