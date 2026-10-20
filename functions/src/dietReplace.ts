// Uma dieta nova substitui as anteriores: grava a nova e apaga as outras (documento e arquivo).
// Duas importações ao mesmo tempo: a transação de createActive deixa só uma ativa, e a limpeza só apaga
// dietas mais antigas que a nova, então uma importação nunca apaga a dieta que a outra acabou de gravar.
type Doc = { id: string; file_path: string | null; created_at: string | null };
export type ReplaceDeps = {
  list(): Promise<Doc[]>;
  /** Grava a nova como a única ativa (desativa as ativas atuais na mesma transação) e devolve o id. */
  createActive(data: Record<string, unknown>): Promise<string>;
  remove(id: string): Promise<void>;
  deactivate(id: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
};

export async function replaceDiets(deps: ReplaceDeps, data: Record<string, unknown>): Promise<string> {
  const at = typeof data.created_at === "string" ? data.created_at : new Date().toISOString();
  const newId = await deps.createActive({ ...data, created_at: at, active: true });
  const older = (d: Doc) => (d.created_at ?? "") < at || ((d.created_at ?? "") === at && d.id < newId);
  try {
    const newPath = typeof data.file_path === "string" ? data.file_path : null;
    const docs = await deps.list();
    for (const d of docs) {
      if (d.id === newId || !older(d)) continue;
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
