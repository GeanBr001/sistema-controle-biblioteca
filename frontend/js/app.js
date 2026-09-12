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
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Zm10-13 4 4M13 5l4 4"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zm5 7h8"/></svg>',
  restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5M20 5v6h-6"/></svg>'
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

  toggleTheme() { toggleTheme(); },

  toggleMobileMenu() { document.querySelector('.sidebar')?.classList.toggle('open'); },

  showLogin() {
    $('login-page').style.display = 'flex';
    $('app-shell').style.display = 'none';
    $('login-page').innerHTML = `
      <div class="login-card">
        <div class="brand-mark">B</div>
        <span class="eyebrow">SISTEMA DE BIBLIOTECA</span>
        <h1>Controle de acervo</h1>
        <p>Acesse o painel administrativo para gerenciar livros, leitores e circulação.</p>
        <form id="login-form">
          <label>E-mail<input name="email" type="email" required placeholder="admin@biblioteca.local"></label>
          <label>Senha<input name="password" type="password" required placeholder="••••••••"></label>
          <button class="btn primary" type="submit">Entrar</button>
          <div id="login-error" class="error"></div>
        </form>
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
      settings: ['Sistema', 'Configurações']
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
      ['Total de livros', d.total_books, '▮▮'],
      ['Disponíveis', d.available_copies, '◔'],
      ['Emprestados', d.active_loans, '↗'],
      ['Estoque baixo', d.low_stock_books, '!']
    ].map(([l, v, i]) => `<div class="stat"><span>${i}</span><div><small>${l}</small><strong>${v ?? 0}</strong></div></div>`).join('');

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

  renderBooks() {
    const q = ($('book-search')?.value || '').toLowerCase();
    const rows = state.books.filter(b => `${b.title} ${b.author} ${b.category_name}`.toLowerCase().includes(q));
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
        ? `<button class="icon-btn danger" title="Inativar livro" aria-label="Inativar livro" onclick="App.inactivateBook(${b.id})">${icon('archive')}</button>`
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
            </div>
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="7">Nenhum livro encontrado.</td></tr>';
  },

  renderLoans() {
    const active = state.loans.filter(l => l.status === 'active');
    const today = inputDate();
    $('loans-table').innerHTML = active.map(l => {
      const statusPill = l.due_date < today ? '<span class="pill warn">Atrasado</span>' : '<span class="pill green">Ativo</span>';
      return `
        <tr>
          <td><strong>${esc(l.book_title)}</strong><small>${esc(l.book_author)}</small></td>
          <td><strong>${esc(l.reader_name || l.borrower_name)}</strong><small>${esc(l.reader_email || '')} ${esc(l.reader_phone || '')}</small></td>
          <td>${localDate(l.loan_date || l.created_at)}</td>
          <td>${localDate(l.due_date)}</td>
          <td>${statusPill}</td>
          <td><button class="icon-btn" onclick="App.returnLoan(${l.id})">Registrar devolução</button></td>
        </tr>`;
    }).join('') || '<tr><td colspan="6">Nenhum empréstimo ativo.</td></tr>';
  },

  renderReturns() {
    const returned = state.loans.filter(l => l.status === 'returned');
    $('returns-table').innerHTML = returned.map(l => `
      <tr>
        <td><strong>${esc(l.book_title)}</strong><small>${esc(l.book_author)}</small></td>
        <td>${esc(l.reader_name || l.borrower_name)}<small>${esc(l.reader_email || '')} ${esc(l.reader_phone || '')}</small></td>
        <td>${localDate(l.loan_date || l.created_at)}</td>
        <td>${localDate(l.return_date || l.returned_at, true)}</td>
        <td><span class="pill green">Devolvido</span></td>
      </tr>
    `).join('') || '<tr><td colspan="5">Nenhuma devolução registrada.</td></tr>';
  },

  renderReaders() {
    const q = ($('reader-search')?.value || '').toLowerCase();
    const rows = (state.readers || []).filter(r => `${r.name} ${r.email || ''} ${r.phone || ''} ${r.registration || ''}`.toLowerCase().includes(q));
    $('readers-table').innerHTML = rows.map(r => {
      const statusPill = r.active ? '<span class="pill green">Ativo</span>' : '<span class="pill">Inativo</span>';
      const inactivateBtn = r.active ? `<button class="icon-btn danger" onclick="App.inactivateReader(${r.id})">Inativar</button>` : '';
      return `
        <tr>
          <td><strong>${esc(r.name)}</strong><small>${esc(r.registration || 'Sem matrícula')}</small></td>
          <td>${esc(r.email || '—')}</td>
          <td>${esc(r.phone || '—')}</td>
          <td>${r.active_loans || 0}</td>
          <td>${statusPill}</td>
          <td><button class="icon-btn" onclick="App.editReader(${r.id})">Editar</button>${inactivateBtn}</td>
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
        <td><button class="icon-btn" onclick="App.editUser(${u.id})">Editar</button></td>
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
      ['Acervo ativo', state.books.filter(b => b.active).length],
      ['Empréstimos totais', state.loans.length],
      ['Em atraso', overdue.length],
      ['Leitores cadastrados', state.readers.length]
    ].map(([l, v]) => `<div class="stat"><span>▦</span><div><small>${l}</small><strong>${v}</strong></div></div>`).join('');

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
    if (!isbn) return alert('Informe o ISBN antes de buscar.');
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
            <small>${esc(data.author)} · ${esc(data.publisher || 'Editora não informada')}</small>
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
        ${this.field('Capa (URL ou caminho opcional)', 'cover_image', b.cover_image || '')}
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
      } catch (x) { alert(x.message); }
    });
  },

  editBook(id) { this.openBookModal(id); },

  async inactivateBook(id) {
    if (!confirm('Inativar este livro?')) return;
    try { await apiFetch(`/books/${id}`, { method: 'DELETE' }); await this.refresh(); }
    catch (e) { alert(e.message); }
  },

  async reactivateBook(id) {
    if (!confirm('Reativar este livro?')) return;
    try { await apiFetch(`/books/${id}/reactivate`, { method: 'PUT' }); await this.refresh(); }
    catch (e) { alert(e.message); }
  },

  openLoanModal() {
    const active = state.books.filter(b => b.active && b.available_quantity > 0);
    if (!active.length) { alert('Não há livros disponíveis para empréstimo.'); return; }
    const s = settings();
    const due = new Date();
    due.setDate(due.getDate() + Number(s.defaultDueDays || 7));
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
            ${state.readers.filter(r => r.active).map(r => `<option value="${r.id}">${esc(r.name)} — ${esc(r.email || r.phone || '')}</option>`).join('')}
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
      } catch (x) { alert(x.message); }
    });
  },

  async returnLoan(id) {
    if (!confirm('Confirmar devolução deste empréstimo?')) return;
    try { await apiFetch(`/loans/${id}/return`, { method: 'PUT', body: JSON.stringify({}) }); await this.refresh(); }
    catch (e) { alert(e.message); }
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
      } catch (x) { alert(x.message); }
    });
  },

  editReader(id) { this.openReaderModal(false, id); },

  async inactivateReader(id) {
    if (!confirm('Inativar este leitor?')) return;
    try { await apiFetch(`/readers/${id}`, { method: 'DELETE' }); await this.refresh(); }
    catch (e) { alert(e.message); }
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
      } catch (x) { alert(x.message); }
    });
  },

  editCategory(id) { this.openCategoryModal(id); },

  async deleteCategory(id) {
    if (!confirm('Excluir esta categoria?')) return;
    try { await apiFetch(`/categories/${id}`, { method: 'DELETE' }); await this.refresh(); }
    catch (e) { alert(e.message); }
  },

  openUserModal(id = null) {
    const u = id ? state.users.find(x => String(x.id) === String(id)) : {};
    this.openModal(id ? 'Editar usuário' : 'Novo usuário', `
      <form id="user-form" class="form-grid">
        ${this.field('Nome', 'name', u.name || '', true)}
        ${this.field('E-mail', 'email', u.email || '', true, 'email')}
        ${this.field('Senha', 'password', '', !id, 'password')}
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
      } catch (x) { alert(x.message); }
    });
  },

  editUser(id) { this.openUserModal(id); },

  saveSettings() {
    const f = new FormData($('settings-form'));
    setSettings({
      institution: f.get('institution'),
      defaultDueDays: Number(f.get('defaultDueDays')) || 7,
      defaultMinimumStock: Number(f.get('defaultMinimumStock')) || 2
    });
    applyTheme($('settings-theme').value);
    alert('Configurações salvas.');
    this.render();
  }
};

window.App = App;
