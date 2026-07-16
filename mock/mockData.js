// =============================================================
// mock/mockData.js
// Datos simulados que reemplazan la base de datos temporalmente.
// Cuando la BD esté lista, este archivo se deja de usar —
// solo cambian las implementaciones en services/chatService.js.
// =============================================================

const contactos = [
  { id: 1, nombre: "TzNakroth",    estado: "En línea", tipo: "amigo", avatar: null },
  { id: 2, nombre: "CodeMaster",   estado: "En línea", tipo: "amigo", avatar: null },
  { id: 3, nombre: "MichiUTP",     estado: "En línea", tipo: "amigo", avatar: null },
  { id: 4, nombre: "SofiDev",      estado: "Ausente",  tipo: "amigo", avatar: null },
  { id: 5, nombre: "General UTP+", estado: "3",        tipo: "grupo", avatar: null, mensajesNoLeidos: 3  },
  { id: 6, nombre: "Ing. Sistemas",estado: "12",       tipo: "grupo", avatar: null, mensajesNoLeidos: 12 },
  { id: 7, nombre: "Gamers UTP",   estado: "8",        tipo: "grupo", avatar: null, mensajesNoLeidos: 8  },
  { id: 8, nombre: "Memes UTP",    estado: "15",       tipo: "grupo", avatar: null, mensajesNoLeidos: 15 },
];

const conversaciones = {
  1: [
    { id: 1, texto: "Hola bro!",                        hora: "10:00 a. m.", mio: false, remitente: "TzNakroth" },
    { id: 2, texto: "Qué onda, ¿todo bien?",            hora: "10:01 a. m.", mio: true,  remitente: "Yo" },
    { id: 3, texto: "Sí, aquí dándole al código",       hora: "10:02 a. m.", mio: false, remitente: "TzNakroth" },
  ],
  2: [
    { id: 1, texto: "¿Viste el nuevo repo?",            hora: "11:30 a. m.", mio: false, remitente: "CodeMaster" },
    { id: 2, texto: "Aún no, pásame el link",           hora: "11:31 a. m.", mio: true,  remitente: "Yo" },
    { id: 3, texto: "Te lo mando por correo",           hora: "11:32 a. m.", mio: false, remitente: "CodeMaster" },
  ],
  3: [
    { id: 1, texto: "Michi! ¿Vienes al campus?",        hora: "12:00 p. m.", mio: true,  remitente: "Yo" },
    { id: 2, texto: "En 20 minutos llego 🐾",           hora: "12:05 p. m.", mio: false, remitente: "MichiUTP" },
  ],
  4: [
    { id: 1, texto: "Sofi, ¿cómo va el diseño?",        hora: "1:00 p. m.",  mio: true,  remitente: "Yo" },
    { id: 2, texto: "Ya casi listo, te lo paso en un rato ✨", hora: "1:15 p. m.", mio: false, remitente: "SofiDev" },
  ],
  5: [
    { id: 1, texto: "Hola a todos! 👋",                 hora: "8:20 a. m.", mio: false, remitente: "Ana" },
    { id: 2, texto: "¿Cuándo es el examen?",            hora: "8:21 a. m.", mio: false, remitente: "CodeMaster" },
    { id: 3, texto: "Creo que el lunes",                hora: "8:22 a. m.", mio: true,  remitente: "Yo" },
    { id: 4, texto: "Confirmo, es el lunes a las 8",    hora: "8:23 a. m.", mio: false, remitente: "SofiDev" },
  ],
  6: [
    { id: 1, texto: "¿Alguien tiene el instalador de SQL Server?", hora: "2:00 p. m.", mio: false, remitente: "Pepe" },
    { id: 2, texto: "Yo lo tengo en mi Drive",          hora: "2:05 p. m.", mio: false, remitente: "Lucho" },
    { id: 3, texto: "Pasa el link porfa",               hora: "2:10 p. m.", mio: true,  remitente: "Yo" },
  ],
  7: [
    { id: 1, texto: "¿Quién para un Valorant?",         hora: "10:00 p. m.", mio: false, remitente: "Gamer1" },
    { id: 2, texto: "Yo jalo!",                         hora: "10:01 p. m.", mio: false, remitente: "Gamer2" },
    { id: 3, texto: "Entren al Discord",                hora: "10:02 p. m.", mio: true,  remitente: "Yo" },
  ],
  8: [
    { id: 1, texto: "Miren este meme jajaja",           hora: "11:00 p. m.", mio: false, remitente: "MemeLord" },
    { id: 2, texto: "JAJAJAJA que pro",                 hora: "11:05 p. m.", mio: false, remitente: "RandomUser" },
    { id: 3, texto: "Buenísimo XD",                     hora: "11:10 p. m.", mio: true,  remitente: "Yo" },
  ],
  default: [
    { id: 1, texto: "Hola!",          hora: "9:00 a. m.", mio: false, remitente: "Desconocido" },
    { id: 2, texto: "¿Cómo va todo?", hora: "9:05 a. m.", mio: true,  remitente: "Yo" },
  ],
};

const usuariosBuscables = [
  { id: "1", username: "@TzNakroth",  nombreReal: "TzNakroth",       carrera: "Ing. Sistemas",   ciclo: "4to ciclo", avatar: null },
  { id: "2", username: "@CodeMaster", nombreReal: "Code Master",      carrera: "Ing. Software",   ciclo: "6to ciclo", avatar: null },
  { id: "3", username: "@SofiDev",    nombreReal: "Sofi Developer",   carrera: "Ciencia de Datos",ciclo: "5to ciclo", avatar: null },
  { id: "4", username: "@MichiUTP",   nombreReal: "MichiUTP",         carrera: "Ing. Sistemas",   ciclo: "3er ciclo", avatar: null },
];

module.exports = { contactos, conversaciones, usuariosBuscables };
