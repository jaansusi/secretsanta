import { isDirty, setDirty, errorState } from './ui.js';
import { mount, html } from './dom.js';

const routes = [
    { pattern: /^\/admin\/?$/, nav: 'overview', title: 'Overview', load: () => import('../pages/overview.js') },
    { pattern: /^\/admin\/participants\/?$/, nav: 'participants', title: 'Participants', load: () => import('../pages/participants.js') },
    { pattern: /^\/admin\/participants\/(\d+)\/?$/, nav: 'participants', title: 'Participant', load: () => import('../pages/participant.js') },
    { pattern: /^\/admin\/families\/?$/, nav: 'families', title: 'Families', load: () => import('../pages/families.js') },
    { pattern: /^\/admin\/content\/?$/, nav: 'content', title: 'Dossiers', load: () => import('../pages/content.js') },
    { pattern: /^\/admin\/facts\/?$/, nav: 'facts', title: 'Agency facts', load: () => import('../pages/facts.js') },
    { pattern: /^\/admin\/audio\/?$/, nav: 'audio', title: 'Santa audio', load: () => import('../pages/audio.js') },
    { pattern: /^\/admin\/draw\/?$/, nav: 'draw', title: 'Draw & links', load: () => import('../pages/draw.js') },
    { pattern: /^\/admin\/analytics\/?$/, nav: 'analytics', title: 'Analytics', load: () => import('../pages/analytics.js') },
    { pattern: /^\/admin\/activity\/?$/, nav: 'activity', title: 'Activity log', load: () => import('../pages/activity.js') },
    { pattern: /^\/admin\/settings\/?$/, nav: 'settings', title: 'Settings', load: () => import('../pages/settings.js') },
];

let cleanup = null;
let renderToken = 0;
let lastRendered = null;

export function navigate(url, { replace = false } = {}) {
    if (isDirty() && !confirm('You have unsaved changes. Leave this page?')) {
        return;
    }
    setDirty(false);
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    route();
}

/** Updates the query string without re-rendering (filters, tabs). */
export function setQuery(params) {
    const url = new URL(location.href);
    Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') url.searchParams.delete(key);
        else url.searchParams.set(key, value);
    });
    history.replaceState(null, '', url);
}

export async function route() {
    const view = document.getElementById('view');
    const path = location.pathname;
    const match = routes.find(candidate => candidate.pattern.test(path));
    const token = ++renderToken;
    lastRendered = path + location.search;
    if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }

    document.querySelectorAll('.nav a').forEach(link => link.classList.toggle('active', !!match && link.dataset.nav === match.nav));
    document.getElementById('sidebar').classList.remove('open');

    if (!match) {
        mount(view, html`<h1>Not found</h1><p class="muted">There is no admin page at this address.</p><a href="/admin">Back to overview</a>`);
        return;
    }
    document.title = `${match.title} · Secret Santa Admin`;
    view.setAttribute('aria-busy', 'true');
    try {
        const page = await match.load();
        if (token !== renderToken) return;
        const params = path.match(match.pattern).slice(1);
        const query = new URLSearchParams(location.search);
        // Each page gets a fresh element, so listeners a page attached never leak into the next one.
        const container = document.createElement('div');
        const result = await page.render(container, { params, query, hash: location.hash.slice(1), isCurrent: () => token === renderToken });
        if (token !== renderToken) { if (typeof result === 'function') result(); return; }
        view.replaceChildren(container);
        cleanup = typeof result === 'function' ? result : null;
        if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
        else window.scrollTo(0, 0);
    } catch (error) {
        if (token !== renderToken) return;
        console.error(error);
        mount(view, html`<h1>${match.title}</h1><div style="margin-top:16px">${errorState(error)}</div>`);
    } finally {
        view.removeAttribute('aria-busy');
    }
}

export function startRouter() {
    document.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!link || link.dataset.external !== undefined || link.target === '_blank' || link.hasAttribute('download')) return;
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || !url.pathname.startsWith('/admin')) return;
        if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
        event.preventDefault();
        navigate(url.pathname + url.search + url.hash);
    });
    window.addEventListener('popstate', () => {
        // A jump to an anchor on the same page is not a new page.
        if (location.pathname + location.search === lastRendered) return;
        route();
    });
    route();
}
