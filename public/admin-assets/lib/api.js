export class ApiError extends Error {
    constructor(message, status, details = null) {
        super(message);
        this.status = status;
        /** Every message when the server returned a list of them (e.g. all problems in an import file). */
        this.details = details;
    }
}

/** JSON client for /api/admin. Pass `form` (FormData) for uploads. */
export async function api(path, { method = 'GET', body, form } = {}) {
    const options = { method, headers: {}, credentials: 'same-origin' };
    if (form) {
        options.body = form;
    } else if (body !== undefined) {
        options.body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
    }
    let response;
    try {
        response = await fetch('/api/admin' + path, options);
    } catch {
        throw new ApiError('Network error. Check your connection.', 0);
    }
    if (response.status === 401) {
        // Session expired or revoked: the shell route shows the sign-in page.
        location.reload();
        throw new ApiError('Signed out', 401);
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
        const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
        throw new ApiError(message || `Request failed (${response.status})`, response.status, Array.isArray(data?.message) ? data.message : null);
    }
    return data;
}

/** Shared lookup data (current admin, event labels), fetched once per page load. */
let mePromise = null;
export function me() {
    if (!mePromise) mePromise = api('/me');
    return mePromise;
}
