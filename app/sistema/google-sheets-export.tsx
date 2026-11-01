"use client";
import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, ExternalLink, Copy, X } from "lucide-react";
export default function GoogleSheetsExport({
  date,
  period,
  admin,
  disabled,
}: {
  date: string;
  period: string;
  admin: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [status, setStatus] = useState<{
      configured: boolean;
      connected: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [url, setUrl] = useState(""),
    [copied, setCopied] = useState(false);
  const requestId = useRef("");
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const elements = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input",
        ) ?? [],
      ).filter((e) => e.offsetParent !== null);
    elements()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = elements();
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0]?.focus();
      }
    };
    document.addEventListener("keydown", key);
    const controller = new AbortController();
    setStatus(null);
    setError("");
    setUrl("");
    setCopied(false);
    requestId.current = crypto.randomUUID();
    fetch("/api/google/status", { signal: controller.signal })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        setStatus(result);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      controller.abort();
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/google/connect", { method: "POST" });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/google/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId.current, date, period }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setUrl(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <FileSpreadsheet size={16} /> Generar enlace a Google Sheets
      </button>
      {open && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setOpen(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="google-export-title"
            ref={dialog}
          >
            <header className="modal-header">
              <div>
                <h2 id="google-export-title">Reporte en Google Sheets</h2>
                <p>
                  {{ day: "Diario", week: "Semanal", month: "Mensual" }[period]}{" "}
                  · Fecha de referencia: {date}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Cerrar exportación"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                <X size={21} />
              </button>
            </header>
            <div className="modal-body">
              {!status && !error && (
                <p className="muted" role="status">
                  Consultando la conexión con Google…
                </p>
              )}
              {status && !status.configured && (
                <>
                  <p>
                    Falta configurar la conexión de Google Sheets para generar
                    reportes.
                  </p>
                  <p className="info-message">
                    {admin
                      ? "Completa la configuración inicial y después conecta la cuenta de Google donde se guardarán los reportes."
                      : "Solicita al administrador que configure y conecte la cuenta de Google."}
                  </p>
                  {admin && (
                    <a
                      className="button secondary"
                      href="/ayuda/google-sheets"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver instrucciones <ExternalLink size={16} />
                    </a>
                  )}
                </>
              )}
              {status?.configured && !status.connected && (
                <>
                  <p>
                    {admin
                      ? "Conecta la cuenta de Google del administrador donde se guardarán los reportes."
                      : "El administrador debe conectar su cuenta de Google antes de generar enlaces."}
                  </p>
                  {admin && (
                    <button
                      className="button orange"
                      disabled={busy}
                      onClick={connect}
                    >
                      {busy ? "Conectando…" : "Conectar Google"}
                    </button>
                  )}
                </>
              )}
              {status?.connected && !url && (
                <>
                  <p>
                    Se creará una hoja con el resumen financiero, los productos
                    vendidos y las ventas por día del período elegido.
                  </p>
                  <p className="info-message">
                    El reporte se guardará en la cuenta de Google conectada. El
                    enlace conserva sus permisos de acceso; para compartirlo,
                    usa «Compartir» en Google Sheets. Los datos serán una copia
                    al momento de generar el reporte.
                  </p>
                  <button
                    className="button orange"
                    disabled={busy}
                    onClick={generate}
                  >
                    <FileSpreadsheet size={17} />
                    {busy ? "Generando reporte…" : "Generar enlace"}
                  </button>
                  {admin && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={connect}
                    >
                      Conectar otra cuenta de Google
                    </button>
                  )}
                </>
              )}
              {url && (
                <>
                  <p>El reporte está listo.</p>
                  <a
                    className="button orange"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir en Google Sheets <ExternalLink size={16} />
                  </a>
                  <label>
                    Enlace del reporte
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </label>
                  <button
                    className="button secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        setCopied(true);
                      } catch {
                        setError("Selecciona y copia el enlace del campo.");
                      }
                    }}
                  >
                    <Copy size={16} />
                    {copied ? "Enlace copiado" : "Copiar enlace"}
                  </button>
                  <p className="muted">
                    Solo podrán abrirlo las personas autorizadas en Google
                    Sheets.
                  </p>
                </>
              )}
              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
