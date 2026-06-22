const mock = require("../mock/mockData");

// ─────────────────────────────────────────────────────────────
// REPORTES (en memoria)
// ─────────────────────────────────────────────────────────────
const reportes = new Map();

function reportarMensaje(msgId, chatId) {
  const key = `${chatId}_${msgId}`;
  const actual = (reportes.get(key) || 0) + 1;
  reportes.set(key, actual);
  return {
    eliminado: actual >= 5,
    reportes: actual,
  };
}

// ─────────────────────────────────────────────────────────────
// CHATS / CONTACTOS
// ─────────────────────────────────────────────────────────────
async function getChatsDeUsuario(userId) {
  return mock.contactos;
}

// ─────────────────────────────────────────────────────────────
// MENSAJES
// ─────────────────────────────────────────────────────────────
async function getMensajes(chatId) {
  return mock.conversaciones[chatId] || mock.conversaciones.default;
}

async function guardarMensaje({ chatId, texto, remitenteId, remitente }) {
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  return {
    id: Date.now(),
    chatId,
    texto,
    hora,
    mio: false,
    remitente: remitente || "Usuario",
    remitenteId: remitenteId || null,
  };
}

// ─────────────────────────────────────────────────────────────
// BÚSQUEDA DE USUARIOS
// ─────────────────────────────────────────────────────────────
async function buscarUsuarios(query) {
  const q = (query || "").toLowerCase();
  return mock.usuariosBuscables.filter(
    (u) =>
      u.username.toLowerCase().includes(q) ||
      u.nombreReal.toLowerCase().includes(q)
  );
}

// ─────────────────────────────────────────────────────────────
// PRESENCIA
// ─────────────────────────────────────────────────────────────
async function actualizarPresencia(userId, estado) {
  return;
}

module.exports = {
  getChatsDeUsuario,
  getMensajes,
  guardarMensaje,
  buscarUsuarios,
  actualizarPresencia,
  reportarMensaje,
};