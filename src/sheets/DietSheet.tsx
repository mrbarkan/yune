import { useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { Sheet } from "@/components/Sheet";
import { mealFor, optionKcal } from "@/lib/diet";
import { storage, type DietPlan, type DietRule } from "@/lib/firebase";
import { fmtLiters, fmtNum } from "@/lib/time";
import { mealName } from "./FoodSheet";

const KINDS: { kind: DietRule["kind"]; title: string }[] = [
  { kind: "avoid", title: "Evitar" },
  { kind: "limit", title: "Com limite" },
  { kind: "prefer", title: "Incentivado" },
];

/** A dieta prescrita para consulta: metas, refeições com opções, restrições e orientações. */
export function DietSheet({ plan, onClose }: { plan: DietPlan; onClose: () => void }) {
  const [err, setErr] = useState("");
  const now = mealFor(plan, new Date(), mealName(new Date()));
  const t = plan.targets;
  const targets = [
    t.kcal != null && ["Calorias", `${fmtNum(t.kcal)} kcal`],
    t.protein_g != null && ["Proteína", `${fmtNum(t.protein_g)} g`],
    t.carbs_g != null && ["Carboidrato", `${fmtNum(t.carbs_g)} g`],
    t.fat_g != null && ["Gordura", `${fmtNum(t.fat_g)} g`],
    t.fiber_g != null && ["Fibras", `${fmtNum(t.fiber_g)} g`],
    t.water_ml != null && ["Água", `${fmtLiters(t.water_ml)} L`],
  ].filter(Boolean) as [string, string][];

  async function openFile() {
    setErr("");
    try {
      window.open(await getDownloadURL(ref(storage, plan.file_path!)), "_blank", "noopener");
    } catch {
      setErr("Não foi possível abrir o arquivo.");
    }
  }

  return (
    <Sheet title="Dieta" accent="food" onClose={onClose}>
      <header className="diet-head">
        <p className="eyebrow">{[plan.prescriber, plan.issued_on].filter(Boolean).join(" · ") || "Prescrita"}</p>
        <h3>{plan.title}</h3>
        {plan.summary && <p className="note">{plan.summary}</p>}
      </header>

      {targets.length > 0 && (
        <dl className="diet-targets">
          {targets.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}

      {plan.meals.length > 0 && (
        <section className="diet-meals">
          <p className="eyebrow">Refeições</p>
          {plan.meals.map((m, i) => (
            <details key={i} open={m === now}>
              <summary>
                <b>{m.name}</b>
                {m === now && <small className="diet-now">agora</small>}
                {m.time && <time>{m.time}</time>}
              </summary>
              {m.options.map((o, j) => (
                <div key={j} className="diet-option">
                  {m.options.length > 1 && <p className="diet-option-label">{o.label} <em>~{fmtNum(optionKcal(o))} kcal</em></p>}
                  <ul>
                    {o.items.map((it, k) => <li key={k}><span>{it.name}</span><small>{it.quantity}</small></li>)}
                  </ul>
                </div>
              ))}
              {m.notes && <p className="note">{m.notes}</p>}
            </details>
          ))}
        </section>
      )}

      {KINDS.map(({ kind, title }) => {
        const rules = plan.rules.filter((r) => r.kind === kind);
        return rules.length > 0 && (
          <section key={kind} className={`diet-rules ${kind}`}>
            <p className="eyebrow">{title}</p>
            <ul>{rules.map((r, i) => <li key={i}><b>{r.name}</b>{r.detail && <span>{r.detail}</span>}</li>)}</ul>
          </section>
        );
      })}

      {plan.guidelines.length > 0 && (
        <section className="diet-rules">
          <p className="eyebrow">Orientações</p>
          <ul>{plan.guidelines.map((g, i) => <li key={i}><span>{g}</span></li>)}</ul>
        </section>
      )}

      {plan.notes && <p className="note">{plan.notes}</p>}
      {plan.file_path && <button className="btn ghost" onClick={openFile}>Abrir arquivo original</button>}
      {err && <p className="note err">{err}</p>}
      <p className="colophon">Valores por item são estimativas do Yune. Na dúvida, vale o que está na prescrição.</p>
    </Sheet>
  );
}
