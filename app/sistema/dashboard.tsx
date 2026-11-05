"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  PackagePlus,
  Receipt,
  Landmark,
  ChartNoAxesCombined,
  Boxes,
  Users,
  History,
  LogOut,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  X,
  Menu,
  ShieldCheck,
  KeyRound,
  Printer,
  ChevronRight,
  RefreshCw,
  Wallet,
  Package,
  AlertCircle,
} from "lucide-react";
import type { User } from "@/lib/auth";
import { roleLabels, canAccessSection } from "@/lib/roles";
import GoogleSheetsExport from "./google-sheets-export";
import Financing from "./financing";
import ReceiptFields from "./receipt-fields";
import FinancialGroups from "./financial-groups";
import ExpenseDashboard from "./expense-dashboard";
import ProfitDashboard from "./profit-dashboard";
import SaleLosses from "./sale-losses";
import StockNotifications from "./stock-notifications";
import MonthPicker from "./month-picker";
const numericText = (value: string) => value.replace(/^0+(?=\d)/, "");
const money = (v: unknown) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    Number(v ?? 0) / 100,
  );
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dateLabel = (v: string) =>
  new Date(v.slice(0, 10) + "T12:00:00").toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const nav = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "sales", label: "Ventas del día", icon: ShoppingBag },
  { id: "receipts", label: "Control de entrada", icon: PackagePlus, admin: true },
  { id: "expenses", label: "Gastos y caja", icon: Receipt },
  { id: "profits", label: "Ganancias del día", icon: ChartNoAxesCombined, admin: true },
  { id: "financing", label: "Financiamiento", icon: Wallet, admin: true },
  { id: "bank", label: "Cuenta corriente", icon: Landmark },
  { id: "reports", label: "Reportes", icon: ChartNoAxesCombined },
  { id: "products", label: "Lista de productos", icon: Boxes, admin: true },
  { id: "users", label: "Usuarios", icon: Users, admin: true },
  { id: "audit", label: "Trazabilidad", icon: History, admin: true },
];
const kindLabel: Record<string, string> = {
  OPERATING: "Operativo",
  FIXED: "Fijo",
  DEBT: "Deuda",
  DEPOSIT: "Depositado",
  DELIVERY: "Entregado",
  INCOME: "Ingreso",
  WITHDRAWAL: "Retiro",
  CASH: "Al contado",
  CREDIT: "Al crédito",
  YAPE: "Yape",
  TRANSFER: "Transferencia",
  NONE: "Efectivo",
};
const actionLabel: Record<string, string> = {
  sale: "Venta registrada",
  saleDelete: "Venta eliminada",
  receipt: "Entrada registrada",
  receiptOrder: "Pedido de entrada registrado",
  financingPayment: "Pago de financiamiento registrado",
  receiptDelete: "Entrada eliminada",
  expense: "Gasto registrado",
  expenseDelete: "Gasto eliminado",
  treasury: "Movimiento de caja",
  treasuryDelete: "Movimiento de caja eliminado",
  bank: "Cuenta corriente",
  bankDelete: "Movimiento bancario eliminado",
  opening: "Apertura de caja",
  openingDelete: "Apertura de caja eliminada",
  product: "Producto guardado",
  productStatus: "Estado de producto",
  productDelete: "Producto eliminado",
  user: "Usuario creado",
  userStatus: "Estado de usuario",
  userDelete: "Usuario eliminado",
  resetPassword: "Contraseña restablecida",
  password: "Cambio de contraseña",
  resetAllData: "Reinicio total de datos",
  googleConnect: "Conexión con Google Sheets",
  googleExport: "Reporte generado en Google Sheets",
};
type Product = {
  id: string;
  code: string;
  name: string;
  stock: number;
  sale_price: string;
  purchase_price: string | null;
  active?: boolean;
  min_stock: number;
};
type Modal = { type: string; record?: any } | null;
function Stat({
  label,
  value,
  icon: Icon,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  icon: any;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={"stat " + (accent ? "accent" : "")}>
      <div className="stat-label">
        {label}
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Empty({
  text = "No hay registros en este período.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Package size={28} />
      <p>{text}</p>
    </div>
  );
}
function Table({
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
function Field({
  label,
  name,
  type = "text",
  value,
  required = true,
  step,
  min,
  max,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  value?: any;
  required?: boolean;
  step?: string;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={type === "number" && Number(value) === 0 ? "" : value}
        required={required && !(type === "number" && min === "0" && Number(value) === 0)}
        onChange={type === "number" ? (e) => {
          const clean = numericText(e.currentTarget.value);
          if (clean !== e.currentTarget.value) e.currentTarget.value = clean;
        } : undefined}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
      />
    </label>
  );
}
function MoneyField({
  label,
  name,
  value = 0,
  required = true,
}: {
  label: string;
  name: string;
  value?: number;
  required?: boolean;
}) {
  return (
    <Field
      label={label}
      name={name}
      type="number"
      min="0"
      step="0.01"
      max="10000000"
      value={value}
      required={required}
    />
  );
}
export default function Dashboard({ user }: { user: User }) {
  const router = useRouter();
  const [view, setView] = useState("overview"),
    [date, setDate] = useState(day),
    [period, setPeriod] = useState("day"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [modal, setModal] = useState<Modal>(null),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [mobile, setMobile] = useState(false);
  const admin = user.role === "ADMIN";
  const title = nav.find((n) => n.id === view)?.label ?? "Resumen";
  const isSpecial = ["products", "users", "audit"].includes(view);
  useEffect(() => {
    if (user.must_change_password) {
      setModal({ type: "password" });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    fetch(view === "financing" ? "/api/data?view=financing" : `/api/data?view=${view}&date=${date}&period=${period}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (controller.signal.aborted) return;
        if (!r.ok) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [view, date, period, refresh, user.must_change_password]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;
    if (result === "connected")
      setNotice(
        "Google Sheets conectado. Ya puedes generar enlaces a tus reportes.",
      );
    else
      setError(
        result === "denied"
          ? "No se autorizó la conexión con Google."
          : result === "expired"
            ? "La solicitud para conectar Google venció. Inicia la conexión nuevamente."
            : "No se pudo conectar Google. Revisa la configuración y vuelve a intentarlo.",
      );
    params.delete("google");
    window.history.replaceState(
      null,
      "",
      "/sistema" + (params.size ? "?" + params.toString() : ""),
    );
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  function navigate(v: string) {
    setMobile(false);
    if (v === view) return;
    setData(null);
    setLoading(true);
    setError("");
    setView(v);
    setSearch("");
  }
  async function quick(action: string, input: any) {
    setError("");
    try {
      const r = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: input }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRefresh((n) => n + 1);
      setNotice("Cambio guardado.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const t = data?.summary?.totals;
  const products: Product[] = data?.products ?? [];
  const filtered = products.filter((p) =>
    (p.name + " " + p.code).toLowerCase().includes(search.toLowerCase()),
  );
  const low = products.filter((p) => p.stock < p.min_stock);
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a className="sidebar-brand" href="/">
          <img src="/logo.png" alt="Triunfo Ensider" />
          <div>
            Triunfo Ensider<span>Group</span>
          </div>
        </a>
        <div className="workspace-label">
          <span className="status-dot" /> Administración comercial
        </div>
        <nav>
          {nav
            .filter((n) => (!n.admin || admin) && canAccessSection(user.role, n.id))
            .map((n) => (
              <button
                key={n.id}
                className={view === n.id ? "nav-item selected" : "nav-item"}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={19} />
                {n.label}
                {n.admin && <span className="admin-dot" />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="role-note">
            <ShieldCheck size={16} />
            {admin ? "Acceso de dueño" : "Acceso de administrador"}
          </div>
          <button
            className="profile"
            onClick={() => setModal({ type: "password" })}
          >
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <span>
              {user.name}
              <small>{user.email}</small>
            </span>
            <KeyRound size={15} />
          </button>
          <button
            className="logout"
            onClick={async () => {
              await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "logout" }),
              });
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Abrir menú"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={21} />
            </button>
            <span>Administración</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
          {admin && !user.must_change_password && <StockNotifications refresh={refresh} />}
          <span className="topbar-date">
            Hoy: {" "}
            {new Date().toLocaleDateString("es-PE", {
              timeZone: "America/Lima",
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <h1>{view === "overview" ? "Tu negocio, en números" : title}</h1>
              <p>
                {
                  (
                    {
                      overview: "Lo que entra, lo que sale y lo que queda.",
                      sales:
                        "Registra productos vendidos y sus medios de pago.",
                      receipts:
                        "Registra mercadería y mantén las existencias al día.",
                      expenses:
                        "Gastos operativos, gastos fijos y movimientos de caja.",
                      profits: "Ventas, inversión, gastos y resultado neto del período.",
                      financing: "Todos los créditos, su interés único y el historial de pagos.",
                      bank: "Ingresos diarios, retiros y acumulado semanal.",
                      reports:
                        "Consulta el inventario y el control financiero por período.",
                      products:
                        "Stock, precios, capital e inversión. Acceso restringido.",
                      users:
                        "Administra las cuentas del equipo. Máximo 10 usuarios.",
                      audit:
                        "Consulta quién registró cada operación y el historial de origen.",
                    } as Record<string, string>
                  )[view]
                }
              </p>
            </div>
            <div className="heading-actions">
              {!isSpecial && view !== "financing" && view !== "profits" && (
                <GoogleSheetsExport
                  date={date}
                  period={period}
                  admin={admin}
                  disabled={user.must_change_password || loading}
                />
              )}
              {["overview", "sales"].includes(view) && (
                <button
                  className="button orange"
                  disabled={user.must_change_password || loading}
                  onClick={() => setModal({ type: "sale" })}
                >
                  <Plus size={17} /> Registrar venta
                </button>
              )}
              {view === "receipts" && (
                <button
                  className="button orange"
                  onClick={() => setModal({ type: "receipt" })}
                >
                  <Plus size={17} /> Registrar entrada
                </button>
              )}
              {view === "expenses" && (
                <button
                  className="button orange"
                  onClick={() => setModal({ type: "expense" })}
                >
                  <Plus size={17} /> Registrar gasto
                </button>
              )}
              {view === "products" && (
                <button
                  className="button orange"
                  onClick={() => setModal({ type: "product" })}
                >
                  <Plus size={17} /> Nuevo producto
                </button>
              )}
              {view === "users" && (
                <button
                  className="button orange"
                  disabled={(data?.users?.length ?? 0) >= 10}
                  onClick={() => setModal({ type: "user" })}
                >
                  <Plus size={17} /> Crear administrador
                </button>
              )}
            </div>
          </div>
          {!isSpecial && view !== "financing" && (
            <div className="filterbar">
              <div className="segmented" aria-label="Período">
                {[
                  ["day", "Diario"],
                  ["week", "Semanal"],
                  ["month", "Mensual"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={period === v ? "active" : ""}
                    onClick={() => setPeriod(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="date-filter">
                <label htmlFor="business-date">{period === "month" ? "Mes y año de referencia" : "Fecha de referencia"}</label>
                {period === "month" ? <MonthPicker date={date} onChange={setDate} /> : (
                  <input
                    id="business-date"
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                  />
                )}
                <button
                  className="icon-button"
                  aria-label="Actualizar datos"
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="error-message">
              <AlertCircle size={18} />
              {error}
              <button
                className="text-button"
                onClick={() => setRefresh((n) => n + 1)}
              >
                Reintentar
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <ShieldCheck size={18} />
              {notice}
            </div>
          )}
          {loading && (
            <div className="loading" role="status">
              <RefreshCw className="spin" size={22} /> Cargando información…
            </div>
          )}
          {!loading && data && (
            <>
              {view === "profits" && data.profits && <ProfitDashboard data={data.profits} period={period} />}
              {view === "financing" && data.financing && <Financing data={data.financing} date={day()} onSaved={() => {setNotice("Pago de financiamiento registrado.");setRefresh(n => n + 1);}} />}
              {t && ["overview", "reports"].includes(view) && (
                <>
                  <div className="period-caption">
                    {dateLabel(data.summary.start)}
                    {data.summary.start !== data.summary.end
                      ? " al " + dateLabel(data.summary.end)
                      : ""}
                    <span>Montos expresados en soles</span>
                  </div>
                  <section className="stats">
                    <Stat
                      label="Subtotal facturación"
                      value={money(t.billing)}
                      icon={ShoppingBag}
                      note={`${t.salesCount} operaciones registradas`}
                    />
                    <Stat
                      label={
                        period === "week"
                          ? "Total de Yape semanal"
                          : "Total de Yape"
                      }
                      value={money(t.digital)}
                      icon={ArrowUpRight}
                      note="Cobros fuera de caja física"
                    />
                    <Stat
                      label="Total de gastos"
                      value={money(t.operating + t.fixed)}
                      icon={ArrowDownLeft}
                      note={`Operativos ${money(t.operating)} · Fijos ${money(t.fixed)}`}
                    />
                    <Stat
                      label="Caja neta"
                      value={money(t.netCash)}
                      icon={Wallet}
                      note="Total de caja menos gastos fijos y deudas"
                      accent
                    />
                  </section>
                </>
              )}
              {view === "overview" && (
                <>
                  <div className="dashboard-grid">
                    <section className="panel sales-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Actividad comercial</h2>
                          <p>Facturación por día del período</p>
                        </div>
                        <ChartNoAxesCombined size={20} />
                      </div>
                      {data.summary.daily.length ? (
                        <div className="bar-chart">
                          {data.summary.daily.map((d: any) => (
                            <div className="bar-column" key={d.date}>
                              <span>{money(d.total)}</span>
                              <div className="bar-track">
                                <div
                                  style={{
                                    height:
                                      Math.max(
                                        3,
                                        (Number(d.total) /
                                          Math.max(
                                            ...data.summary.daily.map(
                                              (x: any) => Number(x.total),
                                            ),
                                          )) *
                                          100,
                                      ) + "%",
                                  }}
                                />
                              </div>
                              <small>
                                {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                              </small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty text="Las ventas registradas aparecerán aquí." />
                      )}
                      <div className="panel-footer">
                        <span>Cuenta corriente del período</span>
                        <strong>{money(t.bankNet)}</strong>
                        <button
                          className="text-button"
                          onClick={() => navigate("bank")}
                        >
                          Ver detalle <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </section>
                    <section className="panel cash-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Composición de caja</h2>
                          <p>Del registro al efectivo disponible</p>
                        </div>
                      </div>
                      <div className="cash-lines">
                        <div>
                          <span>Subtotal facturación</span>
                          <strong>{money(t.billing)}</strong>
                        </div>
                        <div>
                          <span>
                            {period === "week"
                              ? "Total de Yape semanal"
                              : "Total de Yape"}
                          </span>
                          <span>− {money(t.digital)}</span>
                        </div>
                        <div>
                          <span>
                            {period === "week"
                              ? "Total de gastos operativos diarios"
                              : "Total de gastos operativos"}
                          </span>
                          <span>− {money(t.operating)}</span>
                        </div>
                        <div>
                          <span>Total de deudas</span>
                          <span>− {money(t.debt)}</span>
                        </div>
                        <div className="subtotal">
                          <span>Total de caja</span>
                          <strong>{money(t.excelCash)}</strong>
                        </div>
                        <div>
                          <span>Total de gastos fijos</span>
                          <span>− {money(t.fixed)}</span>
                        </div>
                        <div className="total">
                          <span>Caja neta</span>
                          <strong>{money(t.netCash)}</strong>
                        </div>
                      </div>
                      <p className="panel-hint">
                        {period === "day"
                          ? "La caja del ejemplo descuenta deudas."
                          : "El ejemplo semanal no descuenta deudas ni gastos fijos. La caja neta sí los contempla."}
                      </p>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Últimas ventas</h2>
                        <p>Las operaciones más recientes del período</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("sales")}
                      >
                        Ver todas <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <SalesTable
                      sales={data.sales.slice(0, 5)}
                      onDelete={(s) => setModal({ type: "saleDelete", record: s })}
                      canDelete={(s) => admin || s.user_id === user.id}
                    />
                  </section>
                  <div className="small-grid">
                    <button
                      className="quick-panel"
                      onClick={() => setModal({ type: "opening" })}
                    >
                      <Wallet size={22} />
                      <div>
                        <strong>Apertura de caja</strong>
                        <span>Registrar efectivo inicial del día</span>
                      </div>
                      <Plus size={18} />
                    </button>
                    <div className="quick-panel">
                      <Package size={22} />
                      <div>
                        <strong>{low.length} productos con stock bajo</strong>
                        <span>Umbral definido por el dueño</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {view === "sales" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Registro de ventas</h2>
                    <span className="muted">
                      {data.sales.length} registros visibles
                    </span>
                  </div>
                  <SalesTable
                    sales={data.sales}
                    onDelete={(s) => setModal({ type: "saleDelete", record: s })}
                    canDelete={(s) => admin || s.user_id === user.id}
                  />
                  <p className="panel-hint">
                    Se muestran hasta 200 ventas recientes del período. Los
                    totales y reportes incluyen todas las operaciones.
                  </p>
                </section>
              )}
              {view === "receipts" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>CONTROL DE ENTRADA</h2>
                    <span className="pill">Stock actualizado al guardar</span>
                  </div>
                  {data.receipts.length ? (
                    <Table
                      headers={[
                        "Fecha",
                        "Productos",
                        "Proveedor",
                        "Cantidad de ingresante",
                        "Costo de pedido",
                        "Modalidad",
                        "Total a crédito",
                        "Registrado por",
                        ...(admin ? ["Acciones"] : []),
                      ]}
                    >
                      {data.receipts.map((r: any) => (
                        <tr key={r.id}>
                          <td>{dateLabel(r.date)}</td>
                          <td>
                            {r.items ? r.items.map((item: { code: string; name: string; quantity: number; total: number }) => (
                              <div key={item.code}><strong>{item.name}</strong><small className="cell-sub">{item.code} · {item.quantity} ud. · {money(item.total)}</small></div>
                            )) : <><strong>{r.name}</strong><small>{r.code}</small></>}
                          </td>
                          <td>{r.supplier}</td>
                          <td>{r.quantity}</td>
                          <td>{money(r.order_cost)}</td>
                          <td>{kindLabel[r.modality]}</td>
                          <td>
                            {r.modality === "CREDIT" ? money(Number(r.credit_principal) + Math.round(Number(r.credit_principal) * Number(r.interest_bps) / 10000)) : "—"}
                          </td>
                          <td>{r.user_name}</td>
                          {admin && (
                            <td>
                              <button
                                className="text-button danger-text"
                                onClick={() =>
                                  setModal({ type: "receiptDelete", record: r })
                                }
                              >
                                Eliminar
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </Table>
                  ) : (
                    <Empty text="Registra una entrada para sumar mercadería al inventario." />
                  )}
                  <p className="panel-hint">
                    Los costos del pedido registran la compra y su saldo. No se
                    descuentan automáticamente de caja; registra el pago como
                    gasto cuando corresponda. Hasta 200 entradas recientes.
                  </p>
                </section>
              )}
              {view === "expenses" && (
                <>
                  {data.expenseDashboard && <ExpenseDashboard data={data.expenseDashboard} period={period} />}
                  <div className="small-grid">
                    <button
                      className="quick-panel"
                      onClick={() => setModal({ type: "opening" })}
                    >
                      <Wallet size={22} />
                      <div>
                        <strong>Apertura de caja</strong>
                        <span>Monto inicial en físico</span>
                      </div>
                      <Plus size={18} />
                    </button>
                    <button
                      className="quick-panel"
                      onClick={() => setModal({ type: "treasury" })}
                    >
                      <ArrowUpRight size={22} />
                      <div>
                        <strong>Deudas, depósitos y entregas</strong>
                        <span>Registrar salida de efectivo</span>
                      </div>
                      <Plus size={18} />
                    </button>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Gastos registrados</h2>
                    </div>
                    {data.expenses.length ? (
                      <Table
                        headers={[
                          "Fecha",
                          "Detalle",
                          "Tipo",
                          "Monto",
                          "Registrado por",
                          ...(admin ? ["Acciones"] : []),
                        ]}
                      >
                        {data.expenses.map((r: any) => (
                          <tr key={r.id}>
                            <td>{dateLabel(r.date)}</td>
                            <td>{r.detail}</td>
                            <td>
                              <span className="badge">{kindLabel[r.kind]}</span>
                            </td>
                            <td>{money(r.amount)}</td>
                            <td>{r.user_name}</td>
                            {admin && (
                              <td>
                                <button
                                  className="text-button danger-text"
                                  onClick={() =>
                                    setModal({
                                      type: "expenseDelete",
                                      record: r,
                                    })
                                  }
                                >
                                  Eliminar
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty />
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Movimientos de caja</h2>
                      <span className="muted">
                        Aperturas del período: {money(t.opening)}
                        {admin && Number(t.opening) > 0 && (
                          <button
                            className="text-button danger-text"
                            style={{ marginLeft: "0.5rem" }}
                            onClick={() =>
                              setModal({
                                type: "openingDelete",
                                record: { date, amount: t.opening },
                              })
                            }
                          >
                            Anular apertura
                          </button>
                        )}
                      </span>
                    </div>
                    {data.treasury.length ? (
                      <Table
                        headers={[
                          "Fecha",
                          "Detalle",
                          "Tipo",
                          "Monto",
                          "Registrado por",
                          ...(admin ? ["Acciones"] : []),
                        ]}
                      >
                        {data.treasury.map((r: any) => (
                          <tr key={r.id}>
                            <td>{dateLabel(r.date)}</td>
                            <td>{r.detail}</td>
                            <td>{kindLabel[r.kind]}</td>
                            <td>{money(r.amount)}</td>
                            <td>{r.user_name}</td>
                            {admin && (
                              <td>
                                <button
                                  className="text-button danger-text"
                                  onClick={() =>
                                    setModal({
                                      type: "treasuryDelete",
                                      record: r,
                                    })
                                  }
                                >
                                  Eliminar
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty />
                    )}
                    <div className="panel-footer">
                      <span>
                        Disponible calculado: aperturas + caja neta − depositado
                        − entregado
                      </span>
                      <strong>{money(t.available)}</strong>
                    </div>
                    <p className="panel-hint">
                      Las deudas de ventas ya se descuentan. No vuelvas a
                      registrarlas como movimiento de deuda. Cada tabla muestra
                      hasta 200 registros recientes.
                    </p>
                  </section>
                </>
              )}
              {view === "bank" && (
                <>
                  <section className="stats three">
                    <Stat
                      label="Monto cuenta corriente"
                      value={money(t.bankIncome)}
                      icon={ArrowDownLeft}
                      note="Ingresados por el dueño"
                    />
                    <Stat
                      label="Monto de retiro / disposición"
                      value={money(t.bankWithdrawals)}
                      icon={ArrowUpRight}
                      note="Registrados con su motivo"
                    />
                    <Stat
                      label="TOTAL ACUMULADO"
                      value={money(t.bankAccumulated)}
                      icon={Landmark}
                      note="Hasta la fecha final del período"
                      accent
                    />
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Cuenta corriente</h2>
                        <p>
                          Los retiros se registran aparte; se descuentan al
                          consolidar.
                        </p>
                      </div>
                      <div className="heading-actions">
                        {admin && (
                          <button
                            className="button orange"
                            onClick={() =>
                              setModal({
                                type: "bank",
                                record: { kind: "INCOME" },
                              })
                            }
                          >
                            <Plus size={16} /> Ingreso
                          </button>
                        )}
                        <button
                          className="button secondary"
                          onClick={() =>
                            setModal({
                              type: "bank",
                              record: { kind: "WITHDRAWAL" },
                            })
                          }
                        >
                          Registrar retiro
                        </button>
                      </div>
                    </div>
                    {data.bank.length ? (
                      <Table
                        headers={[
                          "Fecha",
                          "Detalle",
                          "Movimiento",
                          "Monto",
                          "Registrado por",
                          ...(admin ? ["Acciones"] : []),
                        ]}
                      >
                        {data.bank.map((r: any) => (
                          <tr key={r.id}>
                            <td>{dateLabel(r.date)}</td>
                            <td>{r.detail}</td>
                            <td>
                              <span
                                className={
                                  "badge " +
                                  (r.kind === "INCOME" ? "green" : "")
                                }
                              >
                                {kindLabel[r.kind]}
                              </span>
                            </td>
                            <td>{money(r.amount)}</td>
                            <td>{r.user_name}</td>
                            {admin && (
                              <td>
                                <button
                                  className="text-button danger-text"
                                  onClick={() =>
                                    setModal({ type: "bankDelete", record: r })
                                  }
                                >
                                  Eliminar
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty />
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Consolidado semanal</h2>
                      <span className="muted">
                        Lunes a domingo · hasta 52 semanas
                      </span>
                    </div>
                    {data.bankWeeks.length ? (
                      <Table
                        headers={[
                          "Semana desde",
                          "Subtotal cuenta corriente",
                          "Subtotal (retiro/disposición)",
                          "TOTAL SEMANAL",
                          "TOTAL ACUMULADO",
                        ]}
                      >
                        {data.bankWeeks.map((r: any) => (
                          <tr key={r.week}>
                            <td>{dateLabel(r.week)}</td>
                            <td>{money(r.income)}</td>
                            <td>{money(r.withdrawals)}</td>
                            <td>
                              <strong>
                                {money(
                                  Number(r.income) - Number(r.withdrawals),
                                )}
                              </strong>
                            </td>
                            <td>{money(r.accumulated)}</td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty />
                    )}
                    <p className="panel-hint">
                      El acumulado suma los totales semanales desde el inicio.
                      Los cobros digitales de ventas no se duplican como
                      ingresos automáticos de cuenta corriente.
                    </p>
                  </section>
                </>
              )}
              {view === "reports" && (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Control de salida y facturación</h2>
                        <p>
                          Los precios históricos se conservan por venta. El
                          stock mostrado es el actual.
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => window.print()}
                      >
                        <Printer size={16} /> Imprimir
                      </button>
                    </div>
                    {data.summary.items.length ? (
                      <Table
                        headers={[
                          "Código",
                          "Detalle de productos",
                          "Stock",
                          period === "week"
                            ? "Total de productos vendidos semanalmente"
                            : "Productos vendidos",
                          "Precio unitario",
                          period === "week"
                            ? "Facturación semanal"
                            : "Facturación",
                        ]}
                      >
                        {data.summary.items.map((r: any) => (
                          <tr key={r.code + "-" + r.unit_price}>
                            <td>{r.code}</td>
                            <td>{r.name}</td>
                            <td>{r.stock}</td>
                            <td>{r.quantity}</td>
                            <td>{money(r.unit_price)}</td>
                            <td>
                              <strong>{money(r.total)}</strong>
                            </td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty />
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        {period === "week"
                          ? "CONTROL FINANCIERO SEMANAL"
                          : "Control financiero"}
                      </h2>
                    </div>
                    <FinancialGroups totals={t} period={period} />
                    <p className="panel-hint">
                      Total de caja: subtotal facturación − total de Yape −
                      total de gastos operativos{period === "day" ? " − deudas" : ""}. Caja
                      neta: subtotal facturación − total de Yape − total de
                      gastos operativos − deudas − total de gastos fijos. En períodos de
                      varios días, las aperturas son una suma de registros
                      diarios, no un saldo bancario ni un arrastre automático.
                    </p>
                  </section>
                </>
              )}
              {view === "products" && (
                <>
                  <div className="restricted-note">
                    <ShieldCheck size={17} /> ACCESO PERSONAL (RESTRINGIDO)
                  </div>
                  <div className="product-totals">
                    <div>
                      <span>CAPITAL</span>
                      <strong>
                        {money(
                          products.reduce(
                            (s, p) => s + p.stock * Number(p.sale_price),
                            0,
                          ),
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>INVERSION</span>
                      <strong>
                        {money(
                          products.reduce(
                            (s, p) =>
                              s + p.stock * Number(p.purchase_price ?? 0),
                            0,
                          ),
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>GANANCIA</span>
                      <strong>
                        {money(
                          products
                            .filter((p) => p.purchase_price !== null)
                            .reduce(
                              (s, p) =>
                                s +
                                p.stock *
                                  (Number(p.sale_price) -
                                    Number(p.purchase_price)),
                              0,
                            ),
                        )}
                      </strong>
                    </div>
                  </div>
                  {products.some((p) => p.purchase_price === null) && (
                    <p className="info-message">
                      Hay costos de compra pendientes (por confirmar). La inversión y la
                      ganancia son parciales hasta completarlos.
                    </p>
                  )}
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Lista de productos</h2>
                      <div className="search">
                        <Search size={16} />
                        <input
                          aria-label="Buscar producto"
                          placeholder="Buscar código o producto"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    <Table
                      headers={[
                        "CODIGO",
                        "PRODUCTOS",
                        "CANTIDAD EXISTENTE O STOCK",
                        "PRECIO UNITARIO DE VENTA",
                        "PRECIO UNITARIO DE COMPRA",
                        "CAPITAL",
                        "INVERSION",
                        "Estado",
                        "Acciones",
                      ]}
                    >
                      {filtered.map((p) => (
                        <tr key={p.id}>
                          <td>{p.code}</td>
                          <td>
                            <strong>{p.name}</strong>
                          </td>
                          <td>
                            <span
                              className={
                                "badge " +
                                (p.stock <= p.min_stock ? "warning" : "green")
                              }
                            >
                              {p.stock}
                            </span>
                          </td>
                          <td>{money(p.sale_price)}</td>
                          <td>
                            {p.purchase_price === null ? (
                              <span className="muted">Pendiente</span>
                            ) : (
                              money(p.purchase_price)
                            )}
                          </td>
                          <td>{money(p.stock * Number(p.sale_price))}</td>
                          <td>
                            {p.purchase_price === null
                              ? "—"
                              : money(p.stock * Number(p.purchase_price))}
                          </td>
                          <td>{p.active ? "Activo" : "Inactivo"}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() =>
                                setModal({ type: "product", record: p })
                              }
                            >
                              Editar
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                quick("productStatus", {
                                  id: p.id,
                                  active: !p.active,
                                })
                              }
                            >
                              {p.active ? "Desactivar" : "Activar"}
                            </button>
                            <button
                              className="text-button danger-text"
                              onClick={() =>
                                setModal({ type: "productDelete", record: p })
                              }
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </section>
                </>
              )}
              {view === "users" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Equipo de trabajo</h2>
                    <span className="pill">
                      {data.users.length} de 10 cuentas
                    </span>
                  </div>
                  <Table
                    headers={[
                      "Nombre",
                      "Correo de acceso",
                      "Rol",
                      "Estado",
                      "Acciones",
                    ]}
                  >
                    {data.users.map((r: any) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.name}</strong>
                          {r.must_change_password && (
                            <small>Cambio de contraseña pendiente</small>
                          )}
                        </td>
                        <td>{r.email}</td>
                        <td>
                          <span className="badge">
                            {roleLabels[r.role as keyof typeof roleLabels]}
                          </span>
                        </td>
                        <td>
                          <span
                            className={"badge " + (r.active ? "green" : "")}
                          >
                            {r.active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td>
                          {r.id !== user.id && (
                            <>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setModal({ type: "resetPassword", record: r })
                                }
                              >
                                Restablecer clave
                              </button>
                              <button
                                className="text-button"
                                onClick={() =>
                                  quick("userStatus", {
                                    id: r.id,
                                    active: !r.active,
                                  })
                                }
                              >
                                {r.active ? "Desactivar" : "Activar"}
                              </button>
                              {r.role === "SELLER" && (
                                <button
                                  className="text-button danger-text"
                                  onClick={() =>
                                    setModal({ type: "userDelete", record: r })
                                  }
                                >
                                  Eliminar usuario
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <p className="panel-hint">
                    Las cuentas desactivadas siguen contando dentro del máximo
                    de 10. Eliminar un administrador libera su cupo y conserva el
                    historial de sus operaciones.
                  </p>
                </section>
              )}
              {view === "audit" && (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Administración y limpieza de datos</h2>
                        <p>
                          Elimina todos los datos operativos y restablece el
                          sistema a cero conservando las cuentas de usuario.
                        </p>
                      </div>
                      <button
                        className="button danger"
                        onClick={() => setModal({ type: "resetAllData" })}
                      >
                        Eliminar todos los datos del sistema
                      </button>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Historial de operaciones</h2>
                      <span className="muted">Últimas 200 operaciones</span>
                    </div>
                    {data.audit.length ? (
                      <Table
                        headers={[
                          "Fecha y hora",
                          "Usuario",
                          "Operación",
                          "Referencia",
                        ]}
                      >
                        {data.audit.map((r: any) => (
                          <tr key={r.id}>
                            <td>
                              {new Date(r.created_at).toLocaleString("es-PE", {
                                timeZone: "America/Lima",
                              })}
                            </td>
                            <td>{r.name}</td>
                            <td>{actionLabel[r.action] ?? r.action}</td>
                            <td className="muted">{r.entity_id}</td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty />
                    )}
                  </section>
                  {data.reference.map((r: any) => (
                    <section className="panel" key={r.id}>
                      <div className="panel-heading">
                        <h2>Historial del archivo de origen</h2>
                        <span className="pill">Solo referencia</span>
                      </div>
                      <p className="panel-hint">{r.data.note}</p>
                      <Table
                        headers={[
                          "Producto",
                          "Entrada histórica",
                          "Fecha de entrada",
                          "Venta sin fecha",
                          "Facturación histórica",
                        ]}
                      >
                        {r.data.incoming.map((i: any) => (
                          <tr key={i.code}>
                            <td>
                              {i.code} · {i.name}
                            </td>
                            <td>{i.quantity}</td>
                            <td>{dateLabel(i.date)}</td>
                            <td>
                              {r.data.sales.find((s: any) => s.code === i.code)
                                ?.quantity ?? 0}
                            </td>
                            <td>
                              {money(
                                (r.data.sales.find(
                                  (s: any) => s.code === i.code,
                                )?.billing ?? 0) * 100,
                              )}
                            </td>
                          </tr>
                        ))}
                      </Table>
                    </section>
                  ))}
                </>
              )}
            </>
          )}
          <footer className="app-footer">
            <span>Triunfo Ensider Group</span>
            <span>Administración e inventario · RUC 10733781543</span>
          </footer>
        </main>
      </div>
      {modal && (
        <OperationModal
          modal={modal}
          products={products}
          date={date}
          forced={user.must_change_password}
          onClose={() => setModal(null)}
          onSuccess={(type) => {
            if (type === "password") {
              router.push("/login");
              router.refresh();
              return;
            }
            setModal(null);
            setRefresh((n) => n + 1);
            const isDel = [
              "userDelete",
              "saleDelete",
              "receiptDelete",
              "expenseDelete",
              "treasuryDelete",
              "bankDelete",
              "openingDelete",
              "productDelete",
              "resetAllData",
            ].includes(type);
            setNotice(
              type === "userDelete"
                ? "Usuario eliminado correctamente."
                : type === "resetAllData"
                  ? "Todos los datos del sistema han sido eliminados correctamente."
                  : isDel
                    ? "Registro eliminado correctamente."
                    : "Registro guardado correctamente.",
            );
          }}
        />
      )}
    </div>
  );
}
function SalesTable({
  sales,
  onDelete,
  canDelete,
}: {
  sales: any[];
  onDelete?: (s: any) => void;
  canDelete?: (s: any) => boolean;
}) {
  const showActions = !!onDelete;
  return sales.length ? (
    <Table
      headers={[
        "Fecha",
        "Productos vendidos",
        "Subtotal facturación",
        "Total de Yape",
        "Deuda / pérdida de productos",
        "Efectivo",
        "Código de operación",
        "Registrado por",
        ...(showActions ? ["Acciones"] : []),
      ]}
    >
      {sales.map((s) => (
        <tr key={s.id}>
          <td>
            {dateLabel(s.date)}
            <small>
              {new Date(s.created_at).toLocaleTimeString("es-PE", {
                timeZone: "America/Lima",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          </td>
          <td>
            {s.items?.map((i: any) => (
              <div key={i.name}>
                {i.quantity} × {i.name}
                <small>{money(i.unit_price)} c/u</small>
              </div>
            ))}
            {s.detail && <small>{s.detail}</small>}
          </td>
          <td>
            <strong>{money(s.total)}</strong>
          </td>
          <td>
            {money(s.digital)}
            {Number(s.digital) > 0 && <small>{kindLabel[s.method]}</small>}
          </td>
          <td>{money(Number(s.debt) + Number(s.loss_amount ?? 0))}{Number(s.debt)>0 && <small>Deuda histórica: {money(s.debt)}</small>}{s.losses?.map((loss:any)=><small key={loss.product_id}>{loss.quantity} × {loss.name} perdidos · {money(Number(loss.quantity)*Number(loss.unit_price))}</small>)}</td>
          <td>{money(s.cash)}</td>
          <td>{s.reference || "—"}</td>
          <td>{s.user_name}</td>
          {showActions && (
            <td>
              {canDelete?.(s) !== false && (
                <button
                  className="text-button danger-text"
                  onClick={() => onDelete(s)}
                >
                  Eliminar
                </button>
              )}
            </td>
          )}
        </tr>
      ))}
    </Table>
  ) : (
    <Empty text="Todavía no hay ventas registradas en este período." />
  );
}
function OperationModal({
  modal,
  products,
  date,
  forced,
  onClose,
  onSuccess,
}: {
  modal: NonNullable<Modal>;
  products: Product[];
  date: string;
  forced: boolean;
  onClose: () => void;
  onSuccess: (type: string) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const { type, record: r } = modal;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [id] = useState(() => crypto.randomUUID());
  const [items, setItems] = useState([
    { productId: "", quantity: "1", unitPrice: "" },
  ]);
  const [digital, setDigital] = useState("");
  const titles: Record<string, string> = {
    sale: "Registrar venta",
    saleDelete: "Eliminar venta",
    receipt: "Registrar entrada",
    receiptDelete: "Eliminar entrada de inventario",
    expense: "Registrar gasto",
    expenseDelete: "Eliminar gasto",
    treasury: "Registrar movimiento de caja",
    treasuryDelete: "Eliminar movimiento de caja",
    opening: "Apertura de caja",
    openingDelete: "Eliminar apertura de caja",
    bank:
      r?.kind === "INCOME"
        ? "Ingreso de cuenta corriente"
        : "Retiro de cuenta corriente",
    bankDelete: "Eliminar movimiento de cuenta corriente",
    product: r ? "Editar producto" : "Nuevo producto",
    productDelete: "Eliminar producto",
    user: "Crear administrador",
    resetPassword: "Restablecer contraseña",
    userDelete: "Eliminar usuario",
    resetAllData: "Eliminar todos los datos del sistema",
    password: forced ? "Configura tu contraseña" : "Cambiar contraseña",
  };
  const isDelete = [
    "userDelete",
    "saleDelete",
    "receiptDelete",
    "expenseDelete",
    "treasuryDelete",
    "bankDelete",
    "openingDelete",
    "productDelete",
    "resetAllData",
  ].includes(type);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !forced && !busy) onClose();
    };
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", close);
    };
  }, [forced, busy, onClose]);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const el = dialogRef.current;
    if (!el) return;
    const focusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]",
        ),
      ).filter((n) => n.offsetParent !== null);
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    el.addEventListener("keydown", trap);
    return () => {
      el.removeEventListener("keydown", trap);
      prior?.focus();
    };
  }, []);
  const total = items.reduce(
    (s, i) => s + Math.round(Number(i.unitPrice) * 100) * Number(i.quantity),
    0,
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const val = (n: string) => String(f.get(n) ?? "");
    const num = (n: string) => Number(val(n));
    let body: any = { id, date: val("date") };
    if (type === "sale")
      body = {
        ...body,
        items: items.map(i => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
        digital: Number(digital),
        debt: 0,
        losses: f.getAll("lossProductId").map((productId,i)=>({productId,quantity:Number(f.getAll("lossQuantity")[i])})),
        method: val("method"),
        reference: val("reference"),
        detail: [val("detail"),val("lossReason")].filter(Boolean).join(" · "),
      };
    if (type === "receipt")
      body = {
        ...body,
        items: f.getAll("productId").map((productId,i) => ({ productId, quantity: Number(f.getAll("quantity")[i]) })),
        expectedOrderCost: num("orderCost"),
        modality: val("modality"),
      };
    if (["expense", "treasury", "bank"].includes(type))
      body = {
        ...body,
        kind: type === "bank" ? r.kind : val("kind"),
        detail: val("detail"),
        amount: num("amount"),
      };
    if (type === "opening") body = { date: val("date"), amount: num("amount") };
    if (type === "product")
      body = {
        id: r?.id ?? id,
        code: val("code"),
        name: val("name"),
        salePrice: num("salePrice"),
        purchasePrice: num("purchasePrice"),
        minStock: num("minStock"),
        ...(!r ? { stock: num("stock") } : {}),
      };
    if (type === "user")
      body = {
        name: val("name"),
        email: `${val("username").trim().toLowerCase()}@triunfoensidergroup`,
        password: val("password"),
      };
    if (type === "resetPassword")
      body = { id: r.id, password: val("password") };
    if (type === "userDelete") body = { id: r.id };
    if (type === "saleDelete") body = { id: r.id };
    if (type === "receiptDelete") body = { id: r.id };
    if (type === "expenseDelete") body = { id: r.id };
    if (type === "treasuryDelete") body = { id: r.id };
    if (type === "bankDelete") body = { id: r.id };
    if (type === "openingDelete") body = { date: r.date };
    if (type === "productDelete") body = { id: r.id };
    if (type === "resetAllData") body = { confirm: true };
    try {
      const auth = type === "password";
      const resp = await fetch(auth ? "/api/auth" : "/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          auth
            ? {
                action: "password",
                current: val("current"),
                password: val("password"),
              }
            : { action: type === "receipt" ? "receiptOrder" : type, data: body },
        ),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      onSuccess(type);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !forced && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={"modal " + (["sale","receipt"].includes(type) ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{titles[type]}</h2>
            <p>
              {isDelete
                ? type === "userDelete"
                  ? "Confirma la cuenta que deseas eliminar."
                  : type === "resetAllData"
                    ? "Esta acción restablecerá el sistema a cero."
                    : "Confirma la eliminación de este registro."
                : type === "password"
                  ? "Usa al menos 12 caracteres. Al guardar, iniciarás sesión nuevamente."
                  : "Revisa los datos antes de guardar el registro."}
            </p>
          </div>
          {!forced && (
            <button
              disabled={busy}
              className="icon-button"
              aria-label="Cerrar formulario"
              onClick={onClose}
            >
              <X size={22} />
            </button>
          )}
        </header>
        <form onSubmit={submit}>
          <div className="modal-body">
            {!isDelete &&
              ![
                "product",
                "user",
                "resetPassword",
                "password",
              ].includes(type) && (
                <Field
                  label="Fecha de operación"
                  name="date"
                  type="date"
                  value={date}
                />
              )}
            {type === "sale" && (
              <>
                <div className="sale-items">
                  {items.map((i, index) => (
                    <div className="sale-line" key={index}>
                      <label>
                        Producto
                        <select
                          required
                          aria-label={"Producto " + (index + 1)}
                          value={i.productId}
                          onChange={(e) => {
                            const p = products.find(
                              (p) => p.id === e.target.value,
                            );
                            setItems((prev) =>
                              prev.map((v, n) =>
                                n === index
                                  ? {
                                      ...v,
                                      productId: e.target.value,
                                      unitPrice: Number(p?.sale_price) ? String(Number(p?.sale_price) / 100) : "",
                                    }
                                  : v,
                              ),
                            );
                          }}
                        >
                          <option value="">Selecciona un producto</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} · {p.name} ({p.stock} disponibles)
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Cantidad
                        <input
                          aria-label={"Cantidad " + (index + 1)}
                          type="number"
                          min="1"
                          max="1000000"
                          required
                          value={i.quantity}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((v, n) =>
                                n === index
                                  ? { ...v, quantity: numericText(e.target.value) }
                                  : v,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Precio unit. (S/)
                        <input
                          aria-label={"Precio " + (index + 1)}
                          type="number"
                          min="0"
                          max="10000000"
                          step="0.01"
                          required
                          value={i.unitPrice}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((v, n) =>
                                n === index
                                  ? { ...v, unitPrice: numericText(e.target.value) }
                                  : v,
                              ),
                            )
                          }
                        />
                      </label>
                      <div className="line-subtotal">
                        <small>Subtotal</small>
                        <strong>
                          {money(Math.round(Number(i.unitPrice) * 100) * Number(i.quantity))}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={items.length === 1}
                        aria-label={"Quitar producto " + (index + 1)}
                        onClick={() =>
                          setItems((prev) => prev.filter((_, n) => n !== index))
                        }
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-button"
                  disabled={items.length >= 50}
                  onClick={() =>
                    setItems([
                      ...items,
                      { productId: "", quantity: "1", unitPrice: "" },
                    ])
                  }
                >
                  <Plus size={16} /> Agregar producto
                </button>
                <div className="form-total">
                  <span>Subtotal facturación</span>
                  <strong>{money(total)}</strong>
                </div>
                <div className="form-grid">
                  <label>
                    Total de Yape / transferencia (S/)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={total / 100}
                      value={digital}
                      onChange={(e) => setDigital(numericText(e.target.value))}
                    />
                  </label>
                  <label>
                    Medio digital
                    <select name="method" defaultValue="YAPE">
                      <option value="YAPE">Yape</option>
                      <option value="TRANSFER">Transferencia</option>
                      <option value="NONE">Sin pago digital</option>
                    </select>
                  </label>
                  <Field
                    label="Código de operación (opcional)"
                    name="reference"
                    required={false}
                    placeholder="Código de Yape o transferencia"
                  />
                </div>
                <SaleLosses products={products} />
                <Field
                  label="Detalle de la venta"
                  name="detail"
                  required={false}
                  placeholder="Cliente u observaciones de la venta"
                />
                <div className="info-message">
                  Efectivo por recibir:{" "}
                  <strong>
                    {Number(digital) * 100 > total ? "El pago digital supera la facturación" : money(total - Math.round(Number(digital) * 100))}
                  </strong>
                  . Se descontarán del stock las unidades vendidas y las perdidas, una sola vez.
                </div>
              </>
            )}
            {type === "receipt" && <ReceiptFields products={products} />}
            {type === "expense" && (
              <>
                <label>
                  Tipo de gasto
                  <select name="kind">
                    <option value="OPERATING">
                      Operativo: comida, pasajes y otros
                    </option>
                    <option value="FIXED">
                      Fijo: alquiler, servicios, fletes
                    </option>
                  </select>
                </label>
                <Field label="Descripción del gasto" name="detail" />
                <MoneyField label="Monto (S/)" name="amount" />
              </>
            )}
            {type === "treasury" && (
              <>
                <label>
                  Tipo de movimiento
                  <select name="kind">
                    <option value="DEBT">
                      Deuda / descuento manual de caja
                    </option>
                    <option value="DEPOSIT">Efectivo depositado</option>
                    <option value="DELIVERY">Efectivo entregado</option>
                  </select>
                </label>
                <Field label="Motivo del movimiento" name="detail" />
                <MoneyField label="Monto (S/)" name="amount" />
                <p className="info-message">
                  No dupliques aquí las deudas registradas dentro de una venta.
                </p>
              </>
            )}
            {type === "bank" && (
              <>
                <Field
                  label={
                    r.kind === "INCOME"
                      ? "Detalle del ingreso"
                      : "Motivo de retiro / disposición"
                  }
                  name="detail"
                  value={r.kind === "INCOME" ? "Cuenta corriente diario" : ""}
                />
                <MoneyField label="Monto (S/)" name="amount" />
                <p className="info-message">
                  Se registrará por separado y se consolidará en la cuenta
                  corriente semanal.
                </p>
              </>
            )}
            {type === "opening" && (
              <>
                <MoneyField
                  label="Monto inicial en físico (S/)"
                  name="amount"
                />
                <p className="info-message">
                  Solo se permite una apertura por fecha, compartida por todo el
                  equipo.
                </p>
              </>
            )}
            {type === "product" && (
              <>
                <div className="form-grid">
                  <Field label="CODIGO" name="code" value={r?.code} />
                  <Field
                    label="Stock mínimo"
                    name="minStock"
                    type="number"
                    min="0"
                    max="1000000"
                    value={r?.min_stock ?? 10}
                  />
                </div>
                <Field
                  label="PRODUCTOS"
                  name="name"
                  value={r?.name}
                />
                <MoneyField
                  label="PRECIO UNITARIO DE VENTA (S/)"
                  name="salePrice"
                  value={Number(r?.sale_price ?? 0) / 100}
                />
                <label>
                  PRECIO UNITARIO DE COMPRA (S/)
                  <input
                    name="purchasePrice"
                    type="number"
                    min="0"
                    max="10000000"
                    step="0.01"
                    defaultValue={Number(r?.purchase_price) ? Number(r.purchase_price) / 100 : ""}
                    required
                    onChange={(e) => {
                      const clean = numericText(e.currentTarget.value);
                      if (clean !== e.currentTarget.value) e.currentTarget.value = clean;
                    }}
                  />
                </label>
                <p className="muted">
                  El precio de compra se usa para INVERSION y GANANCIA;
                  no cambia el historial de ventas.
                </p>
                {!r ? (
                  <Field
                    label="CANTIDAD EXISTENTE O STOCK inicial"
                    name="stock"
                    type="number"
                    min="0"
                    max="1000000"
                    value={0}
                  />
                ) : (
                  <p className="info-message">
                    El stock se modifica al registrar ventas o entradas. No
                    cambia al editar precios.
                  </p>
                )}
              </>
            )}
            {type === "user" && (
              <>
                <Field label="Nombre del administrador" name="name" />
                <label>
                  Correo de acceso
                  <div className="email-access-field">
                    <input
                      name="username"
                      aria-label="Nombre de usuario del administrador"
                      aria-describedby="seller-email-domain"
                      placeholder="nombre"
                      pattern={"[A-Za-z0-9._\\-]+"}
                      title="Usa letras, números, puntos, guiones o guiones bajos, sin @."
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                    <span id="seller-email-domain">@triunfoensidergroup</span>
                  </div>
                </label>
                <Field
                  label="Contraseña temporal (mín. 12 caracteres)"
                  name="password"
                  type="password"
                />
                <p className="info-message">
                  El administrador deberá cambiar esta contraseña al iniciar sesión.
                </p>
              </>
            )}
            {type === "userDelete" && (
              <>
                <p>
                  ¿Eliminar a <strong>{r.name}</strong>?
                  <br />
                  <span className="muted">{r.email}</span>
                </p>
                <p className="info-message">
                  Se cerrarán sus sesiones y ya no podrá iniciar sesión. La
                  cuenta desaparecerá de esta lista y liberará un cupo. Sus
                  ventas y demás operaciones se conservarán en el historial.
                  Para darle acceso nuevamente deberás crear una cuenta nueva.
                </p>
              </>
            )}
            {type === "saleDelete" && (
              <>
                <p>
                  ¿Eliminar la venta del <strong>{dateLabel(r.date)}</strong>{" "}
                  por un total de <strong>{money(r.total)}</strong>?
                </p>
                {r.items?.length > 0 && (
                  <div style={{ margin: "0.5rem 0" }}>
                    {r.items.map((i: any, idx: number) => (
                      <div
                        key={idx}
                        className="muted"
                        style={{ fontSize: "0.85rem" }}
                      >
                        • {i.quantity} × {i.name} ({money(i.unit_price)} c/u)
                      </div>
                    ))}
                  </div>
                )}
                <p className="info-message">
                  Los productos vendidos se reintegrarán automáticamente al stock
                  del inventario y el importe se descontará de la facturación y
                  caja del día.
                </p>
              </>
            )}
            {type === "receiptDelete" && (
              <>
                <p>
                  ¿Eliminar la entrada de{" "}
                  <strong>{r.quantity} unidades</strong> de{" "}
                  <strong>{r.name}</strong> ({r.code})?
                </p>
                <p className="info-message">
                  Se descontarán {r.quantity} unidades del inventario actual. Si
                  ya se vendió parte de esta mercadería y el stock actual no
                  alcanza, la operación será rechazada para evitar inconsistencias.
                </p>
              </>
            )}
            {type === "expenseDelete" && (
              <>
                <p>
                  ¿Eliminar el gasto <strong>"{r.detail}"</strong> (
                  {kindLabel[r.kind]}) por <strong>{money(r.amount)}</strong>?
                </p>
                <p className="info-message">
                  El importe se restituirá a los cálculos de caja neta del
                  período.
                </p>
              </>
            )}
            {type === "treasuryDelete" && (
              <>
                <p>
                  ¿Eliminar el movimiento de{" "}
                  <strong>{kindLabel[r.kind]}</strong> por{" "}
                  <strong>{money(r.amount)}</strong> — "{r.detail}"?
                </p>
                <p className="info-message">
                  El movimiento se retirará de los cálculos de caja y disponible
                  físico.
                </p>
              </>
            )}
            {type === "openingDelete" && (
              <>
                <p>
                  ¿Anular la apertura de caja de la fecha{" "}
                  <strong>{dateLabel(r.date)}</strong> por{" "}
                  <strong>{money(r.amount)}</strong>?
                </p>
                <p className="info-message">
                  La apertura quedará en cero y podrás registrar un nuevo monto
                  inicial si lo necesitas.
                </p>
              </>
            )}
            {type === "bankDelete" && (
              <>
                <p>
                  ¿Eliminar el movimiento de cuenta corriente de{" "}
                  <strong>{kindLabel[r.kind]}</strong> por{" "}
                  <strong>{money(r.amount)}</strong> — "{r.detail}"?
                </p>
                <p className="info-message">
                  El saldo semanal y acumulado de cuenta corriente se
                  recalcularán automáticamente.
                </p>
              </>
            )}
            {type === "productDelete" && (
              <>
                <p>
                  ¿Eliminar el producto <strong>{r.name}</strong> ({r.code})?
                </p>
                <p className="info-message">
                  El producto se eliminará del catálogo de inventario y no
                  volverá a aparecer para nuevas ventas o pedidos.
                </p>
              </>
            )}
            {type === "resetAllData" && (
              <>
                <p>
                  ¿Estás seguro de que deseas{" "}
                  <strong>eliminar todos los datos del sistema</strong>?
                </p>
                <p className="info-message" style={{ borderColor: "#b43d32" }}>
                  Esta acción eliminará todas las ventas, entradas de inventario,
                  gastos, movimientos de tesorería, movimientos de cuenta corriente,
                  aperturas y productos. El sistema se reiniciará completamente a
                  cero. Las cuentas de acceso de usuarios se mantendrán para que
                  puedas seguir iniciando sesión.
                </p>
              </>
            )}
            {type === "resetPassword" && (
              <>
                <p>
                  Cuenta: <strong>{r.email}</strong>
                </p>
                <Field
                  label="Nueva contraseña temporal (mín. 12 caracteres)"
                  name="password"
                  type="password"
                />
                <p className="info-message">
                  Se cerrarán las sesiones abiertas de esta cuenta.
                </p>
              </>
            )}
            {type === "password" && (
              <>
                <Field
                  label="Contraseña actual"
                  name="current"
                  type="password"
                />
                <Field
                  label="Nueva contraseña (mín. 12 caracteres)"
                  name="password"
                  type="password"
                />
              </>
            )}
            {error && (
              <div role="alert" className="error-message">
                {error}
              </div>
            )}
          </div>
          <footer className="modal-footer">
            {!forced && (
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={onClose}
              >
                Cancelar
              </button>
            )}
            <button
              className={
                "button " + (isDelete ? "danger" : "orange")
              }
              disabled={busy}
            >
              {busy
                ? isDelete
                  ? "Eliminando…"
                  : "Guardando…"
                : isDelete
                  ? titles[type]
                  : type === "password"
                    ? "Cambiar contraseña"
                    : "Guardar registro"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
