import { existsSync } from "node:fs";
import { db, closeDB } from "../lib/db";
import { schema } from "../lib/schema";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  await db.query(schema);
  console.log(
    "Esquema actualizado. Se conservaron las cuentas, el inventario y los registros existentes.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closeDB);
