# Despliegue en Vercel con Supabase

La aplicación local utiliza ya PostgreSQL de Supabase. Se transfirieron y verificaron las 19 tablas; el respaldo previo y el informe por tabla permanecen en `.work/backups`. Las cuentas y contraseñas existentes se conservaron. No ejecutar `db:setup` para esta instalación: no debe reimportarse el inventario original.

## Publicar el código

Subir a GitHub los commits de esta versión antes de importar o actualizar el proyecto en Vercel. Hay cambios locales anteriores que deben revisarse e incluirse en sus commits antes de publicar si se desea que aparezcan en producción; el despliegue de GitHub solo usa lo confirmado y subido. No subir `.work`, `.local-db`, `.env*` ni archivos de credenciales.

## Configurar Vercel

1. Importar `PoolDYer/TRIUNFO-ENSIDER-GROUP` y seleccionar la rama `main`.
2. Raíz del proyecto: la del repositorio. Framework: Next.js. Node.js: 24.x. Instalación: `npm ci`. Construcción: `npm run build`. `vercel.json` contiene estos comandos.
3. En **Settings > Environment Variables**, añadir las variables de `.work/variables-vercel.json`. Ese archivo contiene valores privados preparados para copiar manualmente; no es un archivo público ni debe subirse. Aplicarlos a Production. Usar otra base o rama de base para previews que puedan modificar datos.
4. La base actual está en `us-east-1`; `vercel.json` configura las funciones en `iad1` (Washington, D. C.) para acercarlas a Supabase. Si se cambia la región de la base, revisar también esa configuración. La conexión de la aplicación debe utilizar Transaction pooler, puerto 6543. El pool del servidor usa una conexión por instancia y verifica el certificado TLS mediante `DATABASE_SSL_CA`.
5. Desplegar. No ejecutar tareas de inicialización ni transferencia desde el comando de construcción.

## Completar la dirección pública y Google Sheets

Con el dominio HTTPS definitivo, añadir en Vercel:

```text
APP_URL=https://TU-DOMINIO
GOOGLE_REDIRECT_URI=https://TU-DOMINIO/api/google/callback
```

En Google Cloud, registrar exactamente esa URI como redirección autorizada del cliente OAuth existente. Redesplegar tras cambiar las variables. La exportación de Google Sheets necesita estos pasos; conservar `GOOGLE_TOKEN_ENCRYPTION_KEY` permite leer la conexión que se transfirió. El entorno local conserva su callback en `http://127.0.0.1:3000/api/google/callback`.

Al compartir base, las operaciones realizadas desde el servidor local también aparecen en producción. Las credenciales de Google deben pertenecer al mismo cliente si se mantiene una sola conexión de Google en esa base.

## Verificación posterior

Comprobar entrada como Dueño y Administrador, permisos, stock y reportes. Luego verificar una venta, entrada, gasto y pago controlados, con sus efectos en stock, caja y ganancias. No registrar movimientos ficticios sin identificarlos y retirarlos mediante las funciones de la aplicación.

Las pruebas de código y de conexión previas no equivalen a una prueba de carga del despliegue. Para medir concurrencia real, utilizar `scripts/load-test.mjs` con cuentas activas y contraseñas definitivas, guardadas fuera de Git. El sistema mantiene su límite de diez cuentas.

La base gratuita puede pausarse tras inactividad y tiene cuotas. La contratación y elegibilidad del plan de Vercel se revisan por separado; no se ha contratado ningún plan ni publicado un despliegue automáticamente.
