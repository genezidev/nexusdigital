import { describe, expect, it } from "vitest";
import type { TenantContext } from "@/server/authorization/context";
import { can, type Action } from "@/server/authorization/permissions";

const ctx = (globalRole: "ADMIN" | "STAFF" | "USER", memberRole: TenantContext["memberRole"], permissions: string[] = []) =>
  ({ clientId: "c", userId: "u", globalRole, memberRole, permissions }) as unknown as TenantContext;

const ADMIN = ctx("ADMIN", null);
const STAFF = ctx("STAFF", "STAFF");
const OWNER = ctx("USER", "CLIENT_OWNER");
const COLLAB = ctx("USER", "CLIENT_COLLABORATOR");
const COLLAB_APPROVER = ctx("USER", "CLIENT_COLLABORATOR", ["content:approve"]);

// Matriz da spec 0002 (papeis e permissoes).
describe("matriz de permissoes da fase 2", () => {
  const rows: [Action, boolean, boolean, boolean, boolean][] = [
    // acao, ADMIN, STAFF, OWNER, COLLAB
    ["plan:read", true, true, false, false],
    ["plan:manage", true, false, false, false],
    ["subscription:manage", true, false, false, false],
    ["subscription:read", true, true, true, true],
    ["cycle:manage", true, false, false, false],
    ["cycle:read", true, true, true, true],
    ["content:classify", true, false, false, false],
    ["content:write", true, true, false, false],
    ["content:read", true, true, true, true],
    ["content:approve", false, false, true, false],
    ["comment:create", true, true, true, true],
    ["comment:create_internal", true, true, false, false],
    ["script:write", true, true, false, false],
    ["script:read", true, true, true, true],
    ["recording:submit", true, true, true, true],
    ["recording:review", true, true, false, false],
    ["asset:upload", true, true, true, true],
    ["asset:attach", true, true, false, false],
    ["asset:delete_any", true, false, false, false],
    // D-0025: links de midia (cliente le, cadastra e remove; o banco limita o cliente a gravacao dele e ao que ele cadastrou)
    ["media_link:read", true, true, true, true],
    ["media_link:create", true, true, true, true],
    ["media_link:remove", true, true, true, true],
    // D-0026: so o dono (e o admin) gerenciam a equipe; colaborador e STAFF nao
    ["team:manage", true, false, true, false],
  ];
  it.each(rows)("%s", (action, admin, staff, owner, collab) => {
    expect(can(ADMIN, action), "ADMIN").toBe(admin);
    expect(can(STAFF, action), "STAFF").toBe(staff);
    expect(can(OWNER, action), "OWNER").toBe(owner);
    expect(can(COLLAB, action), "COLLAB").toBe(collab);
  });

  it("colaborador so aprova com a concessao explicita; nenhuma outra concessao vale", () => {
    expect(can(COLLAB_APPROVER, "content:approve")).toBe(true);
    expect(can(ctx("USER", "CLIENT_COLLABORATOR", ["content:write", "plan:manage", "content:classify"]), "content:write")).toBe(false);
    expect(can(ctx("USER", "CLIENT_COLLABORATOR", ["plan:manage"]), "plan:manage")).toBe(false);
    expect(can(ctx("USER", "CLIENT_OWNER", ["content:write"]), "content:write")).toBe(false);
  });

  it("team:manage nao e concedivel: nem a colaborador nem por entrada em permissions", () => {
    expect(can(ctx("USER", "CLIENT_COLLABORATOR", ["team:manage"]), "team:manage")).toBe(false);
    expect(can(ctx("STAFF", "STAFF", ["team:manage"]), "team:manage")).toBe(false);
  });

  it("STAFF pode ter content:write e script:write revogados por entrada negativa", () => {
    const s = ctx("STAFF", "STAFF", ["-content:write"]);
    expect(can(s, "content:write")).toBe(false);
    expect(can(s, "script:write")).toBe(true);
  });

  it("ADMIN e STAFF nunca aprovam em nome do cliente; sem papel de membro nao ha nada (nega por padrao)", () => {
    expect(can(ctx("STAFF", "STAFF", ["content:approve"]), "content:approve")).toBe(false);
    expect(can(ctx("USER", null), "content:read")).toBe(false);
  });
});
