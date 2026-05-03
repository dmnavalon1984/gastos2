/**
 * Tipos compartidos entre el bot y el dashboard.
 */

export type Tipo = "gasto" | "ingreso";

export type Banco =
  | "Banco de Chile"
  | "Edwards"
  | "Falabella"
  | "Mercado Pago"
  | "BICE"
  | "Otro";

export const CATEGORIAS = [
  "Comida fuera",
  "Supermercado",
  "Transporte",
  "Combustible",
  "Suscripciones",
  "Salud",
  "Hogar",
  "Ropa",
  "Entretenimiento",
  "Pádel",
  "Educación",
  "Regalos",
  "Imprevistos",
  "Ingreso fijo",
  "Ingreso variable",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export interface Movimiento {
  id: string;
  fecha: string; // YYYY-MM-DD
  monto_clp: number;
  tipo: Tipo;
  banco: Banco;
  comercio: string;
  categoria: Categoria;
  subcategoria?: string;
  metodo_pago?: string;
  cuotas_total?: number;
  cuotas_pagadas?: number;
  raw_text: string;
  notas?: string;
  fuente: "telegram" | "cartola" | "manual";
  fecha_registro: string; // ISO
  conciliado_cartola: "si" | "no";
  ai_confianza: number; // 0..1
}

export interface ExtractedExpense {
  monto_clp: number;
  comercio: string;
  fecha: string; // YYYY-MM-DD
  banco: Banco;
  metodo_pago?: string;
  cuotas_total?: number;
  tipo: Tipo;
  categoria_sugerida: Categoria;
  confianza: number;
  razonamiento: string;
}
