const KEY='biblioteca_tema';
export function applyTheme(t){document.documentElement.dataset.theme=t==='light'?'light':'dark';localStorage.setItem(KEY,document.documentElement.dataset.theme)}
export function initTheme(){applyTheme(localStorage.getItem(KEY)||'dark')}
export function toggleTheme(){applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')}
export function currentTheme(){return document.documentElement.dataset.theme||'dark'}
