"use client";
import { useState } from "react";
import { receiptInterest, receiptSupplier } from "@/lib/receipt-order-values";

type EntryProduct = {
  id: string;
  code: string;
  name: string;
  purchase_price?: string | null;
};
const money = (cents: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    cents / 100,
  );

export default function ReceiptFields({
  products,
}: {
  products: EntryProduct[];
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [modality, setModality] = useState("CASH");
  const lines = products.filter((p) => Object.hasOwn(selected, p.id));
  const subtotal = (p: EntryProduct) =>
    Number(p.purchase_price) * Number(selected[p.id]);
  const total = lines.reduce((s, p) => s + subtotal(p), 0);
  const interest = receiptInterest(total);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[id] = "1";
      else delete next[id];
      return next;
    });
  }

  return (
    <>
      <label>
        Distribuidor
        <input readOnly value={receiptSupplier} />
      </label>
      <details className="receipt-picker">
        <summary>
          Seleccionar productos{lines.length ? ` (${lines.length})` : ""}
        </summary>
        <div className="receipt-options">
          {products.length === 0 && <p>No hay productos disponibles.</p>}
          {products.map((p) => (
            <label key={p.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={Object.hasOwn(selected, p.id)}
                disabled={
                  p.purchase_price == null ||
                  (lines.length >= 50 && !Object.hasOwn(selected, p.id))
                }
                onChange={(e) => toggle(p.id, e.target.checked)}
              />
              <span>
                {p.code} · {p.name}
                {p.purchase_price == null
                  ? " (precio de compra pendiente)"
                  : ""}
              </span>
            </label>
          ))}
        </div>
      </details>
      {lines.map((p) => (
        <div className="receipt-line" key={p.id}>
          <div>
            <strong>{p.name}</strong>
            <small className="cell-sub">
              {money(Number(p.purchase_price))} por unidad
            </small>
          </div>
          <input type="hidden" name="productId" value={p.id} />
          <label>
            Cantidad
            <input
              aria-label={`Cantidad de ${p.name}`}
              name="quantity"
              type="number"
              required
              min="1"
              max="1000000"
              step="1"
              value={selected[p.id]}
              onChange={(e) => {
                const quantity = e.target.value.replace(/^0+(?=\d)/, "");
                setSelected((prev) => ({ ...prev, [p.id]: quantity }));
              }}
            />
          </label>
          <label>
            Monto del producto
            <input readOnly value={money(subtotal(p))} />
          </label>
        </div>
      ))}
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
      <input type="hidden" name="orderCost" value={total / 100} />
      <div className="form-grid">
        <label>
          Monto total del pedido
          {modality === "CREDIT" ? " (Monto a crédito)" : ""}
          <input readOnly value={money(total)} />
        </label>
        {modality === "CREDIT" ? (
          <>
            <label>
              Interés fijo (2 %)
              <input readOnly value={money(interest)} />
            </label>
            <label>
              Monto total a crédito
              <input readOnly value={money(total + interest)} />
            </label>
          </>
        ) : (
          <label>
            Monto pagado
            <input readOnly value={money(total)} />
          </label>
        )}
      </div>
      {modality === "CREDIT" && (
        <p className="info-message">
          El interés se aplica una sola vez al total del pedido. Al guardar,
          Financiamiento mostrará el monto total a crédito como deuda pendiente.
        </p>
      )}
    </>
  );
}
