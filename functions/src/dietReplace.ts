// Uma dieta nova substitui as anteriores: grava a nova e apaga as outras (documento e arquivo).
// Duas importações ao mesmo tempo seguem uma ordem só, (created_at, id): na transação a nova só desativa as
// ativas mais antigas (e só fica ativa se não houver uma mais nova), e a limpeza só apaga as mais antigas.
// Assim fica sempre exatamente uma ativa, a mais nova, e uma importação nunca apaga a dieta mais nova da outra.
export type Key = { id: string; created_at: string | null };
type Doc = Key & { file_path: string | null };

export const isOlder = (a: Key, b: Key) => {
  const x = a.created_at ?? "", y = b.created_at ?? "";
  return x < y || (x === y && a.id < b.id);
};

/** Dentro da transação: quais ativas desativar e se a nova fica ativa. Ignora o próprio id (nova tentativa da transação). */
export function activation(next: Key, actives: Key[]): { deactivate: string[]; active: boolean } {
  const others = actives.filter((d) => d.id !== next.id);
  return { deactivate: others.filter((d) => isOlder(d, next)).map((d) => d.id), active: !others.some((d) => isOlder(next, d)) };
}

export type ReplaceDeps = {
  list(): Promise<Doc[]>;
  /** Id da dieta nova, gerado uma vez (a transação pode ser repetida e regrava o mesmo documento). */
  newId(): string;
  /** Grava a nova numa transação, aplicando `activation` às ativas atuais. */
  save(id: string, data: Record<string, unknown>): Promise<void>;
  remove(id: string): Promise<void>;
  deactivate(id: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
};

export async function replaceDiets(deps: ReplaceDeps, data: Record<string, unknown>): Promise<string> {
  const at = typeof data.created_at === "string" ? data.created_at : new Date().toISOString();
  const newId = deps.newId();
  await deps.save(newId, { ...data, created_at: at });
  const me = { id: newId, created_at: at };
  try {
    const newPath = typeof data.file_path === "string" ? data.file_path : null;
    const docs = await deps.list();
    for (const d of docs) {
      if (d.id === newId || !isOlder(d, me)) continue;
      // Nunca apaga o arquivo que a dieta nova usa. Se o arquivo antigo não for apagado, o documento
      // fica (inativo) para continuar apontando para ele: "Remover dieta" ou a próxima importação tentam de novo.
      try {
        let fileGone = true;
        if (d.file_path && d.file_path !== newPath) {
          try {
            await deps.deleteFile(d.file_path);
          } catch {
            console.error("importDietPlan: limpeza");
            fileGone = false;
          }
        }
        if (fileGone) await deps.remove(d.id);
        else await deps.deactivate(d.id);
      } catch {
        console.error("importDietPlan: limpeza");
      }
    }
  } catch {
    console.error("importDietPlan: limpeza");
  }
  return newId;
}
