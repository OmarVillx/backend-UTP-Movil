// =============================================================
// sockets/chatSocket.js
// =============================================================

const chatService = require("../services/chatService");

const usuariosConectados = new Map();

// ── Lista de palabras censuradas ──────────────────────────────
const PALABRAS_CENSURADAS = [
  "conchetumadre",
  "conchatumare",
  "hijo de puta",
  "malparido",
  "puta",
  "idiota",
  "basura",
  "estupido",
  "perro",
  "maricon",
  "pendejo",
  "cagon de mierda",
  "mierda",
  "puto",
  "huevon",
  "puta madre",
  "carajo",
  "cabro",
  "wueon",
  "sonzo",
  "tarado",
  "imbecil",
  "baboso",
  "mongol",
  "cojudo",
  "gil",
  "tarao",
  "atorrante",
  "me llegas al pincho",
  "desahuevate",
  "rosquete",
  "pastrulo",
  "pastelero",
  "drogo",
  "fumon",
  "fumeque",
  "marihuanero",
  "chupapinga",
  "mostro",
  "careperro",
  "caremuerto",
  "cachudo",
  "venado",
  "terruco",
];

function censurar(texto) {
  let resultado = texto;
  PALABRAS_CENSURADAS.forEach((palabra) => {
    const regex = new RegExp(palabra, "gi");
    resultado = resultado.replace(regex, "*".repeat(palabra.length));
  });
  return resultado;
}

module.exports = function registrarSocketsChat(io) {
  io.on("connection", (socket) => {
    console.log(`[socket] conectado: ${socket.id}`);

    socket.on("usuario:conectar", async ({ userId, nombre }) => {
      socket.data.userId = userId;
      socket.data.nombre = nombre;
      usuariosConectados.set(socket.id, { userId, nombre });

      await chatService.actualizarPresencia(userId, "En línea");

      socket.broadcast.emit("presencia:cambio", {
        userId,
        nombre,
        estado: "En línea",
      });

      const chats = await chatService.getChatsDeUsuario(userId);
      socket.emit("chat:listar", { chats });

      console.log(`[socket] usuario conectado: ${nombre} (${userId})`);
    });

    socket.on("chat:unirse", async ({ chatId }) => {
      const rooms = [...socket.rooms].filter(
        (r) => r !== socket.id && r.startsWith("chat_")
      );
      rooms.forEach((r) => socket.leave(r));

      socket.join(`chat_${chatId}`);
      socket.data.chatActivo = chatId;

      const mensajes = await chatService.getMensajes(chatId);
      socket.emit("mensajes:historial", { chatId, mensajes });

      console.log(`[socket] ${socket.data.nombre} unido a chat_${chatId}`);
    });

    socket.on("mensaje:enviar", async ({ chatId, texto, remitente }) => {
      if (!texto || !texto.trim()) return;

      const userId = socket.data.userId;
      const nombreRemitente = remitente || socket.data.nombre || "Usuario";

      const mensaje = await chatService.guardarMensaje({
        chatId,
        texto: censurar(texto.trim()),
        remitenteId: userId,
        remitente: nombreRemitente,
      });

      io.to(`chat_${chatId}`).emit("mensaje:nuevo", mensaje);
    });

    socket.on("escribiendo:inicio", ({ chatId }) => {
      socket.to(`chat_${chatId}`).emit("escribiendo", {
        chatId,
        userId: socket.data.userId,
        nombre: socket.data.nombre,
        escribiendo: true,
      });
    });

    socket.on("escribiendo:fin", ({ chatId }) => {
      socket.to(`chat_${chatId}`).emit("escribiendo", {
        chatId,
        userId: socket.data.userId,
        nombre: socket.data.nombre,
        escribiendo: false,
      });
    });

    socket.on("mensaje:marcarVisto", async ({ chatId }) => {
      const userId = socket.data.userId;
      socket.to(`chat_${chatId}`).emit("mensaje:visto", {
        chatId,
        userId,
      });
    });

    // ── Reportar mensaje ─────────────────────────────────────
    socket.on("mensaje:reportar", ({ msgId, chatId }) => {
      console.log(`[reporte] msgId: ${msgId}, chatId: ${chatId}`);
      const resultado = chatService.reportarMensaje(msgId, chatId);
      console.log(`[reporte] resultado:`, resultado);

      if (resultado.eliminado) {
        io.to(`chat_${chatId}`).emit("mensaje:eliminado", {
          msgId,
          chatId,
          textoReemplazado: "⚠️ Mensaje eliminado por límite de reportes",
        });
      } else {
        socket.emit("reporte:confirmado", { msgId, reportes: resultado.reportes });
      }
    });

    socket.on("disconnect", async () => {
      const { userId, nombre } = socket.data;
      usuariosConectados.delete(socket.id);

      if (userId) {
        await chatService.actualizarPresencia(userId, "Ausente");

        socket.broadcast.emit("presencia:cambio", {
          userId,
          nombre,
          estado: "Ausente",
        });
      }

      console.log(`[socket] desconectado: ${socket.id}`);
    });
  });
};