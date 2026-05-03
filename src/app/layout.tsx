import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Control de Gastos",
  description: "Mi dashboard personal de gastos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-slate-950 text-slate-100 min-h-screen">{children}</body>
    </html>
  );
}
