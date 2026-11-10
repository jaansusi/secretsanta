import { html, mount, $, esc } from './dom.js';

// ---------- Toasts ----------
export function toast(message, type = 'info') {
    const container = document.getElementById('toasts');
    const element = document.createElement('div');
    element.className = `toast ${type === 'error' ? 'error' : ''}`;
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');
    mount(element, html`<i class="bi bi-${type === 'error' ? 'exclamation-octagon' : 'check2-circle'}"></i><span>${message}</span>`);
    container.appendChild(element);
    setTimeout(() => element.remove(), type === 'error' ? 7000 : 3500);
}

export function toastWarnings(warnings) {
    (warnings || []).forEach(warning => toast(warning, 'error'));
}

// ---------- Unsaved changes ----------
let dirty = false;
export function setDirty(value) { dirty = !!value; }
export function isDirty() { return dirty; }
window.addEventListener('beforeunload', event => {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
});

// ---------- Dialogs ----------
function openDialog(content, { wide = false } = {}) {
    const dialog = document.createElement('dialog');
    dialog.className = `modal ${wide ? 'wide' : ''}`;
    mount(dialog, content);
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 0));
    dialog.showModal();
    return dialog;
}

/**
 * Confirmation dialog. With `typeToConfirm`, the confirm button stays disabled until the
 * word is typed; it resolves to that word (the API expects it back) or null when cancelled.
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, typeToConfirm = null, details = null }) {
    return new Promise(resolve => {
        const dialog = openDialog(html`
            <form method="dialog">
                <div class="modal-head"><h2>${title}</h2><button class="icon-button" value="cancel" aria-label="Close"><i class="bi bi-x-lg"></i></button></div>
                <div class="modal-body">
                    <p>${message}</p>
                    ${details}
                    ${typeToConfirm ? html`
                        <div class="field" style="margin-top:14px">
                            <label for="confirmInput">Type <strong>${typeToConfirm}</strong> to confirm</label>
                            <input type="text" id="confirmInput" autocomplete="off" spellcheck="false">
                        </div>` : ''}
                </div>
                <div class="modal-foot">
                    <button class="btn" value="cancel">Cancel</button>
                    <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" value="ok" id="confirmOk" ${typeToConfirm ? 'disabled' : ''}>${confirmLabel}</button>
                </div>
            </form>`);
        const input = $('#confirmInput', dialog);
        const ok = $('#confirmOk', dialog);
        if (input) {
            input.addEventListener('input', () => { ok.disabled = input.value.trim() !== typeToConfirm; });
            input.focus();
        } else {
            ok.focus();
        }
        dialog.addEventListener('close', () => {
            const confirmed = dialog.returnValue === 'ok';
            resolve(confirmed ? (typeToConfirm || true) : null);
        });
    });
}

/**
 * A form in a dialog. onSubmit(formElement) may throw; the message is shown in the dialog and it stays
 * open. Resolves to whatever onSubmit returned, or null when cancelled.
 */
export function formDialog({ title, body, submitLabel = 'Save', onSubmit, wide = false, onOpen }) {
    return new Promise(resolve => {
        let result = null;
        const dialog = openDialog(html`
            <form novalidate>
                <div class="modal-head"><h2>${title}</h2><button type="button" class="icon-button" data-close aria-label="Close"><i class="bi bi-x-lg"></i></button></div>
                <div class="modal-body">
                    <div class="callout callout-danger modal-error hidden" role="alert"><i class="bi bi-exclamation-octagon"></i><span></span></div>
                    ${body}
                </div>
                <div class="modal-foot">
                    <button type="button" class="btn" data-close>Cancel</button>
                    <button type="submit" class="btn btn-primary">${submitLabel}</button>
                </div>
            </form>`, { wide });
        const form = $('form', dialog);
        const errorBox = $('.modal-error', dialog);
        dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const submit = $('button[type=submit]', form);
            submit.disabled = true;
            errorBox.classList.add('hidden');
            try {
                result = await onSubmit(form);
                dialog.close();
            } catch (err) {
                $('span', errorBox).textContent = err.message;
                errorBox.classList.remove('hidden');
            } finally {
                submit.disabled = false;
            }
        });
        dialog.addEventListener('close', () => resolve(result));
        if (onOpen) onOpen(dialog);
        const first = form.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea');
        if (first) first.focus();
    });
}

// ---------- Small pieces ----------
/** Extra explanation behind an icon; shown on hover and keyboard focus. */
export function info(text, { align = 'center', below = false } = {}) {
    return html`<span class="info ${align === 'right' ? 'tip-right' : align === 'left' ? 'tip-left' : ''} ${below ? 'tip-below' : ''}" tabindex="0" role="img" aria-label="${text}" data-tip="${text}"><i class="bi bi-info-circle"></i></span>`;
}

export function pageHead({ title, sub = '', actions = '', crumbs = null, help = '' }) {
    return html`
        <div class="page-head">
            <div>
                ${crumbs ? html`<div class="crumbs">${crumbs}</div>` : ''}
                <div class="title-row"><h1>${title}</h1>${help ? info(help, { align: 'left' }) : ''}</div>
                ${sub ? html`<div class="sub">${sub}</div>` : ''}
            </div>
            <div class="page-actions">${actions}</div>
        </div>`;
}

export function emptyState(iconName, message) {
    return html`<div class="empty"><i class="bi bi-${iconName}"></i>${message}</div>`;
}

export function errorState(error) {
    return html`<div class="callout callout-danger"><i class="bi bi-exclamation-octagon"></i><span>${error.message || String(error)}</span></div>`;
}

export function meter(part, whole) {
    const value = whole ? Math.min(100, Math.round((part / whole) * 100)) : 0;
    return html`<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${whole}" aria-valuenow="${part}"><span style="width:${value}%"></span></div>`;
}

export function statusIcon(status) {
    const icons = {
        done: 'check-circle-fill', pass: 'check-circle-fill', todo: 'circle', na: 'dash-circle',
        warn: 'exclamation-triangle-fill', fail: 'x-circle-fill', info: 'info-circle',
    };
    const labels = { done: 'Done', pass: 'Passes', todo: 'To do', na: 'Not applicable', warn: 'Needs attention', fail: 'Fails', info: 'Info' };
    return html`<i class="bi bi-${icons[status] || 'circle'} status-icon status-${status}" role="img" aria-label="${labels[status] || status}"></i>`;
}

export async function copyText(text, label = 'Copied') {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
    }
    toast(label);
}

/** Downloads rows as a CSV file. columns: [{ label, value(row) }]. */
export function downloadCsv(filename, columns, rows) {
    const cell = value => {
        const text = value === null || value === undefined ? '' : String(value);
        return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [columns.map(column => cell(column.label)).join(',')]
        .concat(rows.map(row => columns.map(column => cell(column.value(row))).join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function selectOptions(items, selected, { empty = null } = {}) {
    return html`${empty !== null ? html`<option value="">${empty}</option>` : ''}${items.map(item =>
        html`<option value="${item.value}" ${String(item.value) === String(selected ?? '') ? 'selected' : ''}>${item.label}</option>`)}`;
}

export { esc };
