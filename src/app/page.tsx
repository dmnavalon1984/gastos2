import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listMovimientosMes, getPresupuestosMes } from "@/lib/sheets";
import { Charts } from "./Charts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(n: number) {
  return "$" + n.toLocaleString("es-CL");
}

export default async function HomePage() {
  const session = getSession();
  if (!session) redirect("/login");

  const yyyymm = new Date().toISOString().slice(0, 7);
  const [movs, presupuestos] = await Promise.all([
    listMovimientosMes(yyyymm),
    getPresupuestosMes(yyyymm),
  ]);

  const gastos = movs.filter((m) => m.tipo === "gasto");
  const ingresos = movs.filter((m) => m.tipo === "ingreso");
  const totalGastado = gastos.reduce((a, b) => a + b.monto_clp, 0);
  const totalIngreso = ingresos.reduce((a, b) => a + b.monto_clp, 0);
  const balance = totalIngreso - totalGastado;
  const presupuestoTotal = presupuestos.reduce((a, b) => a + b.presupuesto, 0);
  const pctPresupuesto = presupuestoTotal ? totalGastado / presupuestoTotal : 0;

  // por categoría
  const porCat = new Map<string, number>();
  for (const g of gastos)
    porCat.set(g.categoria, (porCat.get(g.categoria) || 0) + g.monto_clp);
  const catData = [...porCat.entries()]
    .map(([categoria, monto]) => ({
      categoria,
      monto,
      presupuesto: presupuestos.find((p) => p.categoria === categoria)?.presupuesto || 0,
    }))
    .sort((a, b) => b.monto - a.monto);

  // últimos movimientos
  const ultimos = [...movs]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, 12);

  return (
    <main className="max-w-6xl mx-auto p-6">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">📊 Control de Gastos</h1>
          <p className="text-slate-400 mt-1">
            {yyyymm} · {session.email}
          </p>
        </div>
        <a
          href="/api/auth/logout"
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          Salir
        </a>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="metric-label">Gastado este mes</div>
          <div className="metric-value">{fmt(totalGastado)}</div>
        </div>
        <div className="card">
          <div className="metric-label">Ingresos</div>
          <div className="metric-value text-emerald-400">{fmt(totalIngreso)}</div>
        </div>
        <div className="card">
          <div className="metric-label">Balance</div>
          <div className={`metric-value ${balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {fmt(balance)}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Presupuesto usado</div>
          <div className="metric-value">{(pctPresupuesto * 100).toFixed(0)}%</div>
          <div className="text-xs text-slate-500 mt-1">
            {fmt(totalGastado)} / {fmt(presupuestoTotal)}
          </div>
        </div>
      </section>

      <Charts catData={catData} />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">🎯 Presupuestos</h2>
          <div className="space-y-3">
            {presupuestos
              .filter((p) => p.presupuesto > 0)
              .map((p) => {
                const pct = Math.min(1.5, p.gastado / p.presupuesto);
                const color =
                  pct >= 1
                    ? "bg-rose-500"
                    : pct >= 0.8
                      ? "bg-amber-500"
                      : "bg-emerald-500";
                return (
                  <div key={p.categoria}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{p.categoria}</span>
                      <span className="text-slate-400">
                        {fmt(p.gastado)} / {fmt(p.presupuesto)}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded overflow-hidden">
                      <div
                        className={`h-full ${color} transition-all`}
                        style={{ width: `${Math.min(100, pct * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">🕐 Últimos movimientos</h2>
          <div className="space-y-2 text-sm">
            {ultimos.map((m) => (
              <div
                key={m.id}
                className="flex justify-between items-center py-1.5 border-b border-slate-800/60 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{m.comercio}</div>
                  <div className="text-xs text-slate-500">
                    {m.fecha} · {m.categoria}
                  </div>
                </div>
                <div
                  className={`text-right whitespace-nowrap ${m.tipo === "ingreso" ? "text-emerald-400" : ""}`}
                >
                  {m.tipo === "ingreso" ? "+" : ""}
                  {fmt(m.monto_clp)}
                </div>
              </div>
            ))}
            {ultimos.length === 0 && (
              <p className="text-slate-500 italic">Aún no hay movimientos este mes.</p>
            )}
          </div>
        </div>
      </section>

      <p className="text-xs text-slate-500 text-center">
        Datos en vivo desde Google Sheets · Bot: Telegram · IA: Claude Haiku
      </p>
    </main>
  );
}
