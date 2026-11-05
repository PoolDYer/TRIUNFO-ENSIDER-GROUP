import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { schema } from "../lib/schema";
import { DB } from "../lib/db";
import { User } from "../lib/auth";
import { calculateTotals } from "../lib/reports";
import {
  sealSecret,
  openSecret,
  validOAuthState,
  googleConfig,
} from "../lib/google-config";
import { spreadsheetPayload, createSpreadsheet } from "../lib/google-sheets";
import { exportGoogleReport } from "../lib/google-exports";
const summary = {
  start: "2026-10-26",
  end: "2026-11-01",
  period: "week",
  totals: {
    ...calculateTotals(
      {
        billing: 806000,
        digital: 23500,
        operating: 3300,
        fixed: 15500,
        debt: 0,
        opening: 2000,
        deposits: 0,
        deliveries: 0,
      },
      "week",
    ),
    cashReceipts: 782500,
    productLossAmount: 0,
    salesCount: 7,
    bankIncome: 280000,
    bankWithdrawals: 13000,
    bankNet: 267000,
    bankAccumulated: 534000,
  },
  items: [
    {
      code: "P001",
      name: '=HYPERLINK("https://example.com")',
      stock: 90,
      quantity: 2,
      unit_price: "800",
      total: "1600",
    },
  ],
  daily: [{ date: "2026-10-30", total: "1600", digital: "500" }],
};
test("El reporte de Google conserva números, soles, fechas y textos sin ejecutar fórmulas", () => {
  const payload = spreadsheetPayload(summary);
  assert.equal(payload.sheets.length, 3);
  assert.equal(payload.properties.timeZone, "America/Lima");
  assert.ok(payload.properties.title.includes("2026-10-26"));
  const rows = payload.sheets[0].data[0].rowData as any[];
  const excel = rows.find(
    (r) => r.values[0]?.userEnteredValue.stringValue === "Total de caja",
  );
  assert.equal(excel.values[1].userEnteredValue.numberValue, 7792);
  const product = payload.sheets[1].data[0].rowData[4] as any;
  assert.equal(
    product.values[1].userEnteredValue.stringValue,
    summary.items[0].name,
  );
  assert.equal(product.values[4].userEnteredValue.numberValue, 8);
  assert.equal(product.values[5].userEnteredValue.numberValue, 16);
  assert.equal(product.values[0].userEnteredValue.stringValue, "P001");
  assert.ok(!JSON.stringify(payload).includes("formulaValue"));
});
test("Los secretos de Google se cifran con autenticación y rechazan alteraciones", () => {
  const key = randomBytes(32),
    value = "private-refresh-token";
  const first = sealSecret(value, key),
    second = sealSecret(value, key);
  assert.notEqual(first, second);
  assert.ok(!first.includes(value));
  assert.equal(openSecret(first, key), value);
  assert.throws(() => openSecret(first, randomBytes(32)), /conexión/);
  const parts = first.split(".");
  parts[2] = Buffer.from("changed").toString("base64url");
  assert.throws(() => openSecret(parts.join("."), key), /conexión/);
});
test("OAuth rechaza estados expirados, otra cuenta y solicitudes falsificadas", () => {
  const key = randomBytes(32);
  const saved = {
    state: "random-state",
    userId: "admin-id",
    expires: Date.now() + 60000,
    verifier: "pkce-verifier",
  };
  const encoded = sealSecret(JSON.stringify(saved), key);
  assert.equal(
    validOAuthState(encoded, saved.state, saved.userId, key)?.verifier,
    saved.verifier,
  );
  assert.equal(
    validOAuthState(encoded, "other-state", saved.userId, key),
    null,
  );
  assert.equal(
    validOAuthState(encoded, saved.state, "another-user", key),
    null,
  );
  assert.equal(
    validOAuthState(
      sealSecret(JSON.stringify({ ...saved, expires: 0 }), key),
      saved.state,
      saved.userId,
      key,
    ),
    null,
  );
});
test("La configuración rechaza claves inválidas y retornos inseguros", () => {
  const names = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_TOKEN_ENCRYPTION_KEY",
  ];
  const old = names.map((n) => process.env[n]);
  try {
    process.env.GOOGLE_CLIENT_ID = "test.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "https://inventory.example/api/google/callback";
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
    assert.equal(googleConfig().redirectUri, process.env.GOOGLE_REDIRECT_URI);
    process.env.GOOGLE_REDIRECT_URI =
      "http://external.example/api/google/callback";
    assert.throws(googleConfig, /retorno/);
    process.env.GOOGLE_REDIRECT_URI =
      "https://inventory.example/api/google/callback";
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "short";
    assert.throws(googleConfig, /clave/);
  } finally {
    names.forEach((n, i) => {
      if (old[i] === undefined) delete process.env[n];
      else process.env[n] = old[i];
    });
  }
});
test("Crear la hoja usa una única llamada oficial y devuelve un enlace de Google validado", async () => {
  let calls = 0;
  const fake: typeof fetch = async (input, init) => {
    calls++;
    assert.ok(
      String(input).startsWith("https://sheets.googleapis.com/v4/spreadsheets"),
    );
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.sheets.length, 3);
    return new Response(
      JSON.stringify({
        spreadsheetId: "report_123",
        spreadsheetUrl: "https://untrusted.example",
      }),
      { status: 200 },
    );
  };
  const result = await createSpreadsheet(
    "mock-token",
    spreadsheetPayload(summary),
    fake,
  );
  assert.equal(calls, 1);
  assert.equal(
    result.url,
    "https://docs.google.com/spreadsheets/d/report_123/edit",
  );
});
test("Los errores de Google no generan enlaces falsos ni exponen credenciales", async () => {
  await assert.rejects(
    createSpreadsheet(
      "secret",
      spreadsheetPayload(summary),
      async () => new Response("", { status: 429 }),
    ),
    /límite/,
  );
  await assert.rejects(
    createSpreadsheet(
      "secret",
      spreadsheetPayload(summary),
      async () => new Response("", { status: 403 }),
    ),
    /permisos/,
  );
  await assert.rejects(
    createSpreadsheet(
      "secret",
      spreadsheetPayload(summary),
      async () =>
        new Response(JSON.stringify({ spreadsheetId: "../invalid" }), {
          status: 200,
        }),
    ),
    /válida/,
  );
});
async function fixture() {
  const pg = new PGlite();
  await pg.exec(schema);
  const user: User = {
    id: randomUUID(),
    name: "Dueño",
    email: "admin@triunfoensidergroup",
    role: "ADMIN",
    must_change_password: false,
  };
  await pg.query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,'unused','ADMIN')",
    [user.id, user.name, user.email],
  );
  const wrap = (p: any): DB => ({
    query: async (sql, values = []) => {
      const result = await p.query(sql, values);
      return { rows: result.rows as any[], rowCount: result.affectedRows };
    },
  });
  const db = wrap(pg);
  const transaction = <T>(fn: (c: DB) => Promise<T>) =>
    pg.transaction((c) => fn(wrap(c)));
  return { pg, db, transaction, user };
}
test("Reintentar el mismo reporte devuelve el enlace guardado sin duplicar hojas", async () => {
  const f = await fixture();
  try {
    const input = {
      id: randomUUID(),
      date: "2026-10-31",
      period: "week" as const,
    };
    let calls = 0;
    const provider = async () => {
      calls++;
      return {
        id: "test_report",
        url: "https://docs.google.com/spreadsheets/d/test_report/edit",
      };
    };
    const one = await exportGoogleReport(
      f.db,
      f.transaction,
      f.user,
      input,
      provider,
    );
    const two = await exportGoogleReport(
      f.db,
      f.transaction,
      f.user,
      input,
      provider,
    );
    assert.deepEqual(two, one);
    assert.equal(calls, 1);
    assert.equal(
      (
        await f.db.query(
          "SELECT count(*)::int AS n FROM audit_log WHERE action='googleExport'",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      exportGoogleReport(
        f.db,
        f.transaction,
        f.user,
        { ...input, date: "2026-11-01" },
        provider,
      ),
      /no corresponde/,
    );
    await assert.rejects(
      exportGoogleReport(
        f.db,
        f.transaction,
        { ...f.user, id: randomUUID() },
        input,
        provider,
      ),
      /no corresponde/,
    );
  } finally {
    await f.pg.close();
  }
});
test("Dos solicitudes simultáneas no crean dos hojas del mismo reporte", async () => {
  const f = await fixture();
  try {
    let start!: () => void, release!: () => void;
    const started = new Promise<void>((r) => {
        start = r;
      }),
      wait = new Promise<void>((r) => {
        release = r;
      });
    let calls = 0;
    const input = {
      id: randomUUID(),
      date: "2026-10-31",
      period: "day" as const,
    };
    const create = async () => {
      calls++;
      start();
      await wait;
      return {
        id: "test",
        url: "https://docs.google.com/spreadsheets/d/test/edit",
      };
    };
    const first = exportGoogleReport(
      f.db,
      f.transaction,
      f.user,
      input,
      create,
    );
    await started;
    await assert.rejects(
      exportGoogleReport(f.db, f.transaction, f.user, input, create),
      /en proceso/,
    );
    release();
    await first;
    assert.equal(calls, 1);
  } finally {
    await f.pg.close();
  }
});
test("Una generación fallida no se registra como reporte listo", async () => {
  const f = await fixture();
  try {
    const input = {
      id: randomUUID(),
      date: "2026-10-31",
      period: "day" as const,
    };
    await assert.rejects(
      exportGoogleReport(f.db, f.transaction, f.user, input, async () => {
        throw new Error("Simulated Google failure");
      }),
      /Simulated/,
    );
    assert.equal(
      (
        await f.db.query("SELECT status FROM google_exports WHERE id=$1", [
          input.id,
        ])
      ).rows[0].status,
      "FAILED",
    );
    assert.equal(
      (
        await f.db.query(
          "SELECT count(*)::int AS n FROM audit_log WHERE action='googleExport'",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await f.pg.close();
  }
});
