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
  Download,
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
{ id: "sales", label: "Ventas del día", icon: ShoppingBag },
{ id: "receipts", label: "Control de entrada", icon: PackagePlus },
{ id: "expenses", label: "Gastos y caja", icon: Receipt },
{ id: "bank", label: "Cuenta corriente", icon: Landmark },
{ id: "products", label: "Lista de productos", icon: Boxes, admin: true }
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
  receipt: "Entrada registrada",
  expense: "Gasto registrado",
  treasury: "Movimiento de caja",
  bank: "Cuenta corriente",
  opening: "Apertura de caja",
  product: "Producto guardado",
  productStatus: "Estado de producto",
  user: "Usuario creado",
  userStatus: "Estado de usuario",
  resetPassword: "Contraseña restablecida",
  password: "Cambio de contraseña",
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
        defaultValue={value}
        required={required}
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
  const [view, setView] = useState("sales"),
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
    fetch(`/api/data?view=${view}&date=${date}&period=${period}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [view, date, period, refresh, user.must_change_password]);
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
  const low = products.filter((p) => p.stock <= p.min_stock);
  const exportUrl = `/api/data?view=reports&date=${date}&period=${period}&export=csv`;
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
            .filter((n) => !n.admin || admin)
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
            {admin ? "Acceso de administrador" : "Acceso de vendedor"}
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
          <span className="topbar-date">
            {new Date().toLocaleDateString("es-PE", {
              timeZone: "America/Lima",
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
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
              
            </div>
          </div>
          {!isSpecial && (
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
                <label htmlFor="business-date">Fecha de referencia</label>
                <input
                  id="business-date"
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
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
              
              
              {view === "sales" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Registro de ventas</h2>
                    <span className="muted">
                      {data.sales.length} registros visibles
                    </span>
                  </div>
                  <SalesTable sales={data.sales} />
                  <p className="panel-hint">
                    Se muestran hasta 200 ventas recientes del período. Los
                    totales y reportes incluyen todas las operaciones.
                  </p>
                </section>
              )}
              {view === "receipts" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Mercadería ingresada</h2>
                    <span className="pill">Stock actualizado al guardar</span>
                  </div>
                  {data.receipts.length ? (
                    <Table
                      headers={[
                        "Fecha",
                        "Producto",
                        "Proveedor",
                        "Cantidad",
                        "Costo de pedido",
                        "Modalidad",
                        "Saldo",
                        "Registrado por",
                      ]}
                    >
                      {data.receipts.map((r: any) => (
                        <tr key={r.id}>
                          <td>{dateLabel(r.date)}</td>
                          <td>
                            <strong>{r.name}</strong>
                            <small>{r.code}</small>
                          </td>
                          <td>{r.supplier}</td>
                          <td>{r.quantity}</td>
                          <td>{money(r.order_cost)}</td>
                          <td>{kindLabel[r.modality]}</td>
                          <td>
                            {money(Number(r.order_cost) - Number(r.paid))}
                          </td>
                          <td>{r.user_name}</td>
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
                        ]}
                      >
                        {data.treasury.map((r: any) => (
                          <tr key={r.id}>
                            <td>{dateLabel(r.date)}</td>
                            <td>{r.detail}</td>
                            <td>{kindLabel[r.kind]}</td>
                            <td>{money(r.amount)}</td>
                            <td>{r.user_name}</td>
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
                      label="Ingresos del período"
                      value={money(t.bankIncome)}
                      icon={ArrowDownLeft}
                      note="Ingresados por el administrador"
                    />
                    <Stat
                      label="Retiros / disposición"
                      value={money(t.bankWithdrawals)}
                      icon={ArrowUpRight}
                      note="Registrados con su motivo"
                    />
                    <Stat
                      label="Total acumulado"
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
                          "Ingresos",
                          "Retiros",
                          "Total semanal",
                          "Acumulado",
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
              
              {view === "products" && (
                <>
                  <div className="restricted-note">
                    <ShieldCheck size={17} /> Información exclusiva del
                    administrador
                  </div>
                  <div className="product-totals">
                    <div>
                      <span>Capital a precio de venta</span>
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
                      <span>Inversión con costo conocido</span>
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
                      <span>Ganancia potencial con costo conocido</span>
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
                      Hay costos de compra pendientes. La inversión y la
                      ganancia son parciales hasta completarlos.
                    </p>
                  )}
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Catálogo de productos</h2>
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
                        "Código",
                        "Producto",
                        "Stock",
                        "Precio venta",
                        "Precio compra",
                        "Capital",
                        "Inversión",
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
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </section>
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
            setNotice("Registro guardado correctamente.");
          }}
        />
      )}
    </div>
  );
}
function SalesTable({ sales }: { sales: any[] }) {
  return sales.length ? (
    <Table
      headers={[
        "Fecha",
        "Productos vendidos",
        "Facturación",
        "Yape / transf.",
        "Deuda",
        "Efectivo",
        "Código de operación",
        "Registrado por",
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
          <td>{money(s.debt)}</td>
          <td>{money(s.cash)}</td>
          <td>{s.reference || "—"}</td>
          <td>{s.user_name}</td>
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
    { productId: "", quantity: 1, unitPrice: 0 },
  ]);
  const [digital, setDigital] = useState(0),
    [debt, setDebt] = useState(0);
  const [pendingCost, setPendingCost] = useState(
    r ? r.purchase_price === null : true,
  );
  const titles: Record<string, string> = {
    sale: "Registrar venta",
    receipt: "Registrar entrada",
    expense: "Registrar gasto",
    treasury: "Registrar movimiento de caja",
    opening: "Apertura de caja",
    bank:
      r?.kind === "INCOME"
        ? "Ingreso de cuenta corriente"
        : "Retiro de cuenta corriente",
    product: r ? "Editar producto" : "Nuevo producto",
    user: "Crear vendedor",
    resetPassword: "Restablecer contraseña",
    password: forced ? "Configura tu contraseña" : "Cambiar contraseña",
  };
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
    (s, i) => s + Math.round(i.unitPrice * 100) * i.quantity,
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
        items,
        digital,
        debt,
        method: val("method"),
        reference: val("reference"),
        detail: val("detail"),
      };
    if (type === "receipt")
      body = {
        ...body,
        productId: val("productId"),
        quantity: num("quantity"),
        supplier: val("supplier"),
        orderCost: num("orderCost"),
        paid: num("paid"),
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
        purchasePrice: pendingCost ? null : num("purchasePrice"),
        minStock: num("minStock"),
        ...(!r ? { stock: num("stock") } : {}),
      };
    
    
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
            : { action: type, data: body },
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
        className={"modal " + (type === "sale" ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{titles[type]}</h2>
            <p>
              {type === "password"
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
            {!["product", "user", "resetPassword", "password"].includes(
              type,
            ) && (
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
                                      unitPrice:
                                        Number(p?.sale_price ?? 0) / 100,
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
                                  ? { ...v, quantity: Number(e.target.value) }
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
                                  ? { ...v, unitPrice: Number(e.target.value) }
                                  : v,
                              ),
                            )
                          }
                        />
                      </label>
                      <div className="line-subtotal">
                        <small>Subtotal</small>
                        <strong>
                          {money(Math.round(i.unitPrice * 100) * i.quantity)}
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
                      { productId: "", quantity: 1, unitPrice: 0 },
                    ])
                  }
                >
                  <Plus size={16} /> Agregar producto
                </button>
                <div className="form-total">
                  <span>Facturación total</span>
                  <strong>{money(total)}</strong>
                </div>
                <div className="form-grid">
                  <label>
                    Yape / transferencia (S/)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={digital}
                      onChange={(e) => setDigital(Number(e.target.value))}
                      required
                    />
                  </label>
                  <label>
                    Venta pendiente de cobro (S/)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={debt}
                      onChange={(e) => setDebt(Number(e.target.value))}
                      required
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
                    label="Código de operación"
                    name="reference"
                    required={digital > 0}
                    placeholder="Código de Yape o transferencia"
                  />
                </div>
                <Field
                  label="Detalle / motivo de deuda"
                  name="detail"
                  required={debt > 0}
                  placeholder="Productos vendidos, cliente u observaciones"
                />
                <div className="info-message">
                  Efectivo por recibir:{" "}
                  <strong>
                    {money(
                      total -
                        Math.round(digital * 100) -
                        Math.round(debt * 100),
                    )}
                  </strong>
                  . La venta descontará stock al guardar.
                </div>
              </>
            )}
            {type === "receipt" && (
              <>
                <label>
                  Producto
                  <select name="productId" required defaultValue="">
                    <option value="">Selecciona un producto</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Proveedor" name="supplier" />
                <div className="form-grid">
                  <Field
                    label="Cantidad ingresante"
                    name="quantity"
                    type="number"
                    min="1"
                    max="1000000"
                    value={1}
                  />
                  <MoneyField label="Costo del pedido (S/)" name="orderCost" />
                  <label>
                    Modalidad
                    <select name="modality">
                      <option value="CASH">Al contado</option>
                      <option value="CREDIT">Al crédito</option>
                    </select>
                  </label>
                  <MoneyField label="Monto pagado (S/)" name="paid" />
                </div>
                <p className="info-message">
                  El saldo será costo del pedido menos monto pagado. Registra
                  aparte cualquier gasto pagado desde caja.
                </p>
              </>
            )}
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
                  <Field label="Código" name="code" value={r?.code} />
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
                  label="Nombre del producto"
                  name="name"
                  value={r?.name}
                />
                <MoneyField
                  label="Precio unitario de venta (S/)"
                  name="salePrice"
                  value={Number(r?.sale_price ?? 0) / 100}
                />
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={pendingCost}
                    onChange={(e) => setPendingCost(e.target.checked)}
                  />{" "}
                  Costo de compra pendiente de confirmar
                </label>
                {!pendingCost && (
                  <MoneyField
                    label="Precio unitario de compra (S/)"
                    name="purchasePrice"
                    value={Number(r?.purchase_price ?? 0) / 100}
                  />
                )}
                <p className="muted">
                  El costo de compra se usa para inversión y ganancia potencial;
                  no cambia el historial de ventas.
                </p>
                {!r ? (
                  <Field
                    label="Stock inicial"
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
            <button className="button orange" disabled={busy}>
              {busy
                ? "Guardando…"
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
