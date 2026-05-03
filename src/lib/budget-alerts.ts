import { getPresupuestosMes } from "./sheets";

/**
 * Detecta si el usuario llegó al 80% o 100% de un presupuesto de categoría.
 * Devuelve un mensaje de alerta o null si no hay alerta.
 */
export async function checkBudgetAlert(
  categoria: string,
  yyyymm: string,
): Promise<string | null> {
  const presupuestos = await getPresupuestosMes(yyyymm);
  const p = presupuestos.find((x) => x.categoria === categoria);
  if (!p || p.presupuesto === 0) return null;

  const ratio = p.gastado / p.presupuesto;
  if (ratio >= 1.0) {
    return `🚨 *Sobrepasaste el presupuesto de ${categoria}*\nLlevas $${p.gastado.toLocaleString("es-CL")} de $${p.presupuesto.toLocaleString("es-CL")} (${(ratio * 100).toFixed(0)}%)`;
  }
  if (ratio >= 0.8) {
    return `⚠️ *${categoria} al ${(ratio * 100).toFixed(0)}% del presupuesto*\n$${p.gastado.toLocaleString("es-CL")} de $${p.presupuesto.toLocaleString("es-CL")}. Quedan $${(p.presupuesto - p.gastado).toLocaleString("es-CL")}.`;
  }
  return null;
}
