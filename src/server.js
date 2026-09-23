const path = require('node:path');
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);

const databaseConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise;

function getDatabasePool() {
  if (!databaseConfig.user || !databaseConfig.password || !databaseConfig.server || !databaseConfig.database) {
    throw new Error('Faltan variables de conexión a SQL Server en el archivo .env.');
  }

  if (!poolPromise) {
    poolPromise = sql.connect(databaseConfig).catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }

  return poolPromise;
}

function validateRegistration(body) {
  const maestro = body?.maestro || {};
  const detalle = body?.detalle;
  const carnet = String(maestro.carnet || '').trim();
  const nombre = String(maestro.nombre || '').trim();
  const correo = String(maestro.correo || '').trim();
  const errors = {};

  if (!carnet) errors.carnet = 'El carnet es obligatorio.';
  if (!nombre || nombre.length < 3) errors.nombre = 'El nombre debe tener al menos 3 caracteres.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    errors.correo = 'Ingresa un correo válido.';
  }
  if (!Array.isArray(detalle) || detalle.length === 0) {
    errors.detalle = 'Debes enviar al menos una misión.';
  }

  const normalizedDetails = Array.isArray(detalle)
    ? detalle.map((item) => ({
        misionId: Number(item?.misionId),
        estado: item?.estado
      }))
    : [];
  const ids = new Set();

  normalizedDetails.forEach((item, index) => {
    if (!Number.isInteger(item.misionId) || item.misionId < 1) {
      errors[`detalle[${index}].misionId`] = 'El misionId debe ser un entero positivo.';
    }
    if (typeof item.estado !== 'boolean') {
      errors[`detalle[${index}].estado`] = 'El estado debe ser true o false.';
    }
    if (ids.has(item.misionId)) {
      errors[`detalle[${index}].misionId`] = 'No puedes repetir una misión en el mismo envío.';
    }
    ids.add(item.misionId);
  });

  return {
    errors,
    data: {
      maestro: { carnet, nombre, correo },
      detalle: normalizedDetails
    }
  };
}

async function findMission(transaction, missionId) {
  return new sql.Request(transaction)
    .input('MisionID', sql.Int, missionId)
    .query('SELECT MisionID, Nombre AS MisionNombre FROM Misiones WHERE MisionID = @MisionID');
}

async function saveRegistration(data) {
  const pool = await getDatabasePool();
  const transaction = new sql.Transaction(pool);
  let studentCreated = false;

  try {
    await transaction.begin();

    const studentResult = await new sql.Request(transaction)
      .input('Carnet', sql.VarChar(50), data.maestro.carnet)
      .query('SELECT Carnet FROM Estudiantes WHERE Carnet = @Carnet');

    if (studentResult.recordset.length === 0) {
      await new sql.Request(transaction)
        .input('Carnet', sql.VarChar(50), data.maestro.carnet)
        .input('Nombre', sql.NVarChar(150), data.maestro.nombre)
        .input('Correo', sql.VarChar(150), data.maestro.correo)
        .query(`
          INSERT INTO Estudiantes (Carnet, Nombre, Correo)
          VALUES (@Carnet, @Nombre, @Correo)
        `);
      studentCreated = true;
    } else {
      await new sql.Request(transaction)
        .input('Carnet', sql.VarChar(50), data.maestro.carnet)
        .input('Nombre', sql.NVarChar(150), data.maestro.nombre)
        .input('Correo', sql.VarChar(150), data.maestro.correo)
        .query(`
          UPDATE Estudiantes
          SET Nombre = @Nombre, Correo = @Correo
          WHERE Carnet = @Carnet
        `);
    }

    for (const item of data.detalle) {
      const missionResult = await findMission(transaction, item.misionId);
      if (missionResult.recordset.length === 0) {
        const error = new Error(`La misión ${item.misionId} no existe en el catálogo.`);
        error.code = 'MISSION_NOT_FOUND';
        error.misionId = item.misionId;
        throw error;
      }

      const relationResult = await new sql.Request(transaction)
        .input('Carnet', sql.VarChar(50), data.maestro.carnet)
        .input('MisionID', sql.Int, item.misionId)
        .query(`
          SELECT Carnet
          FROM EstudianteMisiones
          WHERE Carnet = @Carnet AND MisionID = @MisionID
        `);

      if (relationResult.recordset.length === 0) {
        await new sql.Request(transaction)
          .input('Carnet', sql.VarChar(50), data.maestro.carnet)
          .input('MisionID', sql.Int, item.misionId)
          .input('Estado', sql.Bit, item.estado)
          .query(`
            INSERT INTO EstudianteMisiones (Carnet, MisionID, Estado)
            VALUES (@Carnet, @MisionID, @Estado)
          `);
      } else {
        await new sql.Request(transaction)
          .input('Carnet', sql.VarChar(50), data.maestro.carnet)
          .input('MisionID', sql.Int, item.misionId)
          .input('Estado', sql.Bit, item.estado)
          .query(`
            UPDATE EstudianteMisiones
            SET Estado = @Estado
            WHERE Carnet = @Carnet AND MisionID = @MisionID
          `);
      }
    }

    await transaction.commit();
    return { studentCreated };
  } catch (error) {
    if (transaction._aborted !== true) {
      await transaction.rollback().catch(() => {});
    }
    throw error;
  }
}

async function getDashboard() {
  const pool = await getDatabasePool();
  const studentsResult = await pool.request().query(`
    SELECT
      e.Carnet,
      e.Nombre,
      e.Correo,
      SUM(CASE WHEN em.Estado = 1 THEN 1 ELSE 0 END) AS MisionesCompletadas,
      COUNT(m.MisionID) AS TotalMisiones,
      CAST(
        SUM(CASE WHEN em.Estado = 1 THEN 1 ELSE 0 END) * 100.0
        / NULLIF(COUNT(m.MisionID), 0)
        AS DECIMAL(5, 2)
      ) AS PorcentajeAvance
    FROM Estudiantes e
    CROSS JOIN Misiones m
    LEFT JOIN EstudianteMisiones em
      ON em.Carnet = e.Carnet AND em.MisionID = m.MisionID
    GROUP BY e.Carnet, e.Nombre, e.Correo
    ORDER BY e.Nombre
  `);
  const detailsResult = await pool.request().query(`
    SELECT
      em.Carnet,
      em.MisionID,
      m.Nombre AS MisionNombre,
      CAST(em.Estado AS BIT) AS Estado
    FROM EstudianteMisiones em
    INNER JOIN Misiones m ON m.MisionID = em.MisionID
    ORDER BY em.Carnet, em.MisionID
  `);

  return {
    estudiantes: studentsResult.recordset,
    detalles: detailsResult.recordset
  };
}

app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', async (req, res) => {
  try {
    const pool = await getDatabasePool();
    await pool.request().query('SELECT 1 AS ok');
    return res.json({ ok: true, service: 'sistema-misiones-umg', database: 'connected' });
  } catch (error) {
    return res.status(503).json({ ok: false, service: 'sistema-misiones-umg', database: 'unavailable', detail: error.message });
  }
});

app.get('/api/misiones', async (req, res) => {
  try {
    const pool = await getDatabasePool();
    const result = await pool.request().query(`
      SELECT MisionID, Nombre AS MisionNombre
      FROM Misiones
      ORDER BY MisionID
    `);
    return res.json(result.recordset);
  } catch (error) {
    return res.status(503).json({ error: 'No se pudo consultar el catálogo de misiones.', detail: error.message });
  }
});

app.get('/api/estudiantes', async (req, res) => {
  try {
    return res.json(await getDashboard());
  } catch (error) {
    return res.status(503).json({ error: 'No se pudo consultar a los estudiantes.', detail: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    return res.json(await getDashboard());
  } catch (error) {
    return res.status(503).json({ error: 'No se pudo consultar el tablero.', detail: error.message });
  }
});

app.post('/api/registro', async (req, res) => {
  const { errors, data } = validateRegistration(req.body || {});

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Datos inválidos.', fields: errors });
  }

  try {
    const result = await saveRegistration(data);
    return res.status(result.studentCreated ? 201 : 200).json({
      message: result.studentCreated ? 'Estudiante y misiones registrados.' : 'Estudiante y misiones actualizados.',
      maestro: data.maestro,
      detalle: data.detalle
    });
  } catch (error) {
    if (error.code === 'MISSION_NOT_FOUND') {
      return res.status(422).json({ error: error.message, misionId: error.misionId });
    }
    return res.status(503).json({ error: 'No se pudo guardar el registro en SQL Server.', detail: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Servidor ejecutándose en http://localhost:${port}`);
  console.log(`Base de datos configurada: ${databaseConfig.server || '(sin configurar)'}`);
});
