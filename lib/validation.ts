import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "Fecha inválida");
export const numericSchema = z.union([
  z.number(),
  z.string().trim().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/, "Escribe un número válido"),
]).transform(value => Number(value)).pipe(z.number().finite());
export const moneySchema = numericSchema.pipe(z.number()
  .min(0)
  .max(10000000)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
    "Usa como máximo dos decimales",
  ));
export const positiveMoney = moneySchema.refine(
  (v) => v > 0,
  "El monto debe ser mayor a cero",
);
export const quantitySchema = numericSchema.pipe(z.number().int().min(1).max(1000000));
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]+@triunfoensidergroup$/,
    "Usa usuario@triunfoensidergroup",
  );
export const passwordSchema = z
  .string()
  .min(12, "Usa al menos 12 caracteres")
  .max(128);
export const cents = (v: number) => Math.round(v * 100);
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function periodRange(date: string, period: string) {
  dateSchema.parse(date);
  const d = new Date(date + "T12:00:00Z");
  let start = date,
    end = date;
  if (period === "week") {
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    start = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 6);
    end = d.toISOString().slice(0, 10);
  }
  if (period === "month") {
    start = date.slice(0, 7) + "-01";
    end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))
      .toISOString()
      .slice(0, 10);
  }
  return { start, end };
}
