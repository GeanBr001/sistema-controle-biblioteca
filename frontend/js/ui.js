// Construtores de HTML reutilizáveis

import { IMG_BASE, STATUS_LABELS } from './config.js';
import { escapeHtml, deriveStatus } from './helpers.js';

// cria as etiquetas coloridas (usadas em status, funções de usuário, etc).
export function tagHtml(label, color) {
  return `<span class="tag" style="background:${color}18;border:1px solid ${color}40;color:${color}">${label}</span>`;
}

// retorna a imagem da capa do livro. se não tiver, coloca um emoji de livro no lugar.
export function coverHtml(src, size = 120) {
  const height = Math.round(size * 1.4);
  const fallback = `Object.assign(document.createElement('div'),{className:'cover-placeholder',style:'width:${size}px;height:${height}px;font-size:${Math.round(size * .32)}px;flex-shrink:0',textContent:'📖'})`;
  if (!src) {
    return `<div class="cover-placeholder" style="width:${size}px;height:${height}px;font-size:${Math.round(size * .32)}px;flex-shrink:0">📖</div>`;
  }
  return `<img src="${IMG_BASE}${src}" alt="Capa" onerror="this.replaceWith(${fallback})" style="width:${size}px;height:${height}px;object-fit:cover;border-radius:2px;flex-shrink:0;display:block" />`;
}

// monta os inputs, textareas e selects de forma padronizada, já lidando com erros e dicas.
export function buildField({ label, name, type = 'text', value = '', placeholder = '', required = false, as = 'input', options = [], hint = '', error = '', colSpan }) {
  const spanStyle = colSpan ? `grid-column:span ${colSpan}` : '';
  const errorClass = error ? 'err' : '';
  const labelClass = error ? 'error' : '';
  let inputHtml = '';

  if (as === 'textarea') {
    inputHtml = `<textarea class="field-input ${errorClass}" name="${name}" placeholder="${placeholder}"
        oninput="App.handleInput(this)"
        onfocus="if(!this.classList.contains('err'))this.style.borderColor='var(--accent)'"
        onblur="this.style.borderColor=''">${escapeHtml(value)}</textarea>`;
  } else if (as === 'select') {
    const optionsHtml = options.map(opt =>
      `<option value="${escapeHtml(opt.value)}" ${opt.value === value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`
    ).join('');
    inputHtml = `<select class="field-input ${errorClass}" name="${name}" onchange="App.handleInput(this)">${optionsHtml}</select>`;
  } else {
    inputHtml = `<input class="field-input ${errorClass}" type="${type}" name="${name}"
        value="${escapeHtml(value)}" placeholder="${placeholder}"
        oninput="App.handleInput(this)"
        onfocus="if(!this.classList.contains('err'))this.style.borderColor='var(--accent)'"
        onblur="this.style.borderColor=''" />`;
  }

  return `
    <div style="${spanStyle}">
      <label class="field-label ${labelClass}">${label}${required ? '<span class="required-star"> *</span>' : ''}</label>
      ${error ? `<span class="field-error">⚠ ${error}</span>` : ''}
      ${inputHtml}
      ${hint && !error ? `<span class="field-hint">${hint}</span>` : ''}
    </div>`;
}

// bloco de campos de endereço padrão para reaproveitarmos onde precisar.
export function addressFieldsHtml(form = {}, errors = {}) {
  return `
    <div class="form-section-divider">
      <page class="form-section-title">Endereço</page>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
        ${buildField({ label: 'Rua', name: 'street', value: form.street, placeholder: 'Ex: Rua das Flores', required: true, error: errors.street, colSpan: 2 })}
        ${buildField({ label: 'Número', name: 'number', value: form.number, placeholder: 'Ex: 123' })}
        ${buildField({ label: 'Bairro', name: 'neighborhood', value: form.neighborhood, placeholder: 'Ex: Centro' })}
        ${buildField({ label: 'Cidade', name: 'city', value: form.city, placeholder: 'Ex: Curitiba', required: true, error: errors.city })}
        ${buildField({ label: 'Estado', name: 'state', value: form.state, placeholder: 'Ex: PR', required: true, error: errors.state })}
        ${buildField({ label: 'CEP', name: 'zipCode', value: form.zipCode, placeholder: 'Ex: 80000-000', required: true, error: errors.zipCode, colSpan: 2 })}
      </div>
    </div>`;
}

// cria os botões de navegação das páginas (com "..." se houverem muitas páginas).
export function buildPaginationHtml(currentPage, totalPages, callbackName) {
  if (totalPages <= 1) return '';
  const range = [1];
  if (currentPage > 3) range.push('…');
  for (let page = Math.max(2, currentPage - 1); page <= Math.min(totalPages - 1, currentPage + 1); page++) {
    range.push(page);
  }
  if (currentPage < totalPages - 2) range.push('…');
  if (totalPages > 1) range.push(totalPages);

  const buttons = range.map(page =>
    page === '…'
      ? `<span class="page-ellipsis">…</span>`
      : `<button class="page-btn ${page === currentPage ? 'active' : ''}" onclick="${callbackName}(${page})">${page}</button>`
  ).join('');

  return `
    <div class="pagination-wrap">
      <button class="page-btn arrow" onclick="${callbackName}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>
      ${buttons}
      <button class="page-btn arrow" onclick="${callbackName}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>
      <span class="pagination-info">Página ${currentPage} de ${totalPages}</span>
    </div>`;
}