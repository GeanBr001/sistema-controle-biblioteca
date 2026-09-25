import { apiFetch } from './api.js';
import { SESSION_KEY, ROLE_LABELS } from './config.js';
import { initTheme, toggleTheme, currentTheme, applyTheme } from './theme.js';

const state = {
  user: null,
  books: [],
  categories: [],
  loans: [],
  readers: [],
  users: [],
  movements: [],
  dashboard: {},
  tab: 'dashboard',
  booksView: 'grid',
  pendingCatalog: null
};

const $ = id => document.getElementById(id);

// Escapa texto antes de jogar em innerHTML, evitando XSS vindo de dados do banco.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[c]));

const pad = n => String(n).padStart(2, '0');

// Formata uma data ISO para o padrão brasileiro (dd/mm/aaaa), com hora opcional.
function localDate(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

// Formata uma data para o formato aceito por <input type="date"> (aaaa-mm-dd).
// Sem valor, usa a data de hoje.
function inputDate(value) {
  if (value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Configurações da instituição (nome, prazo padrão, estoque mínimo padrão).
// Ficam salvas no navegador do administrador nesta versão de demonstração.
function settings() {
  return JSON.parse(localStorage.getItem('biblioteca_config') || '{"institution":"Biblioteca","defaultDueDays":7,"defaultMinimumStock":2}');
}

function setSettings(v) {
  localStorage.setItem('biblioteca_config', JSON.stringify(v));
}

// Resolve o caminho da capa: URL completa, caminho absoluto ou arquivo salvo em /uploads/covers.
function coverSrc(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')) return v;
  return v.startsWith('uploads/') ? `/${v}` : `/uploads/covers/${v}`;
}

const ICONS = {
  edit: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Zm10-13 4 4M13 5l4 4"/></svg>',
  archive: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zm5 7h8"/></svg>',
  restore: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5M20 5v6h-6"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  book: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5c0-1.1.9-2 2-2h6v18H6a2 2 0 0 1-2-2V5Z"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
  loan: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
  warn: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v4"/><path d="M12 16.3h.01"/></svg>',
  chart: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/></svg>',
  shelf: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v14"/><path d="M10 21V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v16"/><path d="M15 21V9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12"/></svg>'
};
const icon = name => ICONS[name] || '';

export const App = {
  async init() {
    initTheme();
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      try { state.user = JSON.parse(saved); }
      catch { localStorage.removeItem(SESSION_KEY); }
    }
    this.bindNavigation();
    if (state.user) await this.showApp();
    else this.showLogin();
  },

  // Notificação visual usando o componente Toast do Bootstrap 5 (carregado via CDN no index.html).
  // Substitui os alert() nativos por um aviso não bloqueante no canto da tela.
  // type: 'danger' (erro, padrão), 'success', 'warning' ou 'info'.
  notify(message, type = 'danger') {
    const container = $('toast-container');
    if (!container || typeof bootstrap === 'undefined') { alert(message); return; }
    const bg = { danger: 'text-bg-danger', success: 'text-bg-success', warning: 'text-bg-warning', info: 'text-bg-info' }[type] || 'text-bg-dark';
    const el = document.createElement('div');
    el.className = `toast align-items-center ${bg} border-0`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');
    el.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${esc(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
      </div>`;
    container.appendChild(el);
    const toast = new bootstrap.Toast(el, { delay: 5000 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    toast.show();
  },

  toggleTheme() { toggleTheme(); },

  toggleForgotPassword() {
    const box = $('forgot-password-msg');
    if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
  },

  toggleMobileMenu() { document.querySelector('.sidebar')?.classList.toggle('open'); },

  showLogin() {
    $('login-page').style.display = 'flex';
    $('app-shell').style.display = 'none';
    $('login-page').innerHTML = `
      <div class="login-card">
        <div class="brand-mark">${icon('shelf')}</div>
        <span class="eyebrow">Sistema de biblioteca</span>
        <h1>Estante Virtual</h1>
        <p>Acesse o painel administrativo para gerenciar livros, leitores e circulação.</p>
        <form id="login-form">
          <label>E-mail<input name="email" type="email" required placeholder="admin@estantevirtual.local"></label>
          <label>Senha<input name="password" type="password" required placeholder="••••••••"></label>
          <button class="btn primary login-submit" type="submit">Entrar</button>
          <div id="login-error" class="error"></div>
        </form>
        <button class="forgot-link" type="button" onclick="App.toggleForgotPassword()">Esqueci minha senha</button>
        <div id="forgot-password-msg" class="forgot-msg" style="display:none">
          Por segurança, o sistema não envia e-mail de recuperação automático. Entre em contato com o
          administrador em <a href="mailto:geanxiety@gmail.com?subject=Redefini%C3%A7%C3%A3o%20de%20senha%20-%20Estante%20Virtual">geanxiety@gmail.com</a>
          para solicitar a redefinição da sua senha.
        </div>
        <button class="theme-btn" type="button" onclick="App.toggleTheme()">Alternar tema</button>
      </div>`;
    $('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const err = $('login-error');
      err.textContent = '';
      try {
        const r = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: f.get('email'), password: f.get('password') })
        });
        state.user = r.user;
        localStorage.setItem(SESSION_KEY, JSON.stringify(state.user));
        await this.showApp();
      } catch (x) { err.textContent = x.message; }
    });
  },

  async showApp() {
    try {
      await this.loadAll();
    } catch (error) {
      if (error.message.includes('Autenticação') || error.message.includes('Sessão')) {
        localStorage.removeItem(SESSION_KEY);
        return this.showLogin();
      }
      throw error;
    }
    $('login-page').style.display = 'none';
    $('app-shell').style.display = 'flex';
    $('user-name').textContent = state.user.name;
    $('user-role').textContent = ROLE_LABELS[state.user.role] || state.user.role;
    if ($('avatar')) $('avatar').textContent = (state.user.name || '?').trim().charAt(0).toUpperCase();
    document.querySelectorAll('[data-admin]').forEach(x => {
      x.style.display = state.user.role === 'admin' ? '' : 'none';
    });
    this.render();
  },

  async logout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); }
    finally { localStorage.removeItem(SESSION_KEY); location.reload(); }
  },

  bindNavigation() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) {
        state.tab = b.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === state.tab));
        document.querySelector('.sidebar')?.classList.remove('open');
        this.render();
      }
      if (e.target.closest('.mobile-menu')) this.toggleMobileMenu();
    });
  },

  async loadAll() {
    const results = await Promise.all([
      apiFetch('/dashboard'),
      apiFetch('/books'),
      apiFetch('/categories'),
      apiFetch('/loans'),
      apiFetch('/readers'),
      apiFetch('/users'),
      apiFetch('/stock-movements')
    ]);
    Object.assign(state, {
      dashboard: results[0],
      books: results[1],
      categories: results[2],
      loans: results[3],
      readers: results[4],
      users: results[5],
      movements: results[6]
    });
  },

  async refresh() {
    await this.loadAll();
    this.render();
  },

  render() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = $(`view-${state.tab}`);
    if (view) view.classList.add('active');

    const labels = {
      dashboard: ['Visão geral', 'Dashboard'],
      books: ['Acervo', 'Livros'],
      loans: ['Circulação', 'Empréstimos'],
      returns: ['Circulação', 'Devoluções'],
      readers: ['Atendimento', 'Leitores'],
      movements: ['Histórico', 'Movimentações'],
      categories: ['Organização', 'Categorias'],
      users: ['Acesso', 'Usuários'],
      reports: ['Análises', 'Relatórios'],
      settings: ['Sistema', 'Configurações'],
      support: ['Ajuda', 'Suporte']
    };
    const label = labels[state.tab] || labels.dashboard;
    if ($('page-kicker')) $('page-kicker').textContent = label[0];
    if ($('page-title')) $('page-title').textContent = label[1];

    const renderFn = {
      dashboard: 'renderDashboard',
      books: 'renderBooks',
      loans: 'renderLoans',
      returns: 'renderReturns',
      readers: 'renderReaders',
      movements: 'renderMovements',
      categories: 'renderCategories',
      users: 'renderUsers',
      reports: 'renderReports',
      settings: 'renderSettings'
    }[state.tab];
    if (renderFn) this[renderFn]();
  },

  renderDashboard() {
    const d = state.dashboard || {};
    $('dash-cards').innerHTML = [
      ['Total de livros', d.total_books, icon('book'), false],
      ['Disponíveis', d.available_copies, icon('check'), false],
      ['Emprestados', d.active_loans, icon('loan'), false],
      ['Estoque baixo', d.low_stock_books, icon('warn'), Number(d.low_stock_books) > 0]
    ].map(([l, v, i, alert]) => `<div class="stat${alert ? ' alert' : ''}"><span>${i}</span><div><small>${l}</small><strong>${v ?? 0}</strong></div></div>`).join('');

    const low = state.books.filter(b => b.active && Number(b.available_quantity) <= Number(b.minimum_quantity)).slice(0, 6);
    $('low-stock-table').innerHTML = low.map(b => `
      <tr><td>${esc(b.title)}</td><td>${b.quantity}</td><td>${b.available_quantity}</td><td>${b.minimum_quantity}</td></tr>
    `).join('') || '<tr><td colspan="4">Nenhum livro com estoque baixo.</td></tr>';

    $('dashboard-table').innerHTML = state.loans.slice(0, 6).map(l => `
      <tr>
        <td><strong>${esc(l.book_title)}</strong><small>${esc(l.book_author)}</small></td>
        <td>${esc(l.reader_name || l.borrower_name)}</td>
        <td>${localDate(l.loan_date || l.created_at)}</td>
        <td>${localDate(l.due_date)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">Nenhum empréstimo.</td></tr>';
  },

  setBooksView(mode) {
    state.booksView = mode;
    $('books-grid').style.display = mode === 'grid' ? 'grid' : 'none';
    $('books-panel').style.display = mode === 'table' ? 'block' : 'none';
    $('books-view-grid')?.classList.toggle('active', mode === 'grid');
    $('books-view-table')?.classList.toggle('active', mode === 'table');
  },

  renderBooks() {
    const q = ($('book-search')?.value || '').toLowerCase();
    const filter = $('book-filter')?.value || 'all';
    const sort = $('book-sort')?.value || 'title-asc';
    const today = inputDate();
    const overdueBookIds = new Set((state.loans || [])
      .filter(l => l.status === 'active' && l.due_date < today)
      .map(l => String(l.book_id)));

    let rows = state.books.filter(b => `${b.title} ${b.author} ${b.category_name}`.toLowerCase().includes(q));

    rows = rows.filter(b => {
      const total = Number(b.quantity) || 0;
      const available = Number(b.available_quantity) || 0;
      if (filter === 'active') return b.active;
      if (filter === 'inactive') return !b.active;
      if (filter === 'low-stock') return b.active && available <= Number(b.minimum_quantity || 0);
      if (filter === 'out-of-stock') return b.active && available <= 0;
      if (filter === 'overdue') return overdueBookIds.has(String(b.id));
      return true;
    });

    rows.sort((a, b) => {
      const titleA = String(a.title || '').toLowerCase();
      const titleB = String(b.title || '').toLowerCase();
      const totalA = Number(a.quantity) || 0;
      const totalB = Number(b.quantity) || 0;
      const availableA = Number(a.available_quantity) || 0;
      const availableB = Number(b.available_quantity) || 0;
      if (sort === 'title-desc') return titleB.localeCompare(titleA, 'pt-BR');
      if (sort === 'quantity-desc') return totalB - totalA;
      if (sort === 'quantity-asc') return totalA - totalB;
      if (sort === 'available-desc') return availableB - availableA;
      if (sort === 'available-asc') return availableA - availableB;
      return titleA.localeCompare(titleB, 'pt-BR');
    });
    const deleteBtn = b => `<button class="icon-btn danger" title="Excluir definitivamente" aria-label="Excluir definitivamente" onclick="App.deleteBookPermanently(${b.id})">${icon('trash')}</button>`;

    $('books-grid').innerHTML = rows.map(b => {
      const cover = coverSrc(b.cover_image);
      const coverCell = cover
        ? `<img src="${esc(cover)}" alt="Capa de ${esc(b.title)}" loading="lazy">`
        : icon('book');
      const actionBtn = b.active
        ? `<button class="icon-btn warning" title="Inativar livro" aria-label="Inativar livro" onclick="App.inactivateBook(${b.id})">${icon('archive')}</button>`
        : `<button class="icon-btn restore" title="Reativar livro" aria-label="Reativar livro" onclick="App.reactivateBook(${b.id})">${icon('restore')}</button>`;
      const stockPill = b.available_quantity <= b.minimum_quantity
        ? '<span class="pill warn">Baixo</span>'
        : `<span class="pill">${b.available_quantity}/${b.quantity}</span>`;
      return `
        <div class="book-card">
          <div class="cover">${coverCell}</div>
          <h3>${esc(b.title)}</h3>
          <p class="author">${esc(b.author)}</p>
          <div class="meta">${stockPill}
            <div class="action-buttons">
              <button class="icon-btn" title="Editar livro" aria-label="Editar livro" onclick="App.editBook(${b.id})">${icon('edit')}</button>
              ${actionBtn}
              ${deleteBtn(b)}
            </div>
          </div>
        </div>`;
    }).join('') || '<p class="empty-state">Nenhum livro encontrado.</p>';

    $('books-table').innerHTML = rows.map(b => {
      const cover = coverSrc(b.cover_image);
      const coverCell = cover
        ? `<img src="${esc(cover)}" alt="Capa de ${esc(b.title)}" loading="lazy">`
        : '<span aria-hidden="true">—</span>';
      const stockPill = b.available_quantity <= b.minimum_quantity
        ? '<span class="pill warn">Baixo</span>'
        : '<span class="pill green">Normal</span>';
      const statusPill = b.active ? '<span class="pill green">Ativo</span>' : '<span class="pill">Inativo</span>';
      const actionBtn = b.active
        ? `<button class="icon-btn warning" title="Inativar livro" aria-label="Inativar livro" onclick="App.inactivateBook(${b.id})">${icon('archive')}</button>`
        : `<button class="icon-btn restore" title="Reativar livro" aria-label="Reativar livro" onclick="App.reactivateBook(${b.id})">${icon('restore')}</button>`;
      return `
        <tr>
          <td class="book-cell">
            <div class="book-cover">${coverCell}</div>
            <div><strong>${esc(b.title)}</strong><small>${esc(b.author)}</small></div>
          </td>
          <td>${esc(b.category_name)}</td>
          <td>${b.quantity}</td>
          <td>${b.available_quantity}</td>
          <td>${stockPill}</td>
          <td>${statusPill}</td>
          <td>
            <div class="action-buttons">
              <button class="icon-btn" title="Editar livro" aria-label="Editar livro" onclick="App.editBook(${b.id})">${icon('edit')}</button>
              ${actionBtn}
              ${deleteBtn(b)}
            </div>
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="7">Nenhum livro encontrado.</td></tr>';

    this.setBooksView(state.booksView);
  },

  async deleteBookPermanently(id) {
    if (!confirm('Excluir este livro definitivamente? Essa ação não pode ser desfeita (diferente de inativar).')) return;
    try {
      await apiFetch(`/books/${id}/permanent`, { method: 'DELETE' });
      await this.refresh();
    } catch (e) { App.notify(e.message); }
  },

  renderLoans() {
    const q = ($('loan-search')?.value || '').toLowerCase().trim();
    const filter = $('loan-filter')?.value || 'all';
    const sort = $('loan-sort')?.value || 'due-asc';
    const from = $('loan-from')?.value || '';
    const to = $('loan-to')?.value || '';
    const today = inputDate();

    let active = state.loans.filter(l => l.status === 'active');
    active = active.filter(l => {
      const haystack = `${l.book_title || ''} ${l.book_author || ''} ${l.reader_name || ''} ${l.borrower_name || ''} ${l.reader_registration || l.borrower_registration || ''}`.toLowerCase();
      if (q && !haystack.includes(q)) return false;
      const overdue = String(l.due_date || '') < today;
      if (filter === 'overdue' && !overdue) return false;
      if (filter === 'on-time' && overdue) return false;
      const loanDate = inputDate(l.loan_date || l.created_at);
      if (from && loanDate < from) return false;
      if (to && loanDate > to) return false;
      return true;
    });

    active.sort((a, b) => {
      if (sort === 'due-desc') return String(b.due_date || '').localeCompare(String(a.due_date || ''));
      if (sort === 'loan-desc') return String(b.loan_date || b.created_at || '').localeCompare(String(a.loan_date || a.created_at || ''));
      if (sort === 'loan-asc') return String(a.loan_date || a.created_at || '').localeCompare(String(b.loan_date || b.created_at || ''));
      if (sort === 'reader-asc') return String(a.reader_name || a.borrower_name || '').localeCompare(String(b.reader_name || b.borrower_name || ''), 'pt-BR');
      return String(a.due_date || '').localeCompare(String(b.due_date || ''));
    });

    $('loans-table').innerHTML = active.map(l => {
      const statusPill = l.due_date < today ? '<span class="pill warn">Atrasado</span>' : '<span class="pill green">Ativo</span>';
      const name = esc(l.reader_name || l.borrower_name);
      const readerCell = l.reader_id
        ? `<button type="button" class="link-name" onclick="App.showReaderInfo(${l.id})" title="Ver dados de contato">${name}</button>`
        : `<strong>${name}</strong>`;
      return `
        <tr>
          <td><strong>${esc(l.book_title)}</strong><small>${esc(l.book_author)}</small></td>
          <td>${readerCell}<small>${esc(l.reader_registration || l.borrower_registration || '')} ${esc(l.reader_email || '')} ${esc(l.reader_phone || '')}</small></td>
          <td>${localDate(l.loan_date || l.created_at)}</td>
          <td>${localDate(l.due_date)}</td>
          <td>${statusPill}</td>
          <td><button class="icon-btn" onclick="App.returnLoan(${l.id})">Registrar devolução</button></td>
        </tr>`;
    }).join('') || '<tr><td colspan="6">Nenhum empréstimo encontrado com esses filtros.</td></tr>';
  },

  clearLoanFilters() {
    ['loan-search', 'loan-from', 'loan-to'].forEach(id => { if ($(id)) $(id).value = ''; });
    if ($('loan-filter')) $('loan-filter').value = 'all';
    if ($('loan-sort')) $('loan-sort').value = 'due-asc';
    this.renderLoans();
  },

  // Mostra e-mail/telefone do leitor pra facilitar contato (ex.: empréstimo atrasado).
  showReaderInfo(loanId) {
    const l = state.loans.find(x => String(x.id) === String(loanId));
    if (!l) return;
    const late = l.due_date < inputDate();
    this.openModal('Contato do leitor', `
      <div class="reader-info">
        <h3>${esc(l.reader_name || l.borrower_name)}</h3>
        ${l.reader_registration ? `<p><strong>Matrícula:</strong> ${esc(l.reader_registration)}</p>` : ''}
        <p><strong>E-mail:</strong> ${l.reader_email ? `<a href="mailto:${esc(l.reader_email)}">${esc(l.reader_email)}</a>` : 'não informado'}</p>
        <p><strong>Telefone:</strong> ${l.reader_phone ? `<a href="tel:${esc(l.reader_phone)}">${esc(l.reader_phone)}</a>` : 'não informado'}</p>
        <p><strong>Livro:</strong> ${esc(l.book_title)} — devolução prevista para ${localDate(l.due_date)}${late ? ' <span class="pill warn">Atrasado</span>' : ''}</p>
        <div class="form-actions"><button type="button" class="btn" onclick="App.closeModal()">Fechar</button></div>
      </div>`);
  },

  renderReturns() {
    const q = ($('return-search')?.value || '').toLowerCase().trim();
    const from = $('return-from')?.value || '';
    const to = $('return-to')?.value || '';
    const sort = $('return-sort')?.value || 'return-desc';

    let returned = state.loans.filter(l => l.status === 'returned');
    returned = returned.filter(l => {
      const haystack = `${l.book_title || ''} ${l.book_author || ''} ${l.reader_name || ''} ${l.borrower_name || ''} ${l.reader_registration || l.borrower_registration || ''}`.toLowerCase();
      if (q && !haystack.includes(q)) return false;
      const returnDate = inputDate(l.returned_at || l.return_date);
      if (from && returnDate < from) return false;
      if (to && returnDate > to) return false;
      return true;
    });

    returned.sort((a, b) => {
      if (sort === 'return-asc') return String(a.returned_at || a.return_date || '').localeCompare(String(b.returned_at || b.return_date || ''));
      if (sort === 'reader-asc') return String(a.reader_name || a.borrower_name || '').localeCompare(String(b.reader_name || b.borrower_name || ''), 'pt-BR');
      if (sort === 'book-asc') return String(a.book_title || '').localeCompare(String(b.book_title || ''), 'pt-BR');
      return String(b.returned_at || b.return_date || '').localeCompare(String(a.returned_at || a.return_date || ''));
    });

    $('returns-table').innerHTML = returned.map(l => `
      <tr>
        <td><strong>${esc(l.book_title)}</strong><small>${esc(l.book_author)}</small></td>
        <td>${esc(l.reader_name || l.borrower_name)}<small>${esc(l.reader_registration || l.borrower_registration || '')} ${esc(l.reader_email || '')} ${esc(l.reader_phone || '')}</small></td>
        <td>${localDate(l.loan_date || l.created_at)}</td>
        <td>${localDate(l.returned_at || l.return_date, true)}</td>
        <td><span class="pill green">Devolvido</span></td>
      </tr>
    `).join('') || '<tr><td colspan="5">Nenhuma devolução encontrada com esses filtros.</td></tr>';
  },

  clearReturnFilters() {
    ['return-search', 'return-from', 'return-to'].forEach(id => { if ($(id)) $(id).value = ''; });
    if ($('return-sort')) $('return-sort').value = 'return-desc';
    this.renderReturns();
  },

  renderReaders() {
    const q = ($('reader-search')?.value || '').toLowerCase();
    const filter = $('reader-filter')?.value || 'all';
    const sort = $('reader-sort')?.value || 'name-asc';
    const today = inputDate();
    const activeLoans = state.loans || [];
    const overdueReaderIds = new Set(activeLoans
      .filter(l => l.status === 'active' && l.due_date < today && l.reader_id != null)
      .map(l => String(l.reader_id)));

    let rows = (state.readers || []).filter(r => `${r.name} ${r.email || ''} ${r.phone || ''} ${r.registration || ''}`.toLowerCase().includes(q));

    rows = rows.filter(r => {
      const loans = Number(r.active_loans) || 0;
      if (filter === 'active') return r.active;
      if (filter === 'inactive') return !r.active;
      if (filter === 'overdue') return overdueReaderIds.has(String(r.id));
      if (filter === 'with-loans') return loans > 0;
      if (filter === 'no-loans') return loans === 0;
      return true;
    });

    rows.sort((a, b) => {
      const nameA = String(a.name || '').toLowerCase();
      const nameB = String(b.name || '').toLowerCase();
      const loansA = Number(a.active_loans) || 0;
      const loansB = Number(b.active_loans) || 0;
      if (sort === 'name-desc') return nameB.localeCompare(nameA, 'pt-BR');
      if (sort === 'loans-desc') return loansB - loansA;
      if (sort === 'loans-asc') return loansA - loansB;
      return nameA.localeCompare(nameB, 'pt-BR');
    });
    $('readers-table').innerHTML = rows.map(r => {
      const statusPill = r.active ? '<span class="pill green">Ativo</span>' : '<span class="pill">Inativo</span>';
      const inactivateBtn = r.active ? `<button class="icon-btn warning" onclick="App.inactivateReader(${r.id})">Inativar</button>` : '';
      const deleteBtn = `<button class="icon-btn danger" onclick="App.deleteReaderPermanently(${r.id})">Excluir</button>`;
      return `
        <tr>
          <td><strong>${esc(r.name)}</strong><small>${esc(r.registration || 'Sem matrícula')}</small></td>
          <td>${esc(r.email || '—')}</td>
          <td>${esc(r.phone || '—')}</td>
          <td>${r.active_loans || 0}</td>
          <td>${statusPill}</td>
          <td><button class="icon-btn" onclick="App.editReader(${r.id})">Editar</button>${inactivateBtn}${deleteBtn}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="6">Nenhum leitor cadastrado.</td></tr>';
  },

  renderMovements() {
    $('movements-table').innerHTML = state.movements.map(m => `
      <tr>
        <td>${localDate(m.created_at, true)}</td>
        <td>${esc(m.book_title)}</td>
        <td>${esc(m.type)}</td>
        <td>${m.quantity}</td>
        <td>${esc(m.reason || '')}</td>
        <td>${esc(m.user_name || '—')}</td>
      </tr>
    `).join('') || '<tr><td colspan="6">Nenhuma movimentação.</td></tr>';
  },

  renderCategories() {
    $('categories-table').innerHTML = state.categories.map(c => `
      <tr>
        <td>${c.id}</td>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${esc(c.description || '')}</td>
        <td>
          <button class="icon-btn" onclick="App.editCategory(${c.id})">Editar</button>
          <button class="icon-btn danger" onclick="App.deleteCategory(${c.id})">Excluir</button>
        </td>
      </tr>
    `).join('');
  },

  renderUsers() {
    $('users-table').innerHTML = state.users.map(u => `
      <tr>
        <td><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></td>
        <td>${ROLE_LABELS[u.role] || u.role}</td>
        <td>${u.active ? '<span class="pill green">Ativo</span>' : '<span class="pill">Inativo</span>'}</td>
        <td>
          <button class="icon-btn" onclick="App.editUser(${u.id})">Editar</button>
          <button class="icon-btn danger" onclick="App.deleteUserPermanently(${u.id})">Excluir</button>
        </td>
      </tr>
    `).join('');
  },

  renderReports() {
    const active = state.loans.filter(l => l.status === 'active');
    const overdue = active.filter(l => l.due_date < inputDate());
    const ranking = {};
    state.loans.forEach(l => { ranking[l.book_title] = (ranking[l.book_title] || 0) + 1; });
    const top = Object.entries(ranking).sort((a, b) => b[1] - a[1]).slice(0, 8);

    $('report-cards').innerHTML = [
      ['Acervo ativo', state.books.filter(b => b.active).length, false],
      ['Empréstimos totais', state.loans.length, false],
      ['Em atraso', overdue.length, overdue.length > 0],
      ['Leitores cadastrados', state.readers.length, false]
    ].map(([l, v, alert]) => `<div class="stat${alert ? ' alert' : ''}"><span>${icon('chart')}</span><div><small>${l}</small><strong>${v}</strong></div></div>`).join('');

    $('report-ranking').innerHTML = top.map(([name, total]) => `<tr><td>${esc(name)}</td><td>${total}</td></tr>`).join('')
      || '<tr><td colspan="2">Sem dados.</td></tr>';

    $('report-overdue').innerHTML = overdue.map(l => `
      <tr><td>${esc(l.book_title)}</td><td>${esc(l.reader_name || l.borrower_name)}</td><td>${localDate(l.due_date)}</td></tr>
    `).join('') || '<tr><td colspan="3">Nenhum atraso.</td></tr>';
  },

  // Preenche o formulário de configurações com os valores salvos no navegador.
  renderSettings() {
    const s = settings();
    if (!$('settings-form')) return;
    $('settings-form').elements.institution.value = s.institution || '';
    $('settings-form').elements.defaultDueDays.value = s.defaultDueDays || 7;
    $('settings-form').elements.defaultMinimumStock.value = s.defaultMinimumStock || 2;
    $('settings-theme').value = currentTheme();
  },

  openModal(title, html) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal').classList.add('open');
  },

  closeModal() {
    $('modal').classList.remove('open');
    state.pendingCatalog = null;
  },

  // Busca metadados do livro na Open Library a partir do ISBN digitado no formulário.
  async lookupCatalog() {
    const input = document.querySelector('#book-form [name="isbn"]');
    const isbn = (input?.value || '').trim();
    if (!isbn) return App.notify('Informe o ISBN antes de buscar.');
    const box = $('catalog-result');
    if (box) box.innerHTML = '<div class="lookup-loading">Consultando catálogo...</div>';
    try {
      const data = await apiFetch(`/catalog/lookup?isbn=${encodeURIComponent(isbn)}`);
      state.pendingCatalog = data;
      if (box) box.innerHTML = `
        <div class="lookup-preview">
          <img src="${esc(data.cover_image)}" alt="Capa encontrada">
          <div>
            <strong>${esc(data.title)}</strong>
            <small>${esc(data.author)}, ${esc(data.publisher || 'editora não informada')}</small>
            <em>Fonte: ${esc(data.source)}</em>
          </div>
          <button type="button" class="btn small" onclick="App.applyCatalog()">Usar dados</button>
        </div>`;
    } catch (e) {
      if (box) box.innerHTML = `<div class="lookup-error">${esc(e.message)}</div>`;
    }
  },

  // Copia os dados encontrados na consulta de ISBN para os campos do formulário de livro.
  applyCatalog() {
    const d = state.pendingCatalog;
    if (!d) return;
    const form = $('book-form');
    const fields = { title: d.title, author: d.author, isbn: d.isbn, publisher: d.publisher, publication_year: d.publication_year, cover_image: d.cover_image };
    for (const [name, value] of Object.entries(fields)) {
      const field = form?.elements[name];
      if (field && value) field.value = value;
    }
    const box = $('catalog-result');
    if (box) box.innerHTML = '<div class="lookup-success">Dados preenchidos. Revise antes de salvar.</div>';
    state.pendingCatalog = null;
  },

  field(label, name, value = '', req = false, type = 'text') {
    return `<label>${label}${req ? ' *' : ''}<input name="${name}" type="${type}" value="${esc(value)}" ${req ? 'required' : ''}></label>`;
  },

  openBookModal(id = null) {
    const b = id ? state.books.find(x => String(x.id) === String(id)) : {};
    const currentCover = coverSrc(b.cover_image);
    this.openModal(id ? 'Editar livro' : 'Novo livro', `
      <form id="book-form" class="form-grid">
        ${this.field('Título', 'title', b.title || '', true)}
        ${this.field('Autor', 'author', b.author || '', true)}
        <div class="isbn-lookup full">
          <label>ISBN<input name="isbn" value="${esc(b.isbn || '')}" placeholder="Ex.: 9788535902778"></label>
          <button type="button" class="btn" onclick="App.lookupCatalog()">Buscar dados do livro</button>
        </div>
        <div id="catalog-result" class="full"></div>
        ${this.field('Editora', 'publisher', b.publisher || '')}
        <div class="full cover-field">
          <label>Capa do livro</label>
          <div class="cover-row">
            <input name="cover_image" id="cover-url-input" placeholder="Cole a URL de uma imagem..." value="${esc(b.cover_image || '')}">
            <span class="cover-or">ou</span>
            <label class="btn cover-upload-btn">
              Enviar arquivo
              <input type="file" id="cover-file-input" accept="image/*" hidden>
            </label>
          </div>
          <div id="cover-upload-status" class="cover-upload-status"></div>
          <div id="cover-preview" class="cover-preview">${currentCover ? `<img src="${esc(currentCover)}" alt="Capa atual">` : ''}</div>
        </div>
        ${this.field('Ano de publicação', 'publication_year', b.publication_year || '', false, 'number')}
        ${this.field('Quantidade', 'quantity', b.quantity ?? 0, true, 'number')}
        ${this.field('Mínimo no estoque', 'minimum_quantity', b.minimum_quantity ?? (settings().defaultMinimumStock || 2), false, 'number')}
        <label>Categoria *
          <select name="category_id" required>
            ${state.categories.map(c => `<option value="${c.id}" ${String(c.id) === String(b.category_id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </label>
        <label class="full">Descrição<textarea name="description">${esc(b.description || '')}</textarea></label>
        <div class="full form-actions">
          <button class="btn primary">Salvar</button>
          <button type="button" class="btn" onclick="App.closeModal()">Cancelar</button>
        </div>
      </form>`);
    $('cover-file-input').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const status = $('cover-upload-status');
      const preview = $('cover-preview');
      if (status) status.textContent = 'Enviando imagem...';
      try {
        const fd = new FormData();
        fd.append('cover', file);
        const r = await apiFetch('/books/upload-cover', { method: 'POST', body: fd });
        $('cover-url-input').value = r.path;
        if (preview) preview.innerHTML = `<img src="${esc(coverSrc(r.path))}" alt="Capa enviada">`;
        if (status) status.textContent = 'Imagem enviada — revise e salve o livro.';
      } catch (err) {
        if (status) status.textContent = err.message;
      }
    });
    $('book-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      f.category_id = Number(f.category_id);
      f.quantity = Number(f.quantity);
      f.minimum_quantity = Number(f.minimum_quantity);
      f.publication_year = f.publication_year ? Number(f.publication_year) : null;
      f.active = id ? b.active : true;
      f.cover_image = f.cover_image?.trim() || null;
      try {
        await apiFetch(id ? `/books/${id}` : '/books', { method: id ? 'PUT' : 'POST', body: JSON.stringify(f) });
        this.closeModal();
        await this.refresh();
      } catch (x) { App.notify(x.message); }
    });
  },

  editBook(id) { this.openBookModal(id); },

  async inactivateBook(id) {
    if (!confirm('Inativar este livro?')) return;
    try { await apiFetch(`/books/${id}`, { method: 'DELETE' }); await this.refresh(); }
    catch (e) { App.notify(e.message); }
  },

  async reactivateBook(id) {
    if (!confirm('Reativar este livro?')) return;
    try { await apiFetch(`/books/${id}/reactivate`, { method: 'PUT' }); await this.refresh(); }
    catch (e) { App.notify(e.message); }
  },

  openLoanModal() {
    const active = state.books.filter(b => b.active && b.available_quantity > 0);
    if (!active.length) { App.notify('Não há livros disponíveis para empréstimo.'); return; }
    const s = settings();
    const due = new Date();
    due.setDate(due.getDate() + Number(s.defaultDueDays || 7));
    const today = inputDate();
    const overdueReaderIds = new Set(
      state.loans.filter(l => l.status === 'active' && l.due_date < today && l.reader_id).map(l => l.reader_id)
    );
    this.openModal('Novo empréstimo', `
      <form id="loan-form" class="form-grid">
        <label>Livro *
          <select name="book_id" required>
            ${active.map(b => `<option value="${b.id}">${esc(b.title)} — ${b.available_quantity} disponível(is)</option>`).join('')}
          </select>
        </label>
        <label>Leitor *
          <select name="reader_id" required>
            <option value="">Selecione um leitor</option>
            ${state.readers.filter(r => r.active).map(r => {
              const overdue = overdueReaderIds.has(r.id);
              return `<option value="${r.id}" ${overdue ? 'disabled' : ''}>${esc(r.name)} — ${esc(r.email || r.phone || '')}${overdue ? ' (em atraso — não pode emprestar)' : ''}</option>`;
            }).join('')}
          </select>
        </label>
        <button type="button" class="text-btn full" onclick="App.openReaderModal(true)">+ Cadastrar novo leitor</button>
        ${this.field('Data do empréstimo', 'loan_date', inputDate(), true, 'date')}
        ${this.field('Data prevista para devolução', 'due_date', inputDate(due), true, 'date')}
        <div class="full form-actions">
          <button class="btn primary">Registrar empréstimo</button>
          <button type="button" class="btn" onclick="App.closeModal()">Cancelar</button>
        </div>
      </form>`);
    $('loan-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      f.book_id = Number(f.book_id);
      f.reader_id = Number(f.reader_id);
      try {
        await apiFetch('/loans', { method: 'POST', body: JSON.stringify(f) });
        this.closeModal();
        await this.refresh();
      } catch (x) { App.notify(x.message); }
    });
  },

  async returnLoan(id) {
    if (!confirm('Confirmar devolução deste empréstimo?')) return;
    try { await apiFetch(`/loans/${id}/return`, { method: 'PUT', body: JSON.stringify({}) }); await this.refresh(); }
    catch (e) { App.notify(e.message); }
  },

  openReaderModal(fromLoan = false, id = null) {
    const r = id ? state.readers.find(x => String(x.id) === String(id)) : {};
    const statusField = id ? `
      <label>Status
        <select name="active">
          <option value="true" ${r.active !== false ? 'selected' : ''}>Ativo</option>
          <option value="false" ${r.active === false ? 'selected' : ''}>Inativo</option>
        </select>
      </label>` : '';
    this.openModal(id ? 'Editar leitor' : 'Novo leitor', `
      <form id="reader-form" class="form-grid">
        ${this.field('Nome completo', 'name', r.name || '', true)}
        ${this.field('E-mail', 'email', r.email || '', false, 'email')}
        ${this.field('Telefone', 'phone', r.phone || '')}
        ${this.field('Matrícula/identificação', 'registration', r.registration || '')}
        ${statusField}
        <div class="full form-actions">
          <button class="btn primary">Salvar leitor</button>
          <button type="button" class="btn" onclick="App.closeModal()">Cancelar</button>
        </div>
      </form>`);
    $('reader-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (f.active !== undefined) f.active = f.active === 'true';
      try {
        await apiFetch(id ? `/readers/${id}` : '/readers', { method: id ? 'PUT' : 'POST', body: JSON.stringify(f) });
        this.closeModal();
        await this.refresh();
        if (fromLoan) this.openLoanModal();
      } catch (x) { App.notify(x.message); }
    });
  },

  editReader(id) { this.openReaderModal(false, id); },

  async inactivateReader(id) {
    if (!confirm('Inativar este leitor? Ele continuará no histórico, mas não poderá receber novos empréstimos.')) return;
    try { await apiFetch(`/readers/${id}`, { method: 'DELETE' }); await this.refresh(); }
    catch (e) { App.notify(e.message); }
  },

  async deleteReaderPermanently(id) {
    const r = state.readers.find(x => String(x.id) === String(id));
    if (!confirm(`Excluir definitivamente o leitor "${r?.name || ''}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await apiFetch(`/readers/${id}/permanent`, { method: 'DELETE' });
      await this.refresh();
    } catch (e) { App.notify(e.message); }
  },

  openCategoryModal(id = null) {
    const c = id ? state.categories.find(x => String(x.id) === String(id)) : {};
    this.openModal(id ? 'Editar categoria' : 'Nova categoria', `
      <form id="cat-form">
        ${this.field('Nome', 'name', c.name || '', true)}
        <label>Descrição<textarea name="description">${esc(c.description || '')}</textarea></label>
        <div class="form-actions">
          <button class="btn primary">Salvar</button>
          <button type="button" class="btn" onclick="App.closeModal()">Cancelar</button>
        </div>
      </form>`);
    $('cat-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        await apiFetch(id ? `/categories/${id}` : '/categories', { method: id ? 'PUT' : 'POST', body: JSON.stringify(f) });
        this.closeModal();
        await this.refresh();
      } catch (x) { App.notify(x.message); }
    });
  },

  editCategory(id) { this.openCategoryModal(id); },

  async deleteCategory(id) {
    if (!confirm('Excluir esta categoria?')) return;
    try { await apiFetch(`/categories/${id}`, { method: 'DELETE' }); await this.refresh(); }
    catch (e) { App.notify(e.message); }
  },

  openUserModal(id = null) {
    const u = id ? state.users.find(x => String(x.id) === String(id)) : {};
    this.openModal(id ? 'Editar usuário' : 'Novo usuário', `
      <form id="user-form" class="form-grid">
        ${this.field('Nome', 'name', u.name || '', true)}
        ${this.field('E-mail', 'email', u.email || '', true, 'email')}
        <label class="full">Senha${id ? '' : ' *'}<input name="password" type="password" ${id ? '' : 'required'} minlength="8" pattern="(?=.*[A-Z])(?=.*\\d).{8,}" title="Mínimo 8 caracteres, com ao menos uma letra maiúscula e um número"></label>
        <small class="full" style="color:var(--muted);font-size:11px;margin-top:-8px">${id ? 'Deixe em branco para manter a senha atual. ' : ''}Mínimo 8 caracteres, com ao menos uma letra maiúscula e um número.</small>
        <label>Função
          <select name="role">
            <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Bibliotecário</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
        </label>
        <label>Status
          <select name="active">
            <option value="true" ${u.active !== false ? 'selected' : ''}>Ativo</option>
            <option value="false" ${u.active === false ? 'selected' : ''}>Inativo</option>
          </select>
        </label>
        <div class="full form-actions">
          <button class="btn primary">Salvar</button>
          <button type="button" class="btn" onclick="App.closeModal()">Cancelar</button>
        </div>
      </form>`);
    $('user-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      f.active = f.active === 'true';
      if (!f.password) delete f.password;
      try {
        await apiFetch(id ? `/users/${id}` : '/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(f) });
        this.closeModal();
        await this.refresh();
      } catch (x) { App.notify(x.message); }
    });
  },

  editUser(id) { this.openUserModal(id); },

  async deleteUserPermanently(id) {
    const u = state.users.find(x => String(x.id) === String(id));
    if (!confirm(`Excluir definitivamente o usuário "${u?.name || ''}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await apiFetch(`/users/${id}/permanent`, { method: 'DELETE' });
      await this.refresh();
    } catch (e) { App.notify(e.message); }
  },

  saveSettings() {
    const f = new FormData($('settings-form'));
    setSettings({
      institution: f.get('institution'),
      defaultDueDays: Number(f.get('defaultDueDays')) || 7,
      defaultMinimumStock: Number(f.get('defaultMinimumStock')) || 2
    });
    applyTheme($('settings-theme').value);
    App.notify('Configurações salvas.', 'success');
    this.render();
  }
};

window.App = App;
