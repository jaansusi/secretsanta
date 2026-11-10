import { html, mount, esc } from './dom.js';
import { fmtNumber } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 0, 1, 2, 5, 10... style "nice" axis maximum and step for small counts. */
function niceScale(max, targetTicks = 4) {
    if (max <= 0) return { max: 4, step: 1 };
    const rough = max / targetTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 5, 10].map(m => m * magnitude).find(s => s >= rough) || magnitude * 10;
    const stepInt = Math.max(1, step);
    return { max: Math.ceil(max / stepInt) * stepInt, step: stepInt };
}

function observeWidth(container, draw) {
    let width = 0;
    const observer = new ResizeObserver(entries => {
        const next = Math.round(entries[0].contentRect.width);
        if (next && next !== width) { width = next; draw(width); }
    });
    observer.observe(container);
    return () => observer.disconnect();
}

function tooltipElement(container) {
    const tip = document.createElement('div');
    tip.className = 'tooltip hidden';
    container.appendChild(tip);
    return tip;
}

function placeTooltip(container, tip, x, y) {
    tip.classList.remove('hidden');
    const box = container.getBoundingClientRect();
    const tipWidth = tip.offsetWidth;
    let left = x + 12;
    if (left + tipWidth > box.width) left = x - tipWidth - 12;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${Math.max(0, y - tip.offsetHeight - 8)}px`;
}

/** Bar path with a 4px rounded data-end and a square baseline. */
function columnPath(x, y, width, height) {
    const r = Math.min(4, width / 2, height);
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/**
 * Multi-series line chart over categorical x positions (days).
 * series: [{ name, color (CSS var), values: number[] }]
 */
export function lineChart(container, { labels, series, height = 220, formatLabel = l => l }) {
    container.classList.add('chart');
    mount(container, html`
        ${series.length > 1 ? html`<div class="legend">${series.map(s => html`<span><span class="key-line" style="background:${s.color}"></span>${s.name}</span>`)}</div>` : ''}
        <div class="chart-canvas" style="position:relative"></div>`);
    const canvas = container.querySelector('.chart-canvas');

    const draw = width => {
        const margin = { top: 8, right: 12, bottom: 24, left: 32 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        const max = Math.max(0, ...series.flatMap(s => s.values));
        const scale = niceScale(max);
        const x = i => margin.left + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
        const y = v => margin.top + innerH - (v / scale.max) * innerH;

        const ticks = [];
        for (let v = 0; v <= scale.max; v += scale.step) ticks.push(v);
        const labelEvery = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(innerW / 70))));

        canvas.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" height="${height}" role="img" aria-label="${esc(series.map(s => s.name).join(' and '))} per day">
                ${ticks.map(v => `<line class="${v === 0 ? 'baseline' : 'gridline'}" x1="${margin.left}" x2="${width - margin.right}" y1="${y(v)}" y2="${y(v)}"/>
                    <text class="tick" x="${margin.left - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNumber(v)}</text>`).join('')}
                ${labels.map((label, i) => i % labelEvery === 0 ? `<text class="tick" x="${x(i)}" y="${height - 6}" text-anchor="middle">${esc(formatLabel(label))}</text>` : '').join('')}
                ${series.map(s => `<path d="${s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')}" fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
                ${series.map(s => { const i = s.values.length - 1; return i >= 0 ? `<circle cx="${x(i)}" cy="${y(s.values[i])}" r="4" style="fill:${s.color};stroke:var(--surface)" stroke-width="2"/>` : ''; }).join('')}
                <line class="crosshair hidden" y1="${margin.top}" y2="${margin.top + innerH}"/>
                <g class="hover-dots"></g>
                <rect x="${margin.left}" y="${margin.top}" width="${innerW}" height="${innerH}" fill="transparent" tabindex="0" class="hit"/>
            </svg>`;
        const svg = canvas.querySelector('svg');
        const crosshair = svg.querySelector('.crosshair');
        const dots = svg.querySelector('.hover-dots');
        const hit = svg.querySelector('.hit');
        const tip = tooltipElement(canvas);

        const show = index => {
            const cx = x(index);
            crosshair.setAttribute('x1', cx);
            crosshair.setAttribute('x2', cx);
            crosshair.classList.remove('hidden');
            dots.innerHTML = series.map(s => `<circle cx="${cx}" cy="${y(s.values[index])}" r="4" style="fill:${s.color};stroke:var(--surface)" stroke-width="2"/>`).join('');
            tip.innerHTML = `<div class="tt-title">${esc(formatLabel(labels[index], true))}</div>` +
                series.map(s => `<div class="tt-row"><span class="key-line" style="background:${s.color}"></span><strong>${fmtNumber(s.values[index])}</strong><span>${esc(s.name)}</span></div>`).join('');
            const scaleX = svg.getBoundingClientRect().width / width;
            placeTooltip(canvas, tip, cx * scaleX, y(Math.max(...series.map(s => s.values[index]))) * scaleX);
        };
        const hide = () => { crosshair.classList.add('hidden'); dots.innerHTML = ''; tip.classList.add('hidden'); };
        let focusIndex = labels.length - 1;
        hit.addEventListener('pointermove', event => {
            const box = svg.getBoundingClientRect();
            const px = (event.clientX - box.left) * (width / box.width);
            const index = Math.round(((px - margin.left) / innerW) * (labels.length - 1));
            focusIndex = Math.max(0, Math.min(labels.length - 1, index));
            show(focusIndex);
        });
        hit.addEventListener('pointerleave', hide);
        hit.addEventListener('focus', () => show(focusIndex));
        hit.addEventListener('blur', hide);
        hit.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft') focusIndex = Math.max(0, focusIndex - 1);
            else if (event.key === 'ArrowRight') focusIndex = Math.min(labels.length - 1, focusIndex + 1);
            else return;
            event.preventDefault();
            show(focusIndex);
        });
    };
    return observeWidth(canvas, draw);
}

/** Single-series column chart with a per-bar tooltip. */
export function columnChart(container, { labels, values, height = 180, color = 'var(--series-1)', formatLabel = l => l, valueLabel = 'events' }) {
    container.classList.add('chart');
    mount(container, html`<div class="chart-canvas" style="position:relative"></div>`);
    const canvas = container.querySelector('.chart-canvas');
    const draw = width => {
        const margin = { top: 8, right: 4, bottom: 22, left: 32 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        const scale = niceScale(Math.max(0, ...values));
        const band = innerW / labels.length;
        const barW = Math.min(24, Math.max(2, band - 2));
        const y = v => margin.top + innerH - (v / scale.max) * innerH;
        const ticks = [];
        for (let v = 0; v <= scale.max; v += scale.step) ticks.push(v);
        const labelEvery = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(innerW / 34))));
        canvas.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" height="${height}" role="img" aria-label="${esc(valueLabel)}">
                ${ticks.map(v => `<line class="${v === 0 ? 'baseline' : 'gridline'}" x1="${margin.left}" x2="${width - margin.right}" y1="${y(v)}" y2="${y(v)}"/>
                    <text class="tick" x="${margin.left - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNumber(v)}</text>`).join('')}
                ${values.map((v, i) => {
                    const bx = margin.left + i * band + (band - barW) / 2;
                    const h = (v / scale.max) * innerH;
                    return `<g class="col" data-index="${i}" tabindex="0">
                        <rect x="${margin.left + i * band}" y="${margin.top}" width="${band}" height="${innerH}" fill="transparent"/>
                        ${v > 0 ? `<path class="bar" d="${columnPath(bx, y(v), barW, h)}" style="fill:${color}"/>` : ''}
                    </g>`;
                }).join('')}
                ${labels.map((label, i) => i % labelEvery === 0 ? `<text class="tick" x="${margin.left + i * band + band / 2}" y="${height - 6}" text-anchor="middle">${esc(formatLabel(label))}</text>` : '').join('')}
            </svg>`;
        const svg = canvas.querySelector('svg');
        const tip = tooltipElement(canvas);
        const show = group => {
            const i = Number(group.dataset.index);
            svg.querySelectorAll('.bar').forEach(bar => bar.classList.toggle('dim', bar.parentNode !== group));
            tip.innerHTML = `<div class="tt-title">${esc(formatLabel(labels[i], true))}</div><div class="tt-row"><strong>${fmtNumber(values[i])}</strong><span>${esc(valueLabel)}</span></div>`;
            const scaleX = svg.getBoundingClientRect().width / width;
            placeTooltip(canvas, tip, (margin.left + i * band + band / 2) * scaleX, y(values[i]) * scaleX);
        };
        const hide = () => { svg.querySelectorAll('.bar').forEach(bar => bar.classList.remove('dim')); tip.classList.add('hidden'); };
        svg.querySelectorAll('.col').forEach(group => {
            group.addEventListener('pointerenter', () => show(group));
            group.addEventListener('focus', () => show(group));
            group.addEventListener('pointerleave', hide);
            group.addEventListener('blur', hide);
        });
    };
    return observeWidth(canvas, draw);
}

/** Horizontal bars in plain HTML, value at the tip. items: [{ label, value, note }] */
export function barList(container, items, { max = null, emptyText = 'No data' } = {}) {
    const top = max ?? Math.max(0, ...items.map(item => item.value));
    if (!items.length || top === 0) {
        mount(container, html`<div class="muted">${emptyText}</div>`);
        return;
    }
    mount(container, html`<div class="barlist">${items.map(item => html`
        <div class="barlist-row" title="${item.label}: ${fmtNumber(item.value)}${item.note ? ' (' + item.note + ')' : ''}">
            <span class="barlist-label">${item.label}</span>
            <span class="barlist-track"><span class="barlist-fill" style="display:block;width:${top ? (item.value / top) * 100 : 0}%"></span></span>
            <span class="barlist-value">${fmtNumber(item.value)}${item.note ? html`<small>${item.note}</small>` : ''}</span>
        </div>`)}</div>`);
}
