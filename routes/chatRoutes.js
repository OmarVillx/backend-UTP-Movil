// =============================================================
// routes/chatRoutes.js
// Rutas HTTP del módulo de chat.
// Este archivo no necesita cambios cuando llegue la BD.
// =============================================================

const { Router } = require("express");
const ctrl = require("../controllers/chatController");

const router = Router();

// Lista de chats del usuario  →  GET /api/chats?userId=xxx
router.get("/chats", ctrl.listarChats);

// Mensajes de un chat         →  GET /api/chats/:chatId/mensajes
router.get("/chats/:chatId/mensajes", ctrl.obtenerMensajes);

// Buscar usuarios             →  GET /api/usuarios/buscar?q=texto
router.get("/usuarios/buscar", ctrl.buscarUsuarios);

module.exports = router;
