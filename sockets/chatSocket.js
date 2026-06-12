// =============================================================
// sockets/chatSocket.js
//
// Maneja todos los eventos Socket.IO del chat en tiempo real.
// Usa el mismo chatService que las rutas HTTP —
// cuando la BD esté lista, el service cambia y los sockets
// automáticamente empiezan a persistir sin tocar este archivo.
// =============================================================

const chatService = require("../services/chatService");

// Mapa en memoria para presencia (socket.id → userId).
// En fase 2 se puede complementar con la tabla usuarios, pero
// la presencia siempre depende del socket, no solo de la BD.
const usuariosConectados = new Map();

module.exports = function registrarSocketsChat(io) {
  io.on("connection", (socket) => {
    console.log(`[socket] conectado: ${socket.id}`);

    // ── 1. El usuario se identifica al conectar ──────────────
    //    El frontend emite: socket.emit("usuario:conectar", { userId, nombre })
    socket.on("usuario:conectar", async ({ userId, nombre }) => {
      socket.data.userId = userId;
      socket.data.nombre = nombre;
      usuariosConectados.set(socket.id, { userId, nombre });

      await chatService.actualizarPresencia(userId, "En línea");

      // Notifica a todos los demás que este usuario está online
      socket.broadcast.emit("presencia:cambio", {
        userId,
        nombre,
        estado: "En línea",
      });

      // Envía al usuario su lista de chats al conectarse
      const chats = await chatService.getChatsDeUsuario(userId);
      socket.emit("chat:listar", { chats });

      console.log(`[socket] usuario conectado: ${nombre} (${userId})`);
    });

    // ── 2. El usuario abre un chat (se une a la room) ────────
    //    El frontend emite: socket.emit("chat:unirse", { chatId })
    socket.on("chat:unirse", async ({ chatId }) => {
      // Sale de rooms anteriores de chat (no del propio socket)
      const rooms = [...socket.rooms].filter(
        (r) => r !== socket.id && r.startsWith("chat_")
      );
      rooms.forEach((r) => socket.leave(r));

      socket.join(`chat_${chatId}`);
      socket.data.chatActivo = chatId;

      // Envía el historial de mensajes al usuario que abre el chat
      const mensajes = await chatService.getMensajes(chatId);
      socket.emit("mensajes:historial", { chatId, mensajes });

      console.log(`[socket] ${socket.data.nombre} unido a chat_${chatId}`);
    });

    // ── 3. El usuario envía un mensaje ───────────────────────
    //    El frontend emite:
    //    socket.emit("mensaje:enviar", { chatId, texto, remitente })
    socket.on("mensaje:enviar", async ({ chatId, texto, remitente }) => {
      if (!texto || !texto.trim()) return;

      const userId = socket.data.userId;
      const nombreRemitente = remitente || socket.data.nombre || "Usuario";

      const mensaje = await chatService.guardarMensaje({
        chatId,
        texto: texto.trim(),
        remitenteId: userId,
        remitente: nombreRemitente,
      });

      // Emite el mensaje a todos en la room del chat (incluye al emisor)
      io.to(`chat_${chatId}`).emit("mensaje:nuevo", mensaje);
    });

    // ── 4. Indicador "está escribiendo" ──────────────────────
    //    El frontend emite: socket.emit("escribiendo:inicio", { chatId })
    socket.on("escribiendo:inicio", ({ chatId }) => {
      socket.to(`chat_${chatId}`).emit("escribiendo", {
        chatId,
        userId: socket.data.userId,
        nombre: socket.data.nombre,
        escribiendo: true,
      });
    });

    //    El frontend emite: socket.emit("escribiendo:fin", { chatId })
    socket.on("escribiendo:fin", ({ chatId }) => {
      socket.to(`chat_${chatId}`).emit("escribiendo", {
        chatId,
        userId: socket.data.userId,
        nombre: socket.data.nombre,
        escribiendo: false,
      });
    });

    // ── 5. Marcar mensajes como vistos ───────────────────────
    //    El frontend emite:
    //    socket.emit("mensaje:marcarVisto", { chatId })
    socket.on("mensaje:marcarVisto", async ({ chatId }) => {
      const userId = socket.data.userId;
      // Fase 2: await chatService.marcarComoVisto(chatId, userId);

      // Notifica al otro participante que sus mensajes fueron vistos
      socket.to(`chat_${chatId}`).emit("mensaje:visto", {
        chatId,
        userId,
      });
    });

    // ── 6. Desconexión ───────────────────────────────────────
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
