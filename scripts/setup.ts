import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { db, transaction, closeDB } from "../lib/db";
import { schema } from "../lib/schema";
import { hashPassword } from "../lib/password";
import { passwordSchema } from "../lib/validation";
import reference from "../data/initial-reference.json";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const initial = [
  ["P001", "AFEITADOR DESECHABLE DE 3 HOJAS", 90, 8],
  ["P002", "MASAGEADOR TERAPÉUTICO", 80, 9],
  ["P003", "MINIPICADORA DE 5 CUCHILLAS Y 2 NIVELES", 70, 10],
  ["P004", "LIBROS DIDÁCTICOS", 60, 11],
  ["P005", "MAQUINA DE AFEITAR TRIMER", 50, 12],
  ["P006", "PICATODO GRANDE", 40, 13],
  ["P007", "PIZARRA MÁGICA", 30, 14],
] as const;
async function main() {
  await db.query(schema);
  await transaction(async (c) => {
    await c.query("LOCK TABLE users IN EXCLUSIVE MODE");
    const existing = await c.query("SELECT count(*)::int AS count FROM users");
    if (existing.rows[0].count === 0) {
      const accounts = [
        ["Administrador", "admin", "INITIAL_ADMIN_PASSWORD", "ADMIN"],
        ["Vendedor 1", "vendedor1", "INITIAL_SELLER_1_PASSWORD", "SELLER"],
        ["Vendedor 2", "vendedor2", "INITIAL_SELLER_2_PASSWORD", "SELLER"],
        ["Vendedor 3", "vendedor3", "INITIAL_SELLER_3_PASSWORD", "SELLER"],
      ];
      for (const [name, email, key, role] of accounts) {
        const pass = passwordSchema.parse(process.env[key]);
        await c.query(
          "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)",
          [
            randomUUID(),
            name,
            email + "@triunfoensidergroup",
            await hashPassword(pass),
            role,
          ],
        );
      }
    }
    const marker = await c.query(
      "SELECT id FROM initial_reference WHERE id='import-v1'",
    );
    if (!marker.rows.length) {
      const products = await c.query(
        "SELECT count(*)::int AS count FROM products",
      );
      if (products.rows[0].count > 0)
        throw new Error(
          "Ya hay productos: revisar importación antes de continuar.",
        );
      for (const [code, name, stock, price] of initial)
        await c.query(
          "INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES($1,$2,$3,$4,$5,NULL)",
          [randomUUID(), code, name, stock, price * 100],
        );
      await c.query(
        "INSERT INTO initial_reference(id,source,data) VALUES($1,$2,$3)",
        ["import-v1", "inventario actual.xlsx", JSON.stringify(reference)],
      );
    }
  });
  console.log(
    "Base preparada. 4 cuentas iniciales con cambio obligatorio de contraseña. La importación no duplica existencias.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closeDB);
