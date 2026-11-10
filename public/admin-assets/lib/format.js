const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dateTimeYearFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const numberFormat = new Intl.NumberFormat('en-GB');

export function fmtDate(value) {
    return value ? dateFormat.format(new Date(value)) : '';
}

export function fmtDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return (date.getFullYear() === new Date().getFullYear() ? dateTimeFormat : dateTimeYearFormat).format(date);
}

export function relTime(value) {
    if (!value) return '';
    const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 45) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
    return fmtDate(value);
}

export function fmtNumber(value) {
    return numberFormat.format(value ?? 0);
}

export function fmtBytes(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function pct(part, whole) {
    return whole ? Math.round((part / whole) * 100) : 0;
}

export function plural(count, one, many = one + 's') {
    return `${fmtNumber(count)} ${count === 1 ? one : many}`;
}

/** Today in the browser's zone as YYYY-MM-DD. */
export function isoDay(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

export function daysUntil(day) {
    if (!day) return null;
    const target = new Date(day + 'T00:00:00');
    const today = new Date(isoDay() + 'T00:00:00');
    return Math.round((target - today) / 86400000);
}
