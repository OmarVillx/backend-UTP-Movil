// =============================================================
// index.js  (reemplaza al backend/index.js existente)
//
// Agrega Socket.IO y la arquitectura de chat sin eliminar
// las rutas ya existentes (/api/registro y /api/perfil/:id).
// =============================================================

require("dotenv").config();
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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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
        nombre_usuario,
        "",
        nombre_usuario,
        `${nombre_usuario}@utpmovil.local`,
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

    await client.query("COMMIT");

    res.json({
      success: true,
      userId: codigo_usu,
    });

  } catch (err) {

    await client.query("ROLLBACK");

    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });

  } finally {

    client.release();

  }
});

app.get("/api/perfil/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length) {
      res.json({ success: true, perfil: result.rows[0] });
    } else {
      res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }
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