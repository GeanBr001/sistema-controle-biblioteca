export const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '/api' : 'https://sistema-controle-biblioteca.onrender.com/api';
export const SESSION_KEY = 'biblioteca_usuario';
export const ROLE_LABELS = { admin: 'Administrador', staff: 'Bibliotecário' };
