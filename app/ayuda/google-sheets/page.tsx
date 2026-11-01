import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function GoogleHelp() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/sistema");
  return (
    <main className="google-help">
      <Link className="back-link-static" href="/sistema">
        ← Volver al sistema
      </Link>
      <h1>Conectar los reportes con Google Sheets</h1>
      <p>
        La conexión guarda los reportes en una cuenta de Google del
        administrador. El acceso al sistema sigue usando tus correos y
        contraseñas internos.
      </p>
      <ol>
        <li>
          Abre{" "}
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Cloud Console
          </a>{" "}
          con la cuenta que administrará la conexión y crea o selecciona un
          proyecto.
        </li>
        <li>
          En «APIs y servicios», habilita <strong>Google Sheets API</strong>.
        </li>
        <li>
          En «Google Auth Platform», configura el nombre de la aplicación y tus
          datos de contacto. Si eliges audiencia externa y modo de prueba, añade
          la cuenta de Google del administrador como usuario de prueba.
        </li>
        <li>
          Crea un cliente OAuth de tipo <strong>Aplicación web</strong>. Añade
          la dirección de retorno exacta:{" "}
          <code>http://127.0.0.1:3000/api/google/callback</code> para esta
          instalación local. Para Vercel, usa{" "}
          <code>https://TU-DOMINIO/api/google/callback</code>.
        </li>
        <li>
          Configura en el servidor <code>GOOGLE_CLIENT_ID</code>,{" "}
          <code>GOOGLE_CLIENT_SECRET</code> y <code>GOOGLE_REDIRECT_URI</code>.
          En local se guardan en <code>.env.local</code>; en Vercel, en las
          variables del proyecto. No los compartas en el chat ni los subas al
          repositorio.
        </li>
        <li>
          Configura también <code>GOOGLE_TOKEN_ENCRYPTION_KEY</code> con una
          clave aleatoria de 32 bytes en base64. La guía del repositorio incluye
          el comando para generarla. Conserva esta clave entre despliegues.
        </li>
        <li>
          Reinicia el servidor. En «Generar enlace a Google Sheets», pulsa{" "}
          <strong>Conectar Google</strong> y autoriza la cuenta del
          administrador. Después ya podrás generar el enlace del reporte.
        </li>
      </ol>
      <p>
        Los permisos solicitados se limitan a los archivos creados o utilizados
        por esta aplicación. Las hojas no se publican automáticamente. Si los
        vendedores necesitan abrirlas, el administrador deberá compartirlas con
        sus cuentas de Google reales.
      </p>
      <p>
        En modo de prueba de Google, la autorización puede vencer y requerir una
        nueva conexión. Para el uso estable, revisa el estado de publicación y
        los requisitos indicados en tu proyecto de Google.
      </p>
      <Link className="button orange" href="/sistema">
        Volver al sistema
      </Link>
    </main>
  );
}
