// Uma dieta nova substitui as anteriores: grava a nova e apaga as outras (documento e arquivo).
type Doc = { id: string; file_path: string | null };
export type ReplaceDeps = {
  list(): Promise<Doc[]>;
  create(data: Record<string, unknown>): Promise<string>;
  remove(id: string): Promise<void>;
  deactivate(id: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
};

export async function replaceDiets(deps: ReplaceDeps, data: Record<string, unknown>): Promise<string> {
  const newId = await deps.create({ ...data, active: true });
  try {
    const newPath = typeof data.file_path === "string" ? data.file_path : null;
    const docs = await deps.list();
    for (const d of docs) {
      if (d.id === newId) continue;
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
