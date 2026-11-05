import { test } from "node:test";
import assert from "node:assert/strict";
import { moneySchema, numericSchema, quantitySchema } from "../lib/validation";

test("Los importes y cantidades rechazan valores vacíos y tipos que se convertían en cero o uno", () => {
  for (const value of ["", " ", null, undefined, true, false, [], [1], {}, "0x10", "NaN", "Infinity"]) {
    assert.equal(moneySchema.safeParse(value).success, false, String(value));
    assert.equal(quantitySchema.safeParse(value).success, false, String(value));
    assert.equal(numericSchema.safeParse(value).success, false, String(value));
  }
  for (const value of [0, 5, 0.5, "0", "5", "0.50", ".50", " 10.25 "]) {
    assert.equal(moneySchema.safeParse(value).success, true, String(value));
  }
  assert.equal(moneySchema.safeParse(0.001).success, false);
  assert.equal(quantitySchema.safeParse("1.5").success, false);
  assert.equal(quantitySchema.parse("05"), 5);
});
