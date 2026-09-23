# Sistema de Misiones UMG

Aplicación web para registrar misiones y consultar el avance de estudiantes.

## Misión 1: Crear API

La API está construida con Node.js, Express y `mssql`. Se conecta directamente a SQL Server y procesa el JSON maestro-detalle dentro de una transacción.

### Rutas

- `GET /api/health`: verifica que la API local esté activa.
- `GET /api/misiones`: consulta el catálogo de misiones.
- `GET /api/estudiantes`: lista estudiantes y sus misiones.
- `GET /api/dashboard`: devuelve estudiantes, detalles y porcentajes.
- `POST /api/registro`: inserta o actualiza el maestro y su detalle.

El cuerpo esperado para registrar una misión es:

```json
{
  "maestro": {
    "carnet": "1890-23-7082",
    "nombre": "Gerson Giovanni Orellana Véliz",
    "correo": "gorellanav1@miumg.edu.gt"
  },
  "detalle": [
    { "misionId": 1, "estado": true },
    { "misionId": 2, "estado": false }
  ]
}
```

## Ejecutar localmente

Requisitos: Node.js 18 o superior.

```bash
npm install
copy .env.example .env
npm run dev
```

Luego abrir `http://localhost:3000`.

En PowerShell, `copy .env.example .env` también puede reemplazarse por `Copy-Item .env.example .env`.

Completa en `.env` las variables de SQL Server. El archivo `.env` está excluido de Git para no publicar la contraseña.

## Reglas de registro

- Si el carnet no existe, se inserta en `Estudiantes`.
- Si el carnet existe, se actualizan nombre y correo.
- Cada misión se valida contra `Misiones`.
- El detalle se inserta o actualiza en `EstudianteMisiones`.
- Si una misión no existe, se devuelve `422` y se revierte toda la transacción.

## Publicación

El proyecto incluye `Dockerfile` y `render.yaml` para publicarlo como un servicio web completo en Render. El servicio necesita configurar en el panel de hosting los secretos `DB_USER` y `DB_PASSWORD`; no deben escribirse en GitHub.

Después del despliegue, la aplicación quedará disponible en una URL similar a:

```text
https://sistema-misiones-umg.onrender.com
```

La ruta `/api/health` se usa como comprobación de disponibilidad y conexión con SQL Server.
