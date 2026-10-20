import { useEffect, useState } from "react";
import { getDocs, orderBy, query } from "firebase/firestore";
import { rows, table, type Table } from "./firebase";

/** Lê uma coleção inteira ordenada; `loaded` só vira true depois da primeira resposta. */
export function useCollection<T>(name: Table, order: string, version: number, errMsg: string): { list: T[]; err: string; loaded: boolean } {
  const [s, setS] = useState<{ list: T[]; err: string; loaded: boolean }>({ list: [], err: "", loaded: false });
  useEffect(() => {
    let alive = true;
    getDocs(query(table(name), orderBy(order)))
      .then((snap) => alive && setS({ list: rows<T>(snap), err: "", loaded: true }))
      .catch(() => alive && setS((p) => ({ ...p, err: errMsg }))); // a lista anterior fica na tela
    return () => { alive = false; };
  }, [name, order, version, errMsg]);
  return s;
}
