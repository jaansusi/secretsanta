import { html, mount, $, on } from './dom.js';
import { emptyState } from './ui.js';

/**
 * Searchable, filterable, sortable table.
 * columns: [{ key, label, render(row), sortValue(row), align, sortable = true, className }]
 * filters: [{ key, label, test(row) }]  (first one is the default "all")
 */
export function dataTable(container, options) {
    const state = {
        rows: options.rows || [],
        search: options.initialSearch || '',
        filter: options.initialFilter || options.filters?.[0]?.key || null,
        sortKey: options.sort?.key || null,
        sortDir: options.sort?.dir || 'asc',
    };

    mount(container, html`
        <div class="toolbar">
            ${options.searchFields ? html`
                <label class="search"><i class="bi bi-search"></i><span class="sr-only">Search</span>
                    <input type="search" placeholder="${options.searchPlaceholder || 'Search'}" value="${state.search}" data-role="search"></label>` : ''}
            ${options.filters ? html`<div class="segmented" role="group" aria-label="Filter">
                ${options.filters.map(filter => html`<button type="button" data-filter="${filter.key}">${filter.label}</button>`)}
            </div>` : ''}
            <span class="spacer"></span>
            <span class="count" data-role="count"></span>
            ${options.toolbarExtra || ''}
        </div>
        <div class="table-wrap"><table class="table">
            <thead><tr>${options.columns.map(column => html`
                <th class="${column.sortable === false ? '' : 'sortable'} ${column.align === 'right' ? 'right' : ''}" data-key="${column.key}"
                    ${column.sortable === false ? '' : html`tabindex="0" aria-sort="none"`}>${column.label}<span class="sort"></span></th>`)}
            </tr></thead>
            <tbody data-role="body"></tbody>
        </table></div>
        <div data-role="empty"></div>`);

    const body = $('[data-role=body]', container);

    function visibleRows() {
        const term = state.search.trim().toLowerCase();
        const filter = options.filters?.find(f => f.key === state.filter);
        let rows = state.rows.filter(row => (!filter?.test || filter.test(row))
            && (!term || options.searchFields(row).some(field => String(field ?? '').toLowerCase().includes(term))));
        const column = options.columns.find(c => c.key === state.sortKey);
        if (column) {
            const value = column.sortValue || (row => row[column.key]);
            const direction = state.sortDir === 'asc' ? 1 : -1;
            rows = rows.slice().sort((a, b) => {
                const x = value(a), y = value(b);
                if (x === y) return 0;
                if (x === null || x === undefined || x === '') return 1;
                if (y === null || y === undefined || y === '') return -1;
                return (typeof x === 'string' ? x.localeCompare(y, undefined, { sensitivity: 'base' }) : x < y ? -1 : 1) * direction;
            });
        }
        return rows;
    }

    function draw() {
        const rows = visibleRows();
        mount(body, rows.map(row => html`
            <tr class="${options.onRowClick ? 'clickable' : ''}" data-key="${options.rowKey(row)}">
                ${options.columns.map(column => html`<td class="${column.align === 'right' ? 'right' : ''} ${column.className || ''}">${column.render ? column.render(row) : row[column.key]}</td>`)}
            </tr>`));
        mount($('[data-role=empty]', container), rows.length ? '' : emptyState(options.emptyIcon || 'inbox', state.rows.length ? 'No matches' : (options.emptyText || 'Nothing yet')));
        $('[data-role=count]', container).textContent = rows.length === state.rows.length
            ? `${state.rows.length} ${state.rows.length === 1 ? (options.noun || 'row') : (options.nounPlural || (options.noun || 'row') + 's')}`
            : `${rows.length} of ${state.rows.length}`;
        container.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === state.filter));
        container.querySelectorAll('th[data-key]').forEach(th => {
            const active = th.dataset.key === state.sortKey;
            th.querySelector('.sort').textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
            if (th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
        });
        options.onChange?.(state);
    }

    const searchInput = $('[data-role=search]', container);
    searchInput?.addEventListener('input', () => { state.search = searchInput.value; draw(); });
    on(container, 'click', '[data-filter]', (event, button) => { state.filter = button.dataset.filter; draw(); });
    const sortBy = th => {
        if (!th.classList.contains('sortable')) return;
        if (state.sortKey === th.dataset.key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = th.dataset.key; state.sortDir = options.columns.find(c => c.key === th.dataset.key)?.defaultDir || 'asc'; }
        draw();
    };
    on(container, 'click', 'th[data-key]', (event, th) => sortBy(th));
    on(container, 'keydown', 'th[data-key]', (event, th) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sortBy(th); } });
    if (options.onRowClick) {
        on(body, 'click', 'tr[data-key]', (event, tr) => {
            if (event.target.closest('button, a, input, select, label, audio')) return;
            const row = state.rows.find(r => String(options.rowKey(r)) === tr.dataset.key);
            if (row) options.onRowClick(row, event);
        });
    }

    draw();
    return {
        state,
        setRows(rows) { state.rows = rows; draw(); },
        visibleRows,
        findRow: key => state.rows.find(r => String(options.rowKey(r)) === String(key)),
    };
}
