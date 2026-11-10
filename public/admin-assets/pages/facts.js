import { api } from '../lib/api.js';
import { html, mount, $, $$, on } from '../lib/dom.js';
import { pageHead, formDialog, toast, info } from '../lib/ui.js';
import { setQuery } from '../lib/router.js';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Shown', test: f => f.active },
    { key: 'off', label: 'Off', test: f => !f.active },
    { key: 'unused', label: 'Not in any dossier', test: f => f.active && f.shownTo.length === 0 },
];

/**
 * Agency facts, edited directly in the table. Text cells are inputs: Enter or leaving the field saves,
 * Enter also moves to the next row, Escape undoes the edit. The top row adds a new fact.
 */
export async function render(view, { query }) {
    let data = await api('/facts');
    const state = {
        search: query.get('q') || '',
        filter: FILTERS.some(f => f.key === query.get('filter')) ? query.get('filter') : 'all',
    };

    mount(view, html`
        ${pageHead({
            title: 'Agency facts',
            help: "Each dossier shows a few of these under Agentuuri andmed, picked by the recipient's name. The same person keeps the same facts while the list stays the same.",
            actions: html`<button class="btn" id="pasteMany"><i class="bi bi-clipboard-plus"></i>Paste many</button>`,
        })}
        <section class="card">
            <div class="toolbar">
                <label class="search"><i class="bi bi-search"></i><span class="sr-only">Search</span>
                    <input type="search" id="factSearch" placeholder="Search facts" value="${state.search}"></label>
                <div class="segmented" role="group" aria-label="Filter">${FILTERS.map(f => html`<button type="button" data-filter="${f.key}">${f.label}</button>`)}</div>
                <span class="spacer"></span>
                <span class="count" id="factCount"></span>
            </div>
            <div class="table-wrap"><table class="table dense">
                <thead><tr><th class="fit">#</th><th>Fact</th><th class="fit">Shown to</th><th class="fit">On</th><th class="fit"></th></tr></thead>
                <tbody>
                    <tr><td class="fit muted"><i class="bi bi-plus-lg"></i></td>
                        <td colspan="4"><input type="text" class="inline-edit inline-add" id="newFact" maxlength="300" placeholder="New fact, press Enter to add" autocomplete="off"></td></tr>
                </tbody>
                <tbody id="factRows"></tbody>
            </table></div>
        </section>`);

    const rows = $('#factRows', view);

    const visible = () => {
        const term = state.search.trim().toLowerCase();
        const filter = FILTERS.find(f => f.key === state.filter);
        return data.facts.filter(f => (!filter.test || filter.test(f)) && (!term || f.text.toLowerCase().includes(term)));
    };

    const shownToCell = fact => {
        if (!fact.active) return html`<span class="muted">Off</span>`;
        if (!fact.shownTo.length) return html`<span class="muted">Nobody</span>`;
        return html`<span class="num">${fact.shownTo.length}</span>${info(fact.shownTo.map(p => p.name).join(', '), { align: 'right' })}`;
    };

    const draw = () => {
        const list = visible();
        mount(rows, list.map(fact => html`
            <tr data-id="${fact.id}" class="${fact.active ? '' : 'inactive'}">
                <td class="fit num muted">${data.facts.indexOf(fact) + 1}</td>
                <td><input type="text" class="inline-edit" data-text="${fact.id}" value="${fact.text}" maxlength="300" aria-label="Fact ${data.facts.indexOf(fact) + 1}"></td>
                <td class="fit">${shownToCell(fact)}</td>
                <td class="fit"><label class="switch" title="${fact.active ? 'Shown in dossiers' : 'Not shown'}"><input type="checkbox" data-active="${fact.id}" ${fact.active ? 'checked' : ''} aria-label="Show in dossiers"><span class="track"></span></label></td>
                <td class="fit"><span class="row-state" data-state="${fact.id}"></span><button class="icon-button danger" data-delete="${fact.id}" aria-label="Delete" title="Delete"><i class="bi bi-trash3"></i></button></td>
            </tr>`));
        if (!list.length) mount(rows, html`<tr><td colspan="5" class="empty">${data.facts.length ? 'No matches' : 'No facts yet'}</td></tr>`);
        view.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === state.filter));
        const active = data.facts.filter(f => f.active).length;
        $('#factCount', view).textContent = `${list.length === data.facts.length ? data.facts.length : `${list.length} of ${data.facts.length}`} · ${active} shown · ${data.perDossier} per dossier`;
        setQuery({ q: state.search || null, filter: state.filter === 'all' ? null : state.filter });
    };

    const setRowState = (id, status) => {
        const element = view.querySelector(`[data-state="${id}"]`);
        if (!element) return;
        element.className = `row-state ${status}`;
        element.innerHTML = status === 'saving' ? '<i class="bi bi-arrow-repeat"></i>' : status === 'saved' ? '<i class="bi bi-check-lg"></i>' : status === 'error' ? '<i class="bi bi-exclamation-circle"></i>' : '';
        if (status === 'saved') {
            setTimeout(() => {
                if (element.classList.contains('saved')) { element.className = 'row-state'; element.innerHTML = ''; }
            }, 1500);
        }
    };

    // ---------- Inline text editing ----------
    const saveText = async input => {
        const id = Number(input.dataset.text);
        const fact = data.facts.find(f => f.id === id);
        const text = input.value.trim();
        if (!fact || text === fact.text) { input.value = fact?.text ?? input.value; return; }
        if (!text) { input.value = fact.text; return toast('A fact cannot be empty. Use delete instead.', 'error'); }
        setRowState(id, 'saving');
        try {
            await api(`/facts/${id}`, { method: 'PATCH', body: { text } });
            // The table may have been redrawn meanwhile (e.g. a toggle), so update whatever is current.
            const current = data.facts.find(f => f.id === id);
            if (current) current.text = text;
            const currentInput = view.querySelector(`[data-text="${id}"]`);
            if (currentInput && document.activeElement !== currentInput) currentInput.value = text;
            setRowState(id, 'saved');
        } catch (err) {
            setRowState(id, 'error');
            toast(err.message, 'error');
        }
    };
    on(view, 'keydown', '[data-text]', (event, input) => {
        if (event.key === 'Escape') {
            input.value = data.facts.find(f => f.id === Number(input.dataset.text))?.text ?? input.value;
            input.blur();
        } else if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const inputs = $$('[data-text]', view);
            const next = inputs[inputs.indexOf(input) + (event.key === 'ArrowUp' ? -1 : 1)];
            if (next) next.focus(); else input.blur();
        }
    });
    on(view, 'focusout', '[data-text]', (event, input) => saveText(input));
    on(view, 'focusin', '[data-text]', (event, input) => input.select());

    // ---------- Add ----------
    const newFact = $('#newFact', view);
    newFact.addEventListener('keydown', async event => {
        if (event.key !== 'Enter' || !newFact.value.trim()) return;
        event.preventDefault();
        const text = newFact.value.trim();
        newFact.disabled = true;
        try {
            data = await api('/facts', { method: 'POST', body: { text } });
            newFact.value = '';
            if (state.filter === 'off') state.filter = 'all';
            draw();
            toast('Fact added');
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            newFact.disabled = false;
            newFact.focus();
        }
    });

    $('#pasteMany', view).addEventListener('click', async () => {
        const result = await formDialog({
            title: 'Add many facts',
            submitLabel: 'Add facts',
            body: html`<div class="field"><label for="bulkFacts">One fact per line</label><textarea id="bulkFacts" name="facts" rows="12"></textarea></div>`,
            onSubmit: form => {
                const texts = String(new FormData(form).get('facts')).split(/\r?\n/).map(t => t.trim()).filter(Boolean);
                if (!texts.length) throw new Error('Paste at least one fact');
                return api('/facts', { method: 'POST', body: { texts } });
            },
        });
        if (result) {
            data = result;
            draw();
            toast(`Added ${result.ids.length} fact${result.ids.length === 1 ? '' : 's'}`);
        }
    });

    // ---------- Toggle and delete ----------
    on(view, 'change', '[data-active]', async (event, input) => {
        const id = Number(input.dataset.active);
        try {
            data = await api(`/facts/${id}`, { method: 'PATCH', body: { active: input.checked } });
            draw();
        } catch (err) {
            input.checked = !input.checked;
            toast(err.message, 'error');
        }
    });
    on(view, 'click', '[data-delete]', async (event, button) => {
        const id = Number(button.dataset.delete);
        try {
            const result = await api(`/facts/${id}`, { method: 'DELETE' });
            data = result;
            draw();
            toast('Fact deleted', 'info', {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        data = await api('/facts', { method: 'POST', body: { text: result.removed.text, active: result.removed.active } });
                        draw();
                    },
                },
            });
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // ---------- Search and filter ----------
    $('#factSearch', view).addEventListener('input', event => { state.search = event.target.value; draw(); });
    on(view, 'click', '[data-filter]', (event, button) => { state.filter = button.dataset.filter; draw(); });

    draw();
}
