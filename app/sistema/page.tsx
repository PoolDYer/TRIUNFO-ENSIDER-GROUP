import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Dashboard from "./dashboard";
export const dynamic = "force-dynamic";
export default async function Sistema() {
  let user;
  try {
    user = await currentUser();
  } catch {
    return (
      <main className="setup-message">
        <h1>Conecta la base de datos</h1>
        <p>
          Configura DATABASE_URL y ejecuta la preparación de la base indicada en
          el README para habilitar el sistema.
        </p>
        <a href="/">Volver al inicio</a>
      </main>
    );
  }
  if (!user) redirect("/login");
  return <Dashboard user={user} />;
}
