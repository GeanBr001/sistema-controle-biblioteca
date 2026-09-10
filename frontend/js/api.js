import { API_BASE } from './config.js';
export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options, headers: { ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(options.headers || {}) } });
  const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(data.error || `Erro do servidor (${response.status})`);
  return data;
}
