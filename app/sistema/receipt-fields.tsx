"use client";
import { useState } from "react";
import CreditFields from "./credit-fields";

type EntryProduct = {
  id: string;
  code: string;
  name: string;
  purchase_price?: string | null;
};
export default function ReceiptFields({
  products,
}: {
  products: EntryProduct[];
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const product = products.find((p) => p.id === productId);
  const purchasePrice = product?.purchase_price;
  const cost = purchasePrice == null ? null : Number(purchasePrice) * quantity;
  return (
    <>
      <label>
        Producto
        <select
          name="productId"
          required
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">Selecciona un producto</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Proveedor
        <input name="supplier" required maxLength={500} />
      </label>
      {product && purchasePrice == null && (
        <p role="alert" className="error-message">
          El administrador debe confirmar el precio unitario de compra de este
          producto antes de registrar la entrada.
        </p>
      )}
      <div className="form-grid">
        <label>
          Cantidad ingresante
          <input
            name="quantity"
            type="number"
            required
            min="1"
            max="1000000"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <label>
          Costo del pedido (S/)
          <input
            name="orderCost"
            type="number"
            readOnly
            value={cost === null ? "" : cost / 100}
            placeholder="Se calcula automáticamente"
          />
        </label>
        <CreditFields orderCost={cost} />
      </div>
      <p className="info-message">
        Costo del pedido = cantidad ingresante × precio unitario de compra. Al
        contado, el monto pagado es el costo completo; a crédito, se descuenta
        el capital financiado. Los abonos posteriores se registran en
        Financiamiento → Pagos. Registra aparte cualquier salida de caja.
      </p>
    </>
  );
}
