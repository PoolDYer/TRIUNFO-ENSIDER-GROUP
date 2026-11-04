import type { DB } from "./db";

// Basis points and integer cents: a single charge, never compounded.
export function financingInterest(principal: number, rateBps: number) {
  return Math.round((principal * rateBps) / 10000);
}
