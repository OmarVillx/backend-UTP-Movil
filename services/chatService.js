// =============================================================
// services/chatService.js
//
// ★ ESTE ES EL ÚNICO ARCHIVO QUE CAMBIA CUANDO LA BD ESTÉ LISTA ★
//
// Fase 1 (ahora):   devuelve datos del mock
// Fase 2 (con BD):  reemplaza cada función con la query SQL
//                   sin tocar controladores, sockets ni frontend
// =============================================================

const mock = require("../mock/mockData");

// ── Para habilitar la BD cuando esté lista, descomenta estas líneas
// y comenta las líneas que usan `mock` dentro de cada función:
// const { Pool } = require("pg");
// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ─────────────────────────────────────────────────────────────
// CHATS / CONTACTOS
// ─────────────────────────────────────────────────────────────

/**
 * Devuelve todos los chats (amigos + grupos) de un usuario.
 * @param {string|number} userId
 * @returns {Promise<Array>}
 */
async function getChatsDeUsuario(userId) {
  // ── FASE 1: mock ──────────────────────────────────────────
  return mock.contactos;

  // ── FASE 2: descomentar cuando la BD esté lista ───────────
  // const res = await pool.query(
  //   `SELECT c.id, c.nombre, c.tipo,
  //           u.nombre_usuario AS nombre, u.avatar,
  //           (SELECT COUNT(*) FROM mensajes_vistos mv
  //            WHERE mv.chat_id = c.id AND mv.usuario_id != $1
  //              AND mv.visto = false) AS mensajesNoLeidos,
  //           (SELECT estado FROM usuarios WHERE id = $1) AS estado
  //    FROM chats c
  //    JOIN participantes_chat p ON p.chat_id = c.id
  //    LEFT JOIN usuarios u ON u.id = p.usuario_id AND u.id != $1
  //    WHERE p.usuario_id = $1`,
  //   [userId]
  // );
  // return res.rows;
}

// ─────────────────────────────────────────────────────────────
// MENSAJES
// ─────────────────────────────────────────────────────────────

/**
 * Devuelve los mensajes de un chat específico.
 * @param {string|number} chatId
 * @returns {Promise<Array>}
 */
async function getMensajes(chatId) {
  // ── FASE 1: mock ──────────────────────────────────────────
  return mock.conversaciones[chatId] || mock.conversaciones.default;

  // ── FASE 2: descomentar cuando la BD esté lista ───────────
  // const res = await pool.query(
  //   `SELECT m.id, m.texto, m.hora,
  //           (m.usuario_id = $2) AS mio,
  //           u.nombre_usuario AS remitente
  //    FROM mensajes m
  //    JOIN usuarios u ON u.id = m.usuario_id
  //    WHERE m.chat_id = $1
  //    ORDER BY m.hora ASC`,
  //   [chatId, "YO_USUARIO_ID"] // reemplazar con el userId real de sesión
  // );
  // return res.rows;
}

/**
 * Guarda un mensaje nuevo y lo devuelve formateado
 * (listo para emitir por socket a todos en el chat).
 * @param {{ chatId, texto, remitenteId, remitente }} data
 * @returns {Promise<Object>}
 */
async function guardarMensaje({ chatId, texto, remitenteId, remitente }) {
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  // ── FASE 1: mock — genera el objeto del mensaje sin persistir ─
  const nuevoMensaje = {
    id: Date.now(),
    chatId,
    texto,
    hora,
    mio: false,   // para el receptor. El emisor lo marca como true localmente.
    remitente: remitente || "Usuario",
    remitenteId: remitenteId || null,
  };
  return nuevoMensaje;

  // ── FASE 2: descomentar cuando la BD esté lista ───────────
  // const res = await pool.query(
  //   `INSERT INTO mensajes (chat_id, usuario_id, texto, hora)
  //    VALUES ($1, $2, $3, NOW())
  //    RETURNING id, texto, hora, usuario_id AS "remitenteId"`,
  //   [chatId, remitenteId, texto]
  // );
  // const row = res.rows[0];
  // return {
  //   id: row.id,
  //   chatId,
  //   texto: row.texto,
  //   hora: new Date(row.hora).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
  //   mio: false,
  //   remitente,
  //   remitenteId: row.remitenteId,
  // };
}

// ─────────────────────────────────────────────────────────────
// BÚSQUEDA DE USUARIOS
// ─────────────────────────────────────────────────────────────

/**
 * Busca usuarios por nombre o username.
 * @param {string} query - término de búsqueda
 * @returns {Promise<Array>}
 */
async function buscarUsuarios(query) {
  // ── FASE 1: mock ──────────────────────────────────────────
  const q = (query || "").toLowerCase();
  return mock.usuariosBuscables.filter(
    (u) =>
      u.username.toLowerCase().includes(q) ||
      u.nombreReal.toLowerCase().includes(q)
  );

  // ── FASE 2: descomentar cuando la BD esté lista ───────────
  // const res = await pool.query(
  //   `SELECT id, nombre_usuario AS nombreReal,
  //           '@' || nombre_usuario AS username,
  //           carrera, ciclo, avatar
  //    FROM usuarios
  //    WHERE LOWER(nombre_usuario) LIKE $1
  //    LIMIT 20`,
  //   [`%${query.toLowerCase()}%`]
  // );
  // return res.rows;
}

// ─────────────────────────────────────────────────────────────
// PRESENCIA
// ─────────────────────────────────────────────────────────────

/**
 * Actualiza el estado de presencia de un usuario (En línea / Ausente).
 * @param {string|number} userId
 * @param {string} estado  "En línea" | "Ausente"
 */
async function actualizarPresencia(userId, estado) {
  // ── FASE 1: mock — no hace nada, el socket maneja la presencia en memoria ─
  return;

  // ── FASE 2: descomentar cuando la BD esté lista ───────────
  // await pool.query(
  //   `UPDATE usuarios SET estado = $1 WHERE id = $2`,
  //   [estado, userId]
  // );
}

module.exports = {
  getChatsDeUsuario,
  getMensajes,
  guardarMensaje,
  buscarUsuarios,
  actualizarPresencia,
};
