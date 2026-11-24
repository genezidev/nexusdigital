import { randomUUID } from "node:crypto";

/** Chave do objeto: clients/<client_id>/<uuid aleatorio>. Sem nome original, sem extensao (o banco confere o formato). */
export function newStorageKey(clientId: string): string {
  return `clients/${clientId}/${randomUUID()}`;
}
