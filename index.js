// =============================================================
// index.js  (reemplaza al backend/index.js existente)
//
// Agrega Socket.IO y la arquitectura de chat sin eliminar
// las rutas ya existentes (/api/registro y /api/perfil/:id).
// =============================================================

require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcrypt");
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

// ── Envío de correos (verificación de correo institucional) ──────
// Se usa la API de Brevo (HTTPS) en vez de SMTP de Gmail, porque Railway
// bloquea las conexiones SMTP salientes en su plan gratuito. La API de
// Brevo funciona por HTTPS normal, así que no tiene ese problema.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function enviarCorreoOTP(correoDestino, codigo) {
  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "UTP+ Movil", email: process.env.EMAIL_USER },
      to: [{ email: correoDestino }],
      subject: "Tu código de verificación - UTP+ Movil",
      textContent: `Tu código de verificación es: ${codigo}\n\nExpira en 5 minutos. Si tú no solicitaste esto, ignora este correo.`,
    }),
  });

  if (!response.ok) {
    const detalle = await response.text();
    throw new Error(`Brevo respondió ${response.status}: ${detalle}`);
  }
}

// Correo institucional: u + 8 dígitos + @utp.edu.pe (mayúsculas o minúsculas)
const FORMATO_CORREO_UTP = /^u\d{8}@utp\.edu\.pe$/i;

// Guarda los códigos de verificación mientras el servidor sigue corriendo:
// correo -> { codigo, expira }. No necesita tabla en la BD porque son
// temporales (5 min) y de un solo uso.
const otpStore = new Map();

// ── Verificación de correo institucional (paso 1 del registro) ───

// Genera un código de 6 dígitos, lo guarda temporalmente y lo envía por correo.
app.post("/api/auth/enviar-codigo", async (req, res) => {
  const correo = (req.body.correo || "").trim().toLowerCase();

  if (!FORMATO_CORREO_UTP.test(correo)) {
    return res.status(400).json({
      success: false,
      error: "Ingresa tu correo institucional (ej. u12345678@utp.edu.pe)",
    });
  }

  try {
    const existente = await pool.query(
      `SELECT codigo_usu FROM usuarios WHERE LOWER(correo) = $1`,
      [correo]
    );
    if (existente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Ya existe una cuenta creada con ese correo. Inicia sesión en vez de crear una nueva.",
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }

  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  const expira = Date.now() + 5 * 60 * 1000; // 5 minutos
  otpStore.set(correo, { codigo, expira });

  try {
    await enviarCorreoOTP(correo, codigo);
    res.json({ success: true });
  } catch (err) {
    console.error("Error enviando correo:", err.message);
    otpStore.delete(correo);
    res.status(500).json({
      success: false,
      error: "No se pudo enviar el correo. Intenta de nuevo en un momento.",
    });
  }
});

// Confirma el código de 6 dígitos y devuelve el código de estudiante ya
// extraído del correo (la parte antes de la @), listo para crear la cuenta.
app.post("/api/auth/verificar-codigo", (req, res) => {
  const correo = (req.body.correo || "").trim().toLowerCase();
  const codigo = (req.body.codigo || "").trim();

  const guardado = otpStore.get(correo);

  if (!guardado) {
    return res.status(400).json({
      success: false,
      error: "Primero solicita un código para este correo",
    });
  }

  if (Date.now() > guardado.expira) {
    otpStore.delete(correo);
    return res.status(400).json({ success: false, error: "El código expiró, solicita uno nuevo" });
  }

  if (guardado.codigo !== codigo) {
    return res.status(400).json({ success: false, error: "Código incorrecto" });
  }

  otpStore.delete(correo); // se usa una sola vez

  res.json({
    success: true,
    correo,
    codigo_estudiante: correo.split("@")[0].toUpperCase(),
  });
});

// ── Rutas existentes (no se tocan) ──────────────────────────────
app.post("/api/registro", async (req, res) => {
  const { nombre_usuario, genero, intereses, carrera, ciclo, correo, password } = req.body;

  const cleanUser = (nombre_usuario || "").trim();
  const cleanCorreo = (correo || "").trim().toLowerCase();

  if (!cleanUser) {
    return res.status(400).json({
      success: false,
      error: "Falta el nombre de usuario",
    });
  }

  // Debe ser un correo institucional ya verificado por OTP (u12345678@utp.edu.pe)
  if (!FORMATO_CORREO_UTP.test(cleanCorreo)) {
    return res.status(400).json({
      success: false,
      error: "Falta verificar tu correo institucional",
    });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({
      success: false,
      error: "La contraseña debe tener al menos 6 caracteres",
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

    // 🔒 Un mismo correo institucional no puede tener dos cuentas
    const correoExistente = await client.query(
      `SELECT codigo_usu FROM usuarios WHERE LOWER(correo) = $1`,
      [cleanCorreo]
    );

    if (correoExistente.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        error: "Ya existe una cuenta creada con ese correo institucional.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

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
        cleanCorreo,
        passwordHash,
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
        p.intereses,
        p.bio,
        p.estado_actual,
        p.privado,
        p.foto_perfil
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

// Actualiza el perfil del usuario (nombre, bio, carrera, ciclo, genero, intereses, estado_actual, privado, foto_perfil)
app.put("/api/perfil/:id", async (req, res) => {
  const { username, bio, carrera, ciclo, genero, intereses, estado_actual, privado, foto_perfil } = req.body;
  const codigo_usu = req.params.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Actualizar username si se envió
    if (username && username.trim()) {
      // Verificar que no esté tomado por otro usuario
      const existente = await client.query(
        `SELECT codigo_usu FROM usuarios WHERE LOWER(username) = LOWER($1) AND codigo_usu != $2`,
        [username.trim(), codigo_usu]
      );
      if (existente.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          error: "Ese nombre de usuario ya está en uso. Elige otro.",
        });
      }
      await client.query(
        `UPDATE usuarios SET username = $1 WHERE codigo_usu = $2`,
        [username.trim(), codigo_usu]
      );
    }

    // Los intereses llegan como array desde EditarPerfil.jsx; los pasamos
    // a texto plano antes de guardar (si se guarda el array tal cual, se
    // corrompe un poco más cada vez que se vuelve a editar).
    const interesesTexto = Array.isArray(intereses) ? intereses.join(", ") : intereses;

    // Actualizar campos de perfil_usuario (upsert)
    await client.query(
      
      `
      INSERT INTO perfil_usuario (codigo_usu, bio, carrera, ciclo, genero, intereses, estado_actual, privado, foto_perfil)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (codigo_usu) DO UPDATE SET
        bio          = COALESCE(EXCLUDED.bio, perfil_usuario.bio),
        carrera      = COALESCE(EXCLUDED.carrera, perfil_usuario.carrera),
        ciclo        = COALESCE(EXCLUDED.ciclo, perfil_usuario.ciclo),
        genero       = COALESCE(EXCLUDED.genero, perfil_usuario.genero),
        intereses    = COALESCE(EXCLUDED.intereses, perfil_usuario.intereses),
        estado_actual= COALESCE(EXCLUDED.estado_actual, perfil_usuario.estado_actual),
        privado      = COALESCE(EXCLUDED.privado, perfil_usuario.privado),
        foto_perfil  = COALESCE(EXCLUDED.foto_perfil, perfil_usuario.foto_perfil)
      `,
      [
        codigo_usu,
        bio !== undefined ? bio : null,
        carrera !== undefined ? carrera : null,
        ciclo !== undefined ? ciclo : null,
        genero !== undefined ? genero : null,
        interesesTexto !== undefined ? interesesTexto : null,
        estado_actual !== undefined ? estado_actual : null,
        privado !== undefined ? privado : null,
        foto_perfil !== undefined ? foto_perfil : null,
      ]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
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

// Login real: código de estudiante + contraseña. El SSO de la UTP ya sirvió
// como filtro (solo estudiantes llegan hasta aquí); esta es la credencial
// que de verdad identifica la cuenta dentro de la app.
app.post("/api/auth/login", async (req, res) => {
  const { codigo_estudiante, password } = req.body;
  const cleanCodigo = (codigo_estudiante || "").trim().toLowerCase().replace(/@.*$/, "");
  const correoReconstruido = `${cleanCodigo}@utp.edu.pe`;

  if (!cleanCodigo || !password) {
    return res.status(400).json({
      success: false,
      error: "Ingresa tu código de estudiante y tu contraseña",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        u.codigo_usu,
        u.username,
        u.password_hash,
        p.carrera,
        p.ciclo,
        p.genero,
        p.intereses
      FROM usuarios u
      LEFT JOIN perfil_usuario p ON p.codigo_usu = u.codigo_usu
      WHERE LOWER(u.correo) = $1
      `,
      [correoReconstruido]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: "Código o contraseña incorrectos" });
    }

    const fila = result.rows[0];
    const coincide = await bcrypt.compare(password, fila.password_hash || "");

    if (!coincide) {
      return res.status(401).json({ success: false, error: "Código o contraseña incorrectos" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const dispositivo = req.headers["user-agent"] || null;
    const ip = req.ip || null;

    await pool.query(
      `
      INSERT INTO sesiones (codigo_usu, token, dispositivo, ip, fecha_expiracion, activo)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '90 days', true)
      `,
      [fila.codigo_usu, token, dispositivo, ip]
    );

    res.json({
      success: true,
      userId: fila.codigo_usu,
      nombre_usuario: fila.username,
      token,
      perfil: {
        codigo_usu: fila.codigo_usu,
        username: fila.username,
        carrera: fila.carrera,
        ciclo: fila.ciclo,
        genero: fila.genero,
        intereses: fila.intereses,
      },
    });
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
  .then(async (client) => {
    console.log("✅ Conectado a PostgreSQL/Supabase");
    try {
      await client.query(`
        ALTER TABLE perfil_usuario 
        ADD COLUMN IF NOT EXISTS bio TEXT,
        ADD COLUMN IF NOT EXISTS estado_actual TEXT,
        ADD COLUMN IF NOT EXISTS privado BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS foto_perfil TEXT;
      `);
      console.log("✅ Columnas de perfil_usuario verificadas/creadas");
    } catch (e) {
      console.warn("⚠️ No se pudieron crear las columnas adicionales:", e.message);
    } finally {
      client.release();
    }
  })
  .catch((err) => {
    console.error("❌ Error de conexión:", err.message);
  });
  
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  console.log(`Socket.IO listo en ws://localhost:${PORT}`);
});