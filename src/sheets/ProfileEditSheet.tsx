import { useRef, useState } from "react";
import { updateDoc } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { Segmented, Sheet } from "@/components/Sheet";
import { PrivateImage } from "@/components/PrivateImage";
import { compressImage } from "@/lib/image";
import { profileDoc, storage, type Profile } from "@/lib/firebase";

const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

/** Edita nome, sexo, altura, ano de nascimento e foto. O peso vem das medidas. */
export function ProfileEditSheet({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(profile.name ?? "");
  const [sex, setSex] = useState<"f" | "m" | "">(profile.sex ?? "");
  const [height, setHeight] = useState(profile.height_cm != null ? String(profile.height_cm) : "");
  const [year, setYear] = useState(profile.birth_year != null ? String(profile.birth_year) : "");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function pick(f?: File) {
    if (!f) return;
    setMsg("");
    try {
      const { blob, preview } = await compressImage(f, 800, 0.85);
      setPhoto({ blob, preview });
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const data: Record<string, unknown> = {
        name: name.trim() || null, sex: sex || null, height_cm: num(height), birth_year: num(year),
      };
      let uploaded: string | null = null;
      if (photo) {
        // As regras do Storage não deixam sobrescrever: arquivo novo, depois apaga o antigo.
        uploaded = `profile-photos/${profile.id}/${crypto.randomUUID()}.jpg`;
        await uploadBytes(ref(storage, uploaded), photo.blob, { contentType: "image/jpeg" });
        data.photo_path = uploaded;
      }
      try {
        await updateDoc(profileDoc(profile.id), data);
      } catch (e) {
        if (uploaded) await deleteObject(ref(storage, uploaded)).catch(() => {});
        throw e;
      }
      if (uploaded && profile.photo_path) await deleteObject(ref(storage, profile.photo_path)).catch(() => {});
      onSaved();
    } catch {
      setMsg("Não foi possível salvar. Confira os valores e tente de novo.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="Perfil" onClose={onClose}>
      <div className="edit-photo">
        <div className="avatar big" aria-hidden>
          {photo ? <img className="private-img" src={photo.preview} alt="" draggable={false} />
            : profile.photo_path ? <PrivateImage path={profile.photo_path} alt="" /> : <span>{(name || "?").trim().charAt(0).toUpperCase()}</span>}
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <button className="btn ghost small" onClick={() => input.current?.click()}>
          {photo || profile.photo_path ? "Trocar foto" : "Adicionar foto"}
        </button>
      </div>

      <label className="field"><span>Nome</span>
        <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <Segmented value={sex} onChange={setSex}
        options={[{ value: "f", label: "Feminino" }, { value: "m", label: "Masculino" }]} />
      <div className="row">
        <label className="field"><span>Altura (cm)</span>
          <input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
        <label className="field"><span>Nascimento</span>
          <input inputMode="numeric" placeholder="ano" value={year} onChange={(e) => setYear(e.target.value)} /></label>
      </div>
      {msg && <p className="note err">{msg}</p>}
      <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar"}</button>
    </Sheet>
  );
}
