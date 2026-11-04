"use client";
import { useState } from "react";

const money = (v: unknown) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    Number(v ?? 0) / 100,
  );
export default function CreditFields() {
  const [modality, setModality] = useState("CASH");
  const [principal, setPrincipal] = useState(0);
  const [rate, setRate] = useState(2);
  const interest = Math.round(
    (Math.round(principal * 100) * Math.round(rate * 100)) / 10000,
  );
  return (
    <>
      <label>
        Modalidad
        <select
          name="modality"
          value={modality}
          onChange={(e) => setModality(e.target.value)}
        >
          <option value="CASH">Al contado</option>
          <option value="CREDIT">A crédito</option>
        </select>
      </label>
      {modality === "CREDIT" && (
        <>
          <label>
            Monto a crédito (S/)
            <input
              name="creditPrincipal"
              type="number"
              min="0.01"
              max="10000000"
              step="0.01"
              required
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value))}
            />
          </label>
          <label>
            Interés único (%)
            <input
              name="interestPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </label>
          <p className="info-message">
            Interés: {money(interest)} · Deuda total:{" "}
            <strong>{money(Math.round(principal * 100) + interest)}</strong>. Se
            aplica una sola vez; no se acumula con el tiempo.
          </p>
        </>
      )}
    </>
  );
}
