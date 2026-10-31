// Read-only load test against a running app. Account file is local and must never be committed.
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
const origin = process.env.LOAD_TEST_URL;
const file = process.env.LOAD_TEST_ACCOUNTS_FILE;
if (!origin || !file)
  throw new Error(
    "Configura LOAD_TEST_URL y LOAD_TEST_ACCOUNTS_FILE (JSON local con email/password).",
  );
const accounts = JSON.parse(await fs.readFile(file, "utf8"));
if (!Array.isArray(accounts) || accounts.length < 1 || accounts.length > 10)
  throw new Error(
    "Usa entre 1 y 10 cuentas activas con contraseñas definitivas.",
  );
const sessions = [];
for (const a of accounts) {
  const r = await fetch(new URL("/api/auth", origin), {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(a),
  });
  if (!r.ok) throw new Error(`Inicio de sesión falló: HTTP ${r.status}`);
  sessions.push(r.headers.get("set-cookie").split(";")[0]);
}
const times = [];
let failures = 0;
try {
  for (let round = 0; round < 10; round++)
    await Promise.all(
      sessions.map(async (cookie) => {
        const t = performance.now();
        const r = await fetch(
          new URL("/api/data?view=reports&period=week", origin),
          { headers: { Cookie: cookie } },
        );
        await r.text();
        times.push(performance.now() - t);
        if (!r.ok) failures++;
      }),
    );
  times.sort((a, b) => a - b);
  const percentile = (p) =>
    Math.round(times[Math.min(times.length - 1, Math.floor(times.length * p))]);
  console.log(
    JSON.stringify(
      {
        users: accounts.length,
        requests: times.length,
        failures,
        p50_ms: percentile(0.5),
        p95_ms: percentile(0.95),
        max_ms: Math.round(times.at(-1)),
      },
      null,
      2,
    ),
  );
  if (failures) process.exitCode = 1;
} finally {
  await Promise.all(
    sessions.map((cookie) =>
      fetch(new URL("/api/auth", origin), {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({ action: "logout" }),
      }),
    ),
  );
}
