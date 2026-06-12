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
  try {
    const result = await pool.query(
      `INSERT INTO usuarios (nombre_usuario, genero, intereses, carrera, ciclo)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [nombre_usuario, genero, intereses, carrera, ciclo]
    );
    res.json({ success: true, userId: result.rows[0].id });
  } catch (err) {
    console.error("Error registro:", err);
    res.status(500).json({ success: false, error: err.message });
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
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  console.log(`Socket.IO listo en ws://localhost:${PORT}`);
});
