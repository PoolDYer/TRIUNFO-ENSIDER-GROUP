# Triunfo Ensider Group

Sistema web administrativo de inventario, ventas y caja, preparado para Vercel con Next.js, TypeScript y PostgreSQL. Autenticación propia con correo y contraseña, sin OAuth, proveedores de identidad ni envío de correos.

## Funciones implementadas

- Presentación de la comercializadora y acceso al sistema con el logo original.
- Un administrador y tres vendedores iniciales. El administrador puede crear vendedores hasta un máximo de diez cuentas, desactivar cuentas y restablecer contraseñas.
- Correos internos con el formato exacto `usuario@triunfoensidergroup`. No necesitan buzón ni DNS; son identificadores internos.
- Cambio obligatorio de contraseña temporal, contraseñas con scrypt y salt, sesiones revocables de ocho horas en cookies HttpOnly/SameSite y Secure en producción. Límite persistente de diez intentos de acceso por cuenta en quince minutos.
- Venta de varios productos, cantidades y precios ingresados manualmente, subtotales automáticos, pago combinado efectivo/Yape/transferencia y deuda pendiente de cobro. Código de operación digital, detalle, fecha, hora de registro y usuario responsable.
- Descuento de stock atómico con bloqueo de filas. Reversión completa si falta stock. Identificadores únicos impiden aplicar dos veces la misma venta por reintento.
- Entradas con proveedor, cantidad, fecha, costo del pedido, modalidad contado/crédito, monto pagado y saldo.
- Gastos operativos y fijos con descripción, fecha, monto y usuario. Apertura física de caja única por fecha. Deudas manuales, depósitos y efectivo entregado.
- Cuenta corriente con ingresos manuales exclusivos del administrador, retiros con motivo, consolidación semanal y acumulado histórico.
- Inventarios y reportes diarios, semanales y mensuales, cantidades vendidas por producto y precio histórico, ingresos, egresos y caja. Exportación CSV compatible con Excel e impresión.
- Lista de productos exclusiva del administrador: stock, precio de venta, costo de compra, capital, inversión y ganancia potencial. Los vendedores disponen solo del selector operativo necesario para vender y registrar entradas, sin costos ni rentabilidad del catálogo.
- Auditoría de las operaciones y conservación de las entradas/ventas del Excel original como referencia.

## Base de datos recomendada

**PostgreSQL persistente**, alojado cerca de las funciones de Vercel. Puede ser administrado, por ejemplo Neon, o un servidor PostgreSQL propio. La autenticación permanece en nuestras tablas; contratar la base no exige integrar un servicio de autenticación.

Vercel aloja la aplicación y sus API; el disco de sus funciones no sirve como base de datos persistente compartida. PostgreSQL debe ejecutarse fuera de esas funciones. Si se usa un proveedor con endpoint de conexiones agrupadas, configurar ese endpoint en `DATABASE_URL`. El cliente utiliza hasta tres conexiones por instancia y el manejo de pool de `@vercel/functions`.

Documentación: [PostgreSQL en Vercel](https://vercel.com/docs/postgres), [conexiones y pooling](https://vercel.com/kb/guide/connection-pooling-with-functions).

## Desarrollo local

Requiere Node.js 22.13 o superior. En esta carpeta ya se preparó `.env.local` para una base PostgreSQL embebida de desarrollo mediante PGlite. Sus datos permanecen en `.local-db/`, fuera de Git. Esta modalidad se rechaza en producción y en Vercel.

```powershell
npm ci
npm run db:setup
npm run dev
```

Abrir `http://127.0.0.1:3000`. Las credenciales locales generadas están en `.work/accesos-locales.txt`, excluidas del repositorio. Si se clona el repositorio en otra máquina, crear `.env.local` con `LOCAL_DATABASE=true` y las cuatro variables `INITIAL_*_PASSWORD` del ejemplo, usando contraseñas diferentes de al menos doce caracteres.

No ejecutar dos procesos que abran el mismo directorio PGlite simultáneamente: detener el servidor antes de ejecutar `db:setup`. En producción se usa PostgreSQL real con conexiones independientes.

## Preparación y despliegue en Vercel

1. Crear una base PostgreSQL vacía y guardar su URL con TLS. Nunca subir la URL ni contraseñas a Git.
2. En una terminal local, configurar `DATABASE_URL` y `LOCAL_DATABASE=false`. Si existe `.env.local`, quitar de allí la configuración local o usar una copia con los valores de producción. Las variables ya presentes en el entorno tienen prioridad.
3. Definir cuatro contraseñas temporales distintas: `INITIAL_ADMIN_PASSWORD`, `INITIAL_SELLER_1_PASSWORD`, `INITIAL_SELLER_2_PASSWORD`, `INITIAL_SELLER_3_PASSWORD`. Mínimo doce caracteres. Ejecutar `npm run db:setup` una sola vez para preparar las tablas e importar el inventario. El proceso es transaccional e idempotente: repetirlo no reemplaza contraseñas, stock ni registros existentes.
4. Importar el repositorio `PoolDYer/TRIUNFO-ENSIDER-GROUP` en Vercel. Seleccionar Next.js, raíz del repositorio, instalación `npm ci`, construcción `npm run build`, Node.js 22 o 24.
5. En Vercel configurar únicamente `DATABASE_URL`, `LOCAL_DATABASE=false` y, opcionalmente, `APP_URL` con el origen HTTPS definitivo. No habilitar la base local. Las cuatro contraseñas de inicialización no son necesarias en el despliegue después de preparar la base.
6. Ubicar funciones y base en regiones cercanas. Desplegar e ingresar con las cuentas iniciales. Cada usuario deberá cambiar su contraseña antes de operar. El administrador puede recuperar el acceso de los vendedores desde Usuarios.
7. Ejecutar las pruebas de acceso y carga sobre el despliegue con la base definitiva. Activar las copias de seguridad del proveedor antes de comenzar a registrar operaciones reales.

No se crearon servicios de nube ni un despliegue Vercel: se requiere la cuenta y la conexión PostgreSQL del propietario. No hay contraseñas predeterminadas de producción en el código.

## Datos importados y decisiones confirmadas

Se leyó por completo `requisitos.docx` y todas las hojas de `ejmeplo.xlsx` e `inventario actual.xlsx`. Los archivos originales permanecen locales y se excluyen de Git; los datos de referencia necesarios se conservan en `data/initial-reference.json`.

Se importan siete productos, P001 a P007, con **420 unidades** y **S/ 4,340.00** de capital a precio de venta. P008 a P012 son filas vacías y no se crean como productos. No se inventan costos de compra: quedan nulos y la inversión y ganancia potencial se identifican como parciales hasta completarlos.

Según lo confirmado por el usuario, el stock de la lista actual es el saldo inicial definitivo. Las entradas históricas y las ventas sin fecha del archivo se muestran como referencia en Trazabilidad: no vuelven a incrementar/descontar existencias ni ingresan a caja.

La semana es de lunes a domingo, los meses son calendario y las fechas del negocio usan America/Lima. La fecha de operación se ingresa manualmente; la hora de registro se guarda aparte. Se admiten registros con fecha anterior o posterior a la actual.

## Reglas de cálculo

Todos los importes se almacenan como céntimos enteros. No se recalcula una venta antigua al cambiar el catálogo.

| Concepto                           | Cálculo                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Facturación de línea               | Cantidad × precio unitario registrado                                     |
| Efectivo cobrado en venta          | Facturación − pago digital − deuda de venta                               |
| Caja diaria según ejemplo          | Facturación − pagos digitales − gastos operativos − deudas                |
| Caja semanal/mensual según ejemplo | Facturación − pagos digitales − gastos operativos                         |
| Caja neta                          | Facturación − pagos digitales − gastos operativos − deudas − gastos fijos |
| Disponible calculado               | Aperturas registradas + caja neta − depósitos − entregas                  |
| Cuenta corriente semanal           | Suma de ingresos de la semana − suma de retiros de la semana              |
| Cuenta corriente acumulada         | Suma histórica de ingresos − retiros hasta el final del período           |
| Capital                            | Stock actual × precio unitario de venta                                   |
| Inversión                          | Stock actual × precio unitario de compra conocido                         |
| Ganancia potencial                 | Capital de productos con costo conocido − inversión correspondiente       |

El usuario confirmó mantener **ambas cajas** ante la discrepancia de la fórmula semanal del ejemplo, que muestra gastos fijos sin restarlos. El cálculo neto descuenta gastos fijos y deudas. La fórmula mensual extiende la agregación semanal.

La apertura representa efectivo físico inicial del día, no un ingreso. En una vista de varios días se muestra la suma de aperturas registradas, expresamente rotulada; no constituye un saldo arrastrado automáticamente. Si una deuda ya está asociada a una venta, no debe repetirse como deuda manual.

Los retiros se conservan aparte de los ingresos diarios: no se altera el ingreso registrado. Su descuento se aplica en la consolidación. Los Yapes de las ventas no se insertan automáticamente en cuenta corriente, para evitar duplicar movimientos manuales. Las compras registran costo y saldo del proveedor; si se pagan con efectivo de caja, registrar el egreso correspondiente en Gastos. El costo de catálogo se mantiene manualmente por el administrador.

Los registros operativos son históricos y no se eliminan desde la interfaz. La auditoría registra usuario, operación, referencia y hora. Los listados operativos muestran hasta 200 registros recientes del período; los totales y exportaciones consolidadas incluyen todas las operaciones. El consolidado bancario muestra las últimas 52 semanas con acumulado completo.

## Verificación

```powershell
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

Catorce pruebas de negocio cubren fórmulas del Excel, fechas, contraseñas, ventas transaccionales, reversión, historial de precios, duplicados, pagos inválidos, permisos, entradas, cuenta corriente, gastos, caja y máximo de cuentas. Incluyen diez intentos simultáneos de venta sobre stock limitado. Estas pruebas usan un motor PostgreSQL embebido y no sustituyen una prueba con múltiples conexiones PostgreSQL reales.

Se verificaron además por HTTP los flujos de autenticación, revocación, permisos de API, importación, ventas y reportes, origen de solicitudes y CSV; diez consultas simultáneas funcionaron en desarrollo local. Se revisó en navegador el panel, el registro de ventas y la actualización de existencias.

### Carga con usuarios reales en el despliegue

Crear un JSON **fuera del repositorio** con entre una y diez cuentas existentes: `[{"email":"usuario@triunfoensidergroup","password":"contraseña definitiva"}]`. No usar contraseñas temporales pendientes de cambio.

```powershell
$env:LOAD_TEST_URL='https://tu-sistema.vercel.app'
$env:LOAD_TEST_ACCOUNTS_FILE='C:/ruta-privada/cuentas-prueba.json'
node scripts/load-test.mjs
```

Ejecuta diez rondas de consultas simultáneas, informa errores y latencias P50/P95 y cierra sus sesiones. No modifica inventario ni caja. Comparar los resultados con métricas de Vercel y conexiones de la base antes de concluir que el despliegue soporta diez usuarios. Las pruebas locales no garantizan disponibilidad, tiempos de respuesta ni límites de un plan específico.
