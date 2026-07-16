const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ─────────────────────────────────────────────────────────────
// REPORTES (en memoria por ahora)
// ─────────────────────────────────────────────────────────────
const reportes = new Map();

function reportarMensaje(msgId, chatId) {
  const key = `${chatId}_${msgId}`;
  const actual = (reportes.get(key) || 0) + 1;
  reportes.set(key, actual);
  return { eliminado: actual >= 5, reportes: actual };
}

// ─────────────────────────────────────────────────────────────
// CHATS / CONTACTOS
// ─────────────────────────────────────────────────────────────
async function getChatsDeUsuario(userId) {
  const res = await pool.query(
    `SELECT 
      c.id_chat AS id,
      CASE 
        WHEN c.tipo_chat = 'privado' THEN u2.username
        ELSE c.nombre
      END AS nombre,
      CASE 
        WHEN c.tipo_chat = 'privado' THEN 'amigo'
        ELSE 'grupo'
      END AS tipo,
      COALESCE(u2.estado, 'Ausente') AS estado,
      0 AS "mensajesNoLeidos"
    FROM participantes_chat pc
    JOIN chats c ON c.id_chat = pc.id_chat
    LEFT JOIN chats_privados cp ON cp.id_chat = c.id_chat
    LEFT JOIN usuarios u2 ON (
      u2.codigo_usu = cp.id_usuario_1 AND cp.id_usuario_1 != $1
      OR
      u2.codigo_usu = cp.id_usuario_2 AND cp.id_usuario_2 != $1
    )
    WHERE pc.codigo_usu = $1 AND pc.estado = 'activo'`,
    [userId]
  );
  return res.rows;
}

// ─────────────────────────────────────────────────────────────
// MENSAJES
// ─────────────────────────────────────────────────────────────
async function getMensajes(chatId) {
  const res = await pool.query(
    `SELECT 
      m.id_mensaje AS id,
      m.id_chat AS "chatId",
      m.contenido AS texto,
      TO_CHAR(m.fecha_envio, 'HH12:MI AM') AS hora,
      m.codigo_usu AS "remitenteId",
      u.username AS remitente,
      m.eliminado,
      false AS mio
    FROM mensajes m
    JOIN usuarios u ON u.codigo_usu = m.codigo_usu
    WHERE m.id_chat = $1
    ORDER BY m.fecha_envio ASC
    LIMIT 50`,
    [chatId]
  );
  return res.rows;
}

async function guardarMensaje({ chatId, texto, remitenteId, remitente }) {
  const res = await pool.query(
    `INSERT INTO mensajes (id_chat, codigo_usu, contenido, tipo_mensaje)
     VALUES ($1, $2, $3, 'texto')
     RETURNING id_mensaje AS id, id_chat AS "chatId", contenido AS texto,
               TO_CHAR(fecha_envio, 'HH12:MI AM') AS hora, codigo_usu AS "remitenteId"`,
    [chatId, remitenteId, texto]
  );
  const msg = res.rows[0];
  return {
    ...msg,
    remitente: remitente || "Usuario",
    mio: false,
    eliminado: false,
  };
}

// ─────────────────────────────────────────────────────────────
// BÚSQUEDA DE USUARIOS
// ─────────────────────────────────────────────────────────────
async function buscarUsuarios(query) {
  const res = await pool.query(
    `SELECT codigo_usu AS id, username, estado
     FROM usuarios
     WHERE LOWER(username) LIKE $1
     LIMIT 20`,
    [`%${(query || "").toLowerCase()}%`]
  );
  return res.rows;
}

// ─────────────────────────────────────────────────────────────
// PRESENCIA
// ─────────────────────────────────────────────────────────────
async function actualizarPresencia(userId, estado) {
  await pool.query(
    `UPDATE usuarios SET ultima_conexion = NOW(), estado = $1 WHERE codigo_usu = $2`,
    [estado === "En línea" ? "activo" : "inactivo", userId]
  );
}

module.exports = {
  getChatsDeUsuario,
  getMensajes,
  guardarMensaje,
  buscarUsuarios,
  actualizarPresencia,
  reportarMensaje,
};