import Link from "next/link";
import {
  ArrowUpRight,
  PackageCheck,
  Wallet,
  ChartNoAxesCombined,
  ShieldCheck,
} from "lucide-react";
export default function Home() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand">
          <img src="/logo.png" alt="Triunfo Ensider" />
          <span>
            Triunfo Ensider Group<small>Gestión comercial</small>
          </span>
        </Link>
        <Link className="button dark" href="/login">
          Iniciar sesión <ArrowUpRight size={17} />
        </Link>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <span className="pill">
            <span className="status-dot" /> Plataforma administrativa
          </span>
          <h1>
            Cada producto.
            <br />
            Cada venta.
            <br />
            <em>Todo bajo control.</em>
          </h1>
          <p>
            Un solo lugar para llevar tu inventario, registrar las ventas y
            conocer cómo se mueve tu negocio.
          </p>
          <Link className="button orange large" href="/login">
            Entrar al sistema <ArrowUpRight size={19} />
          </Link>
          <div className="hero-foot">
            <ShieldCheck size={18} /> Acceso exclusivo para nuestro equipo
          </div>
        </div>
        <div
          className="hero-art"
          aria-label="Inventario, ventas y caja conectados"
        >
          <div className="art-grid" />
          <div className="art-heading">
            TRIUNFO<span>ENSIDER GROUP</span>
          </div>
          <div className="art-stack stack-one">
            <PackageCheck />
            <div>
              Inventario<span>Existencias actualizadas</span>
            </div>
            <i />
          </div>
          <div className="art-stack stack-two">
            <Wallet />
            <div>
              Ventas y caja<span>Operaciones del día</span>
            </div>
            <i />
          </div>
          <div className="art-stack stack-three">
            <ChartNoAxesCombined />
            <div>
              Control financiero<span>Una visión completa</span>
            </div>
            <i />
          </div>
          <div className="art-bottom">
            Una operación más ordenada.
            <br />
            <strong>Un negocio que avanza.</strong>
          </div>
        </div>
      </section>
      <footer className="landing-footer">
        <span>Comercializadora Triunfo Ensider Group</span>
        <span>RUC 10733781543 · Perú</span>
      </footer>
    </main>
  );
}
