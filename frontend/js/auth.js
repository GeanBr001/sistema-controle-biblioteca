const SESSION_KEY = "biblioteca_usuario";

export function getCurrentUser() {
    try {
        const saved = localStorage.getItem(SESSION_KEY);

        if (!saved) {
            return null;
        }

        return JSON.parse(saved);

    } catch {
        localStorage.removeItem(SESSION_KEY);
        return null;
    }
}

export function isAuthenticated() {
    return getCurrentUser() !== null;
}

export function requireAuth() {
    const user = getCurrentUser();

    if (!user) {
        window.location.href = "home.html";
        return null;
    }

    return user;
}

export function logout() {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "home.html";
}