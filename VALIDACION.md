# Validación del sistema

Validación realizada el **5 de noviembre de 2026**, sobre el código funcional del commit `4f3ec782496ffd04d478c8151fe9357f07c3bd86` y la plataforma pública en Vercel.

## Resultado

- `npm run typecheck`: aprobado.
- `npx tsx --test --test-concurrency=1 tests/*.test.ts`: **58 pruebas aprobadas, sin fallos**.
- `npm run build`: compilación de producción aprobada.
- Conexión PostgreSQL con Supabase y verificación de su certificado TLS: aprobadas.
- Manifiesto de instalación, favicon, icono de iOS y dimensiones de los iconos PNG: comprobados por HTTP en producción.

## Lógica y permisos

Las pruebas automatizadas verifican cálculos monetarios, fechas y períodos, stock, ventas simultáneas, pérdidas adicionales, entradas de varios productos, financiamiento con interés único, pagos, gastos, caja, cuenta corriente, ganancias, notificaciones, usuarios y límite de diez cuentas. También verifican conservación y transferencia de datos, duplicados, reversiones y restricciones de roles.

En producción se comprobaron las siguientes respuestas para Dueño y Administrador:

| Comprobación | Resultado |
| --- | --- |
| Dueño: Productos, Financiamiento, Ganancias, Entradas y Usuarios | HTTP 200 |
| Administrador: esos cinco apartados | HTTP 403 |
| Administrador: Resumen, Ventas, Gastos y caja, Cuenta corriente y Reportes | HTTP 200 |
| Administrador: registrar entradas o pagos de financiamiento mediante la API | HTTP 403 |
| Menú de cada rol | Solo muestra sus apartados permitidos |
| Respuestas operativas para administradores | Sin ganancias, inversión, márgenes, costos de compra ni registros de entradas |

Los reportes se filtran también antes de generar el contenido de Google Sheets. Las pruebas automatizadas cubren la construcción de las hojas, privacidad, cifrado, estados OAuth, errores y reintentos, con respuestas simuladas de Google. Esta validación no creó nuevas hojas ni repitió la autorización interactiva de Google.

## Autenticación en producción

Se comprobaron bloqueo de solicitudes desde otro origen, rechazo de contraseña incorrecta, acceso con contraseña correcta, atributos `HttpOnly`, `Secure` y `SameSite=Lax` de la cookie, acceso autenticado, rechazo de cuentas desactivadas, cierre de sesión y rechazo de sesiones vencidas.

Se utilizaron cuentas y sesiones temporales de comprobación, eliminadas al finalizar. No se cambiaron las contraseñas de usuarios reales ni se registraron ventas, entradas o pagos ficticios en producción.

## Concurrencia medida

Una tanda de **10 consultas simultáneas** al reporte operativo diario, usando una cuenta temporal de Administrador:

| Medida | Resultado |
| --- | --- |
| Errores | 0 |
| Mediana | 717 ms |
| P95 y máximo | 1561 ms |

Es una medición puntual de consultas concurrentes con una cuenta. No equivale a una prueba sostenida con diez usuarios distintos ni garantiza esos tiempos bajo cualquier carga. La revisión de interfaces en navegadores y dispositivos físicos no forma parte de estas comprobaciones por HTTP.

Los informes técnicos locales, sin publicarse, se conservan en `.work/verificacion-apartados-dueno.json` y `.work/verificacion-autenticacion-carga.json`. Las credenciales, cuentas de prueba y respaldos quedan fuera del repositorio.
