// Tiny HTML templating: every interpolated value is escaped unless wrapped in raw() or produced by html``.

class SafeHtml {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
}

export function raw(value) {
    return new SafeHtml(String(value ?? ''));
}

export function esc(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toHtml(value) {
    if (value === null || value === undefined || value === false) return '';
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(toHtml).join('');
    return esc(value);
}

export function html(strings, ...values) {
    let out = strings[0];
    values.forEach((value, i) => { out += toHtml(value) + strings[i + 1]; });
    return new SafeHtml(out);
}

export function mount(element, content) {
    element.innerHTML = toHtml(content);
    return element;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Delegated event listener; handler gets (event, matchedElement). */
export function on(root, type, selector, handler) {
    const listener = event => {
        const target = event.target.closest(selector);
        if (target && root.contains(target)) handler(event, target);
    };
    root.addEventListener(type, listener);
    return () => root.removeEventListener(type, listener);
}

export function icon(name, extraClass = '') {
    return html`<i class="bi bi-${name} ${extraClass}" aria-hidden="true"></i>`;
}
