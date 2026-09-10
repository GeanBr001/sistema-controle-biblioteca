const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const API_BASE = isLocal ? `${window.location.protocol}//${window.location.hostname}:3000/api` : '/api';
export const SESSION_KEY = 'biblioteca_usuario';
export const ROLE_LABELS = { admin: 'Administrador', staff: 'Bibliotecário' };
