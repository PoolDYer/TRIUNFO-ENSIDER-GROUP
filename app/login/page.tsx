import Link from "next/link";
import LoginForm from "./form";
export default function Login() {
  return (
    <main className="login-page">
      <Link className="back-link" href="/">
        ← Volver al inicio
      </Link>
      <section className="login-box">
        <img className="login-logo" src="/logo.png" alt="Triunfo Ensider" />
        <span className="muted">Triunfo Ensider Group</span>
        <h1>Bienvenido de nuevo</h1>
        <p className="muted">Ingresa con tu cuenta del equipo.</p>
        <LoginForm />
        <p className="login-help">
          ¿Necesitas acceso o recuperar tu contraseña?
          <br />
          Comunícate con el administrador.
        </p>
      </section>
      <div className="login-footer">Inventario y administración comercial</div>
    </main>
  );
}
