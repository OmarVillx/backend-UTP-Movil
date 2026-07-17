// =============================================================
// index.js  (reemplaza al backend/index.js existente)
//
// Agrega Socket.IO y la arquitectura de chat sin eliminar
// las rutas ya existentes (/api/registro y /api/perfil/:id).
// =============================================================

require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const cors = require("cors");

const chatRoutes = require("./routes/chatRoutes");
const registrarSocketsChat = require("./sockets/chatSocket");

const app = express();
const server = http.createServer(app);  // ← http.Server para Socket.IO

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

// ── Pool de BD (se activa cuando DATABASE_URL esté configurado) ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ── Rutas existentes (no se tocan) ──────────────────────────────
app.post("/api/registro", async (req, res) => {
  const { nombre_usuario, genero, intereses, carrera, ciclo } = req.body;

  const cleanUser = (nombre_usuario || "").trim();

  if (!cleanUser) {
    return res.status(400).json({
      success: false,
      error: "Falta el nombre de usuario",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔒 Nadie puede reservar un @usuario que ya existe (sin importar mayúsculas)
    const existente = await client.query(
      `SELECT codigo_usu FROM usuarios WHERE LOWER(username) = LOWER($1)`,
      [cleanUser]
    );

    if (existente.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        error: "Ese nombre de usuario ya está en uso. Elige otro.",
      });
    }

    const usuario = await client.query(
      `
      INSERT INTO usuarios
      (
        id_rol,
        nombre,
        apellido,
        username,
        correo,
        password_hash,
        verificado,
        estado,
        fecha_registro
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      RETURNING codigo_usu
      `,
      [
        1, // Usuario normal
        cleanUser,
        "",
        cleanUser,
        `${cleanUser}@utpmovil.local`,
        "",
        true,
        "activo",
      ]
    );

    const codigo_usu = usuario.rows[0].codigo_usu;

    await client.query(
      `
      INSERT INTO perfil_usuario
      (
        codigo_usu,
        carrera,
        ciclo,
        genero,
        intereses
      )
      VALUES
      ($1,$2,$3,$4,$5)
      `,
      [
        codigo_usu,
        carrera,
        ciclo,
        genero,
        intereses,
      ]
    );

    // Agregar automáticamente al usuario nuevo a los grupos por defecto
    const gruposPorDefecto = [4, 5, 6, 7]; // General UTP+, Ing. Sistemas, Gamers UTP, Memes UTP
    for (const idGrupo of gruposPorDefecto) {
      await client.query(
        `
        INSERT INTO participantes_chat (id_chat, codigo_usu)
        VALUES ($1, $2)
        `,
        [idGrupo, codigo_usu]
      );
    }

    // ── Crear la sesión de este dispositivo (tabla "sesiones") ──────
    const token = crypto.randomBytes(32).toString("hex");
    const dispositivo = req.headers["user-agent"] || null;
    const ip = req.ip || null;

    await client.query(
      `
      INSERT INTO sesiones (codigo_usu, token, dispositivo, ip, fecha_expiracion, activo)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '90 days', true)
      `,
      [codigo_usu, token, dispositivo, ip]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      userId: codigo_usu,
      nombre_usuario: cleanUser,
      token,
    });

  } catch (err) {

    await client.query("ROLLBACK");

    console.error(err);

    // Red de seguridad: si dos personas se registran al mismo tiempo con
    // el mismo @usuario, el índice único de la BD corta la carrera.
    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Ese nombre de usuario ya está en uso. Elige otro.",
      });
    }

    res.status(500).json({
      success: false,
      error: err.message,
    });

  } finally {

    client.release();

  }
});

// Devuelve el perfil completo (usuarios + perfil_usuario) de un codigo_usu.
// La app la usa para (a) mostrar el perfil y (b) confirmar, al reabrir la
// app, que la sesión guardada en el celular todavía existe en la BD.
app.get("/api/perfil/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        u.codigo_usu,
        u.username,
        u.estado,
        u.fecha_registro,
        p.carrera,
        p.ciclo,
        p.genero,
        p.intereses
      FROM usuarios u
      LEFT JOIN perfil_usuario p ON p.codigo_usu = u.codigo_usu
      WHERE u.codigo_usu = $1
      `,
      [req.params.id]
    );
    if (result.rows.length) {
      res.json({ success: true, perfil: result.rows[0] });
    } else {
      res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Confirma si un token guardado en el celular sigue siendo una sesión
// válida (existe, está activo=true y no venció) y devuelve el usuario.
app.post("/api/sesion/verificar", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: "Falta el token" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        u.codigo_usu,
        u.username,
        p.carrera,
        p.ciclo,
        p.genero,
        p.intereses
      FROM sesiones s
      JOIN usuarios u ON u.codigo_usu = s.codigo_usu
      LEFT JOIN perfil_usuario p ON p.codigo_usu = u.codigo_usu
      WHERE s.token = $1
        AND s.activo = true
        AND (s.fecha_expiracion IS NULL OR s.fecha_expiracion > NOW())
      `,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: "Sesión inválida o expirada" });
    }

    res.json({ success: true, perfil: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cierra la sesión de este dispositivo (no borra la cuenta, solo el token).
app.post("/api/sesion/cerrar", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: "Falta el token" });
  }

  try {
    await pool.query(`UPDATE sesiones SET activo = false WHERE token = $1`, [token]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Rutas nuevas del chat ────────────────────────────────────────
app.use("/api", chatRoutes);

// ── Eventos Socket.IO ────────────────────────────────────────────
registrarSocketsChat(io);

// ── Ruta de salud (útil para verificar que el server corre) ─────
app.get("/health", (_, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;

pool.connect()
  .then(() => {
    console.log("✅ Conectado a PostgreSQL/Supabase");
  })
  .catch((err) => {
    console.error("❌ Error de conexión:", err.message);
  });
  
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  console.log(`Socket.IO listo en ws://localhost:${PORT}`);
});