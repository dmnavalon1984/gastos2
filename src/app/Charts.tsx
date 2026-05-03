"use client";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const COLORS = [
  "#EF4444", "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#A855F7", "#22D3EE",
  "#6366F1", "#F43F5E", "#6B7280",
];

interface CatRow {
  categoria: string;
  monto: number;
  presupuesto: number;
}

export function Charts({ catData }: { catData: CatRow[] }) {
  const top = catData.slice(0, 8);
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">🍕 Por categoría</h2>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={top}
                dataKey="monto"
                nameKey="categoria"
                outerRadius={100}
                innerRadius={50}
                paddingAngle={2}
              >
                {top.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: 8,
                }}
                formatter={(v: number) => "$" + v.toLocaleString("es-CL")}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">📊 Gasto vs presupuesto</h2>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} margin={{ left: 0, right: 10, top: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="categoria"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickFormatter={(v) => "$" + (v / 1000).toFixed(0) + "k"}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: 8,
                }}
                formatter={(v: number) => "$" + v.toLocaleString("es-CL")}
              />
              <Bar dataKey="presupuesto" fill="#475569" />
              <Bar dataKey="monto" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
