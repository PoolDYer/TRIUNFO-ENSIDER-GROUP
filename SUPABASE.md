# Supabase y Vercel

Usaremos únicamente PostgreSQL de Supabase. Los correos, contraseñas y roles Dueño/Administrador siguen gestionándose en la aplicación. No hacen falta Supabase Auth, claves públicas ni el SDK de Supabase.

## Crear el proyecto

1. En [Supabase](https://supabase.com/dashboard), crear un proyecto en el plan Free. Elegir una región cercana a las funciones que se usarán en Vercel, preferiblemente ambas en Sudamérica si están disponibles.
2. Guardar la contraseña de la base en un gestor de contraseñas y esperar a que el proyecto termine de iniciar.
3. Pulsar **Connect > Transaction pooler**. Copiar la URI completa al campo `DATABASE_URL` de `.env.supabase.local`, en la raíz del proyecto. Sustituir `[YOUR-PASSWORD]` por la contraseña real; codificar sus caracteres especiales para una URL. Añadir `?sslmode=require` si la URI no tiene parámetros. Este archivo está excluido de Git y no sustituye `.env.local`.
4. Ejecutar `npm run db:supabase:check`. Este comando solo comprueba la conexión y el rol de base; no crea cuentas ni modifica datos.
5. En la configuración de Data API de Supabase, desactivar la Data API si no se va a utilizar. La aplicación se conecta directamente desde su servidor.

Si la verificación TLS solicita una CA, descargar el certificado oficial de **Database Settings > SSL Configuration** y guardarlo como `.work/supabase-ca.crt`. Los comandos de comprobación y preparación lo detectan automáticamente. También aceptan `DATABASE_SSL_CA_FILE` en el archivo privado para otra ruta, o `DATABASE_SSL_CA` con el contenido PEM. En Vercel configurar `DATABASE_SSL_CA` con el contenido completo del certificado. La verificación del certificado y del nombre del servidor permanece activa.

No compartir la URI, la contraseña ni el contenido del archivo por chat. No usar una clave `anon` o `service_role` como contraseña PostgreSQL.

## Preparar las tablas

Para esta operación, colocar temporalmente en `.env.supabase.local` la URI de **Connect > Session pooler**, puerto **5432**. Luego ejecutar:

```powershell
npm run db:supabase:prepare
```

El comando aplica el esquema y protege sus tablas dentro de una transacción: activa RLS y revoca acceso a `anon`, `authenticated` y `PUBLIC`. Solo afecta las tablas propias de este sistema. El backend se conecta como `postgres`, cuyo acceso privado se comprueba antes. No crea políticas públicas ni modifica las tablas de Auth o Storage. Se puede repetir sin borrar información. Repetirlo también tras futuras actualizaciones que creen tablas.

**Este comando no transfiere el inventario local ni crea usuarios.** La transferencia debe conservar cuentas, contraseñas cifradas, stock actual, ventas, entradas, gastos, financiamientos, pagos e historial. Antes se detendrá el servidor local y se respaldará `.local-db`. No ejecutar `db:setup` sobre la base nueva para sustituir esa transferencia: importaría los datos iniciales del Excel y no los registros actuales.

La aplicación continúa utilizando su base local hasta completar y verificar esa migración. No borrar `.local-db` ni cambiar `LOCAL_DATABASE` en `.env.local` anticipadamente.

## Variables en Vercel

Después de transferir y verificar los datos:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | URI de **Transaction pooler**, puerto **6543**, con `sslmode=require` |
| `LOCAL_DATABASE` | `false` |
| `APP_URL` | Origen HTTPS definitivo, sin barra final |
| `GOOGLE_CLIENT_ID` | Cliente OAuth actual |
| `GOOGLE_CLIENT_SECRET` | Secreto OAuth actual |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | La misma clave local si se conserva la conexión de Google |
| `GOOGLE_REDIRECT_URI` | `https://TU-DOMINIO/api/google/callback` |

Registrar esa URI HTTPS también en Google Cloud. No exponer ninguna credencial de base mediante variables `NEXT_PUBLIC_*`. `.env.supabase.local` es solo un archivo de trabajo local; Vercel usa sus variables de entorno.

El cliente conserva un pool global por instancia y limita a una conexión por instancia para Supabase. Las consultas de `pg` no utilizan sentencias preparadas con nombre, compatibles con Transaction pooler. El número de conexiones por instancia no es el límite de usuarios: varias peticiones pueden esperar y reutilizar esa conexión.

Antes de operar: comprobar inicio de sesión de ambos roles, restricciones de acceso, registro de venta y entrada, actualización del stock, gastos, pagos de financiamiento, notificaciones, reportes y Google Sheets; después realizar la prueba de carga sobre la base y despliegue definitivos.

Free no garantiza disponibilidad permanente: Supabase puede pausar proyectos tras una semana de inactividad y aplica límites de almacenamiento y recursos. Las copias de seguridad y el coste de Vercel deben revisarse por separado. No se han contratado planes ni creado servicios de pago.

Fuentes: [conexiones y pooler](https://supabase.com/docs/guides/database/connecting-to-postgres), [seguridad de la API](https://supabase.com/docs/guides/api/securing-your-api), [planes](https://supabase.com/pricing).
