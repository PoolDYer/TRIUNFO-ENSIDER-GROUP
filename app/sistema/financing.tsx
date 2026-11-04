"use client";
import { useState } from "react";

const money = (v: unknown) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    Number(v ?? 0) / 100,
  );
const dateLabel = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("es-PE");


function Ledger({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default function Financing({
  data,
  date,
  onSaved,
}: {
  data: any;
  date: string;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState("credits");
  const [receiptId, setReceiptId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const selected = data.payable.find((r: any) => r.id === receiptId);
  const totals = data.credits.reduce(
    (t: any, r: any) => ({
      total: t.total + Number(r.total),
      paid: t.paid + Number(r.paid),
    }),
    { total: 0, paid: 0 },
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "financingPayment",
          data: {
            id: requestId,
            date: form.get("date"),
            receiptId,
            amount: Number(amount),
            detail: form.get("detail"),
          },
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setAmount("");
      setReceiptId("");
      setRequestId(crypto.randomUUID());
      setNotice("Pago registrado.");
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo registrar el pago.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="period-caption">
        Historial completo de créditos y pagos, sin filtros de fecha.
      </p>
      <div className="financing-stats">
        <article className="stat">
          <div className="stat-label">Deuda total registrada</div>
          <strong>{money(totals.total)}</strong>
        </article>
        <article className="stat">
          <div className="stat-label">Monto pagado acumulado</div>
          <strong>{money(totals.paid)}</strong>
          <small>Todos los pagos registrados</small>
        </article>
        <article className="stat">
          <div className="stat-label">Saldo pendiente total</div>
          <strong>{money(totals.total - totals.paid)}</strong>
        </article>
        <article className="stat">
          <div className="stat-label">Total de abonos registrados</div>
          <strong>
            {money(
              data.payments.reduce(
                (s: number, r: any) => s + Number(r.amount),
                0,
              ),
            )}
          </strong>
          <small>Según la fecha de cada pago</small>
        </article>
      </div>
      <div className="segmented" aria-label="Sección de financiamiento">
        <button
          className={tab === "credits" ? "active" : ""}
          onClick={() => setTab("credits")}
        >
          Créditos
        </button>
        <button
          className={tab === "payments" ? "active" : ""}
          onClick={() => setTab("payments")}
        >
          Pagos
        </button>
      </div>
      {notice && (
        <p role="status" className="info-message">
          {notice}
        </p>
      )}
      {tab === "credits" ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>Todos los créditos</h2>
          </div>
          <p className="info-message">
            Las entradas guardadas con modalidad A crédito aparecen
            automáticamente aquí. El saldo incluye todos sus abonos. Las
            entradas antiguas conservan su saldo original sin añadir intereses.
          </p>
          {data.credits.length ? (
            <Ledger
              headers={[
                "Fecha",
                "Proveedor / producto",
                "Monto a crédito",
                "Interés único",
                "Deuda total",
                "Monto pagado",
                "Saldo restante",
              ]}
            >
              {data.credits.map((r: any) => (
                <tr key={r.id}>
                  <td>{dateLabel(r.date)}</td>
                  <td>
                    {r.supplier}
                    <small className="cell-sub">
                      {r.code} · {r.name}
                    </small>
                  </td>
                  <td>{money(r.credit_principal)}</td>
                  <td>
                    {Number(r.interest_bps) / 100} % ·{" "}
                    {money(Number(r.total) - Number(r.credit_principal))}
                  </td>
                  <td>{money(r.total)}</td>
                  <td>{money(r.paid)}</td>
                  <td>{money(Number(r.total) - Number(r.paid))}</td>
                </tr>
              ))}
            </Ledger>
          ) : (
            <div className="empty">Todavía no hay créditos registrados.</div>
          )}
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Registrar pago</h2>
            </div>
            <form onSubmit={submit} className="financing-form">
              <p className="info-message">
                Selecciona un crédito y registra el abono con su fecha. Todos
                los pagos permanecen en el historial. Cualquier salida de caja
                se registra aparte en Gastos y caja.
              </p>
              <div className="form-grid">
                <label>
                  Crédito a pagar
                  <select
                    required
                    value={receiptId}
                    onChange={(e) => {
                      setReceiptId(e.target.value);
                      setRequestId(crypto.randomUUID());
                    }}
                  >
                    <option value="">Selecciona un crédito pendiente</option>
                    {data.payable.map((r: any) => (
                      <option value={r.id} key={r.id}>
                        {dateLabel(r.date)} · {r.supplier} · {r.name} ·{" "}
                        {money(Number(r.total) - Number(r.paid))}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fecha del pago
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={date}
                    min={selected?.date}
                  />
                </label>
                <label>
                  Monto pagado (S/)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={
                      selected
                        ? (Number(selected.total) - Number(selected.paid)) / 100
                        : 10000000
                    }
                    required
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value.replace(/^0+(?=\d)/, ""));
                      setRequestId(crypto.randomUUID());
                    }}
                  />
                </label>
                <label>
                  Detalle / referencia
                  <input name="detail" maxLength={500} />
                </label>
              </div>
              {selected && (
                <p>
                  Deuda total: {money(selected.total)} · Pagado:{" "}
                  {money(selected.paid)} · Saldo:{" "}
                  {money(Number(selected.total) - Number(selected.paid))}
                </p>
              )}
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={busy || !selected}>
                {busy ? "Guardando…" : "Registrar pago"}
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Historial de pagos</h2>
            </div>
            <p className="info-message">
              Todos los pagos con sus fechas. Cada fila muestra la deuda
              asociada, el total abonado y el saldo actual.
            </p>
            {data.payments.length ? (
              <Ledger
                headers={[
                  "Fecha del pago",
                  "Fecha del crédito",
                  "Proveedor / producto",
                  "Deuda total",
                  "Este pago",
                  "Pagado acumulado",
                  "Saldo actual",
                  "Referencia",
                  "Registrado por",
                ]}
              >
                {data.payments.map((p: any) => (
                  <tr key={p.id}>
                    <td>{dateLabel(p.date)}</td>
                    <td>{dateLabel(p.credit_date)}</td>
                    <td>
                      {p.supplier}
                      <small className="cell-sub">{p.name}</small>
                    </td>
                    <td>{money(p.debt_total)}</td>
                    <td>{money(p.amount)}</td>
                    <td>{money(p.paid_total)}</td>
                    <td>
                      {money(Number(p.debt_total) - Number(p.paid_total))}
                    </td>
                    <td>{p.detail || "—"}</td>
                    <td>{p.user_name}</td>
                  </tr>
                ))}
              </Ledger>
            ) : (
              <div className="empty">Todavía no hay pagos registrados.</div>
            )}
          </section>
        </>
      )}
    </>
  );
}
