// Funções utilitárias puras (sem DOM)

import { STATUS_LABELS } from './config.js';

// formata valores numéricos para o padrão de moeda brasileiro (R$) ou mostra "GRÁTIS".
export function formatPrice(n) {
  const num = Number(n);
  if (isNaN(num)) return '—';
  if (num === 0) return 'GRÁTIS';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// descobre qual deve ser o status real do livro olhando para a quantidade em estoque.
export function deriveStatus(stock, currentStatus) {
  if (currentStatus === 'inactive') return 'inactive';
  if (Number(stock) === 0) return 'out_of_stock';
  if (currentStatus === 'out_of_stock') return 'active';
  return currentStatus;
}

// limpa caracteres perigosos para evitar ataques de injeção de HTML (XSS).
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}