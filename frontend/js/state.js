// Estado global da aplicação, utilitários de toast e confirmação.

// ESTADO GLOBAL

export const VIEW_MODE  = { CLIENT: 'client',  ADMIN: 'admin'       };
export const ACTIVE_TAB = { LIVROS: 'livros',  USUARIOS: 'usuarios' };

export const State = {

  // autenticação e navegação
  auth: {
    currentUser: null,
    viewMode: VIEW_MODE.CLIENT,
    activeTab: ACTIVE_TAB.LIVROS,
  },

  // dados e UI de livros
  books: {
    all: [],
    selected: null,
    page: 1,
    perPage: 12,

    isEditing: false,
    editForm: { title: '', description: '', price: '', stock: '', status: 'active', categoryId: '', author: '' },
    editErrors: {},
    editCoverFile: null,

    newForm: { title: '', description: '', price: '', stock: '', status: 'active', categoryId: '', author: '' },
    newFormErrors: {},
    newCoverFile: null,
  },

  // dados e UI de usuários
  users: {
    all: [],
    selected: null,
    page: 1,
    perPage: 10,

    isEditing: false,
    editForm: { name: '', email: '', phone: '', role: 'client', street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '' },
    editErrors: {},

    newForm: { name: '', email: '', password: '', phone: '', role: 'client', street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '' },
    newFormErrors: {},
  },

  // callback chamado após deletar um livro/usuário para recarregar a lista
  reloadCallback: null,
};

// TOAST (notificação)

let toastTimer = null;

export function showToast(message, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = type;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

// expõe globalmente porque é chamada de dentro de strings HTML geradas dinamicamente
window.showToast = showToast;

// MODAL DE CONFIRMAÇÃO

let confirmCallback = null;

export function showConfirm(message, callback) {
  document.getElementById('confirm-msg').textContent = message;
  document.getElementById('confirm-overlay').classList.add('open');
  confirmCallback = callback;
}

export function confirmYes() {
  document.getElementById('confirm-overlay').classList.remove('open');
  confirmCallback?.();
  confirmCallback = null;
}

export function confirmNo() {
  document.getElementById('confirm-overlay').classList.remove('open');
  confirmCallback = null;
}