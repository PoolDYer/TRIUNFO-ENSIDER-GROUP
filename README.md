# Triunfo Ensider Group

Sistema web administrativo de inventario, ventas y caja, preparado para Vercel con Next.js, TypeScript y PostgreSQL. Autenticación propia con correo y contraseña, sin proveedores externos de identidad ni envío de correos. La exportación a Google Sheets usa una conexión OAuth independiente, autorizada por el administrador.

## Funciones implementadas

- Presentación de la comercializadora y acceso al sistema con el logo original.
- Un administrador y tres vendedores iniciales. El administrador puede crear vendedores hasta un máximo de diez cuentas, desactivar cuentas, restablecer contraseñas y eliminar vendedores con confirmación. La eliminación cierra sus sesiones, libera el cupo y conserva el historial de sus operaciones. No se permite eliminar al administrador.
- Correos internos con el formato exacto `usuario@triunfoensidergroup`. No necesitan buzón ni DNS; son identificadores internos.
- Cambio obligatorio de contraseña temporal, contraseñas con scrypt y salt, sesiones revocables de ocho horas en cookies HttpOnly/SameSite y Secure en producción. Límite persistente de diez intentos de acceso por cuenta en quince minutos.
- Venta de varios productos, cantidades y precios ingresados manualmente, subtotales automáticos, pago combinado efectivo/Yape/transferencia y deuda pendiente de cobro. Código de operación digital, detalle, fecha, hora de registro y usuario responsable.
- Descuento de stock atómico con bloqueo de filas. Reversión completa si falta stock. Identificadores únicos impiden aplicar dos veces la misma venta por reintento.
- Entradas con proveedor, cantidad, fecha, costo del pedido, modalidad contado/crédito, monto pagado y saldo.
- Gastos operativos y fijos con descripción, fecha, monto y usuario. Apertura física de caja única por fecha. Deudas manuales, depósitos y efectivo entregado.
- Cuenta corriente con ingresos manuales exclusivos del administrador, retiros con motivo, consolidación semanal y acumulado histórico.
- Inventarios y reportes diarios, semanales y mensuales, cantidades vendidas por producto y precio histórico, ingresos, egresos y caja. Generación de enlaces a reportes en Google Sheets e impresión.
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

Al actualizar una instalación existente, ejecutar `npm run db:setup` antes de iniciar la nueva versión. La preparación aplica también la migración para eliminar vendedores conservando sus operaciones: añade la fecha de eliminación y permite reutilizar el correo en una cuenta nueva. No cambia las contraseñas ni los datos existentes.

## Preparación y despliegue en Vercel

1. Crear una base PostgreSQL vacía y guardar su URL con TLS. Nunca subir la URL ni contraseñas a Git.
2. En una terminal local, configurar `DATABASE_URL` y `LOCAL_DATABASE=false`. Si existe `.env.local`, quitar de allí la configuración local o usar una copia con los valores de producción. Las variables ya presentes en el entorno tienen prioridad.
3. Definir cuatro contraseñas temporales distintas: `INITIAL_ADMIN_PASSWORD`, `INITIAL_SELLER_1_PASSWORD`, `INITIAL_SELLER_2_PASSWORD`, `INITIAL_SELLER_3_PASSWORD`. Mínimo doce caracteres. Ejecutar `npm run db:setup` una sola vez para preparar las tablas e importar el inventario. El proceso es transaccional e idempotente: repetirlo no reemplaza contraseñas, stock ni registros existentes.
4. Importar el repositorio `PoolDYer/TRIUNFO-ENSIDER-GROUP` en Vercel. Seleccionar Next.js, raíz del repositorio, instalación `npm ci`, construcción `npm run build`, Node.js 22 o 24.
5. En Vercel configurar `DATABASE_URL`, `LOCAL_DATABASE=false` y, opcionalmente, `APP_URL` con el origen HTTPS definitivo. Para Google Sheets, añadir las cuatro variables `GOOGLE_*` descritas más abajo. No habilitar la base local. Las cuatro contraseñas de inicialización no son necesarias en el despliegue después de preparar la base.
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

Las pruebas de negocio cubren fórmulas del Excel, fechas, contraseñas, ventas transaccionales, reversión, historial de precios, duplicados, pagos inválidos, permisos, entradas, cuenta corriente, gastos, caja, máximo de cuentas y eliminación de vendedores con conservación del historial. Incluyen diez intentos simultáneos de venta sobre stock limitado. Estas pruebas usan un motor PostgreSQL embebido y no sustituyen una prueba con múltiples conexiones PostgreSQL reales.

Se verificaron además por HTTP los flujos de autenticación, revocación, permisos de API, importación, ventas y reportes, origen de solicitudes y exportaciones; diez consultas simultáneas funcionaron en desarrollo local. Se revisó en navegador el panel, el registro de ventas y la actualización de existencias.

### Carga con usuarios reales en el despliegue

Crear un JSON **fuera del repositorio** con entre una y diez cuentas existentes: `[{"email":"usuario@triunfoensidergroup","password":"contraseña definitiva"}]`. No usar contraseñas temporales pendientes de cambio.

```powershell
$env:LOAD_TEST_URL='https://tu-sistema.vercel.app'
$env:LOAD_TEST_ACCOUNTS_FILE='C:/ruta-privada/cuentas-prueba.json'
node scripts/load-test.mjs
```

Ejecuta diez rondas de consultas simultáneas, informa errores y latencias P50/P95 y cierra sus sesiones. No modifica inventario ni caja. Comparar los resultados con métricas de Vercel y conexiones de la base antes de concluir que el despliegue soporta diez usuarios. Las pruebas locales no garantizan disponibilidad, tiempos de respuesta ni límites de un plan específico.

## Configurar los enlaces a Google Sheets

El botón «Generar enlace a Google Sheets» sustituye la descarga CSV. Crea una copia del reporte del período seleccionado, con tres pestañas: Resumen financiero, Productos vendidos y Ventas por día. La hoja contiene importes numéricos con formato de soles, fechas y texto literal, sin ejecutar nombres de productos como fórmulas. La generación se audita y una solicitud repetida no vuelve a crear la misma hoja.

La aplicación está implementada, pero la creación de hojas reales requiere configurar un proyecto propio de Google y autorizar la cuenta del administrador. No se incluyen credenciales de Google en el repositorio. La ayuda está disponible dentro del sistema, para el administrador, en `/ayuda/google-sheets`.

1. Entrar en [Google Cloud Console](https://console.cloud.google.com/) con la cuenta del administrador y crear o seleccionar un proyecto.
2. En APIs y servicios, habilitar **Google Sheets API**.
3. En Google Auth Platform, configurar la aplicación, sus datos de contacto y audiencia. Con cuenta personal, seleccionar audiencia externa; en modo de prueba, añadir el correo Google del administrador como usuario de prueba.
4. Crear un cliente OAuth de tipo **Aplicación web**. Registrar exactamente `http://127.0.0.1:3000/api/google/callback` para desarrollo. Registrar también `https://TU-DOMINIO/api/google/callback` cuando exista el dominio definitivo en Vercel. Las direcciones localhost y 127.0.0.1 son diferentes: usar el mismo origen al abrir el sistema y al configurar el retorno.
5. Guardar el identificador y secreto del cliente en `.env.local` para desarrollo, o en las variables de Vercel para producción. No pegarlos en chats ni subir archivos de credenciales a Git.

```dotenv
GOOGLE_CLIENT_ID=identificador-del-cliente.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=secreto-del-cliente
GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=clave-base64-de-32-bytes
```

Para generar la clave de cifrado, ejecutar localmente el siguiente comando y guardar su resultado como `GOOGLE_TOKEN_ENCRYPTION_KEY`. Mantener la misma clave entre reinicios y despliegues; si se pierde o cambia, será necesario volver a conectar Google. En esta instalación local ya se generó y guardó una clave privada en `.env.local`.

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

6. Con el servidor local detenido, ejecutar `npm run db:setup` para añadir las tablas de conexión y reportes; volver a iniciar el servidor. La migración no modifica inventario, cuentas ni contraseñas.
7. Entrar como administrador. Abrir «Generar enlace a Google Sheets», pulsar **Conectar Google** y autorizar la cuenta donde se guardarán los reportes. Después seleccionar el período y pulsar **Generar enlace**.

El permiso solicitado es `drive.file`, limitado a archivos creados o utilizados con la aplicación. La biblioteca oficial de Google gestiona OAuth y la renovación del acceso; se comprueban estado, sesión, vencimiento y PKCE. El token de renovación se cifra con AES-256-GCM antes de almacenarlo y nunca se envía al navegador. No se guarda ninguna contraseña de Google.

Las hojas se crean con los permisos predeterminados de la cuenta conectada y no se hacen públicas automáticamente. Para que un vendedor pueda abrir el enlace, el administrador debe compartirlo desde Google Sheets con su cuenta de Google real. Los correos internos `@triunfoensidergroup` no son cuentas Google. Generar un enlace no equivale a conceder acceso público ni a mantener el reporte sincronizado. El catálogo de compra e inversión exclusivo del administrador no se incluye en estas exportaciones.

En modo de prueba de Google, la autorización offline puede vencer a los siete días; revisar el estado de publicación y los requisitos de Google para usar la conexión de manera estable. Ante una autorización revocada o vencida, el administrador puede conectar nuevamente la cuenta desde el mismo botón. Si Google no confirma la creación por un corte de red, revisar la cuenta conectada antes de iniciar una solicitud nueva.

Las pruebas automatizadas validan datos, cifrado, estados OAuth, errores, permisos por solicitud y duplicados usando respuestas simuladas de Google. La prueba con una cuenta real queda pendiente hasta configurar el cliente OAuth y autorizarlo. Referencias oficiales: [creación de hojas](https://developers.google.com/workspace/sheets/api/guides/create), [OAuth para servidores](https://developers.google.com/identity/protocols/oauth2/web-server), [permisos](https://developers.google.com/workspace/sheets/api/scopes).
