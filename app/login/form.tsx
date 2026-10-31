"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
export default function LoginForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  const router = useRouter();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const r = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: f.get("email"),
              password: f.get("password"),
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          router.push("/sistema");
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Correo de acceso
        <input
          name="email"
          type="text"
          autoComplete="username"
          required
          placeholder="usuario@triunfoensidergroup"
          spellCheck={false}
        />
      </label>
      <label>
        Contraseña
        <div className="password-field">
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={128}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>
      {error && (
        <div role="alert" className="error-message">
          {error}
        </div>
      )}
      <button className="button orange full" disabled={busy}>
        {busy ? "Ingresando…" : "Iniciar sesión"}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
