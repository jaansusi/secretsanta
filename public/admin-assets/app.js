import { startRouter } from './lib/router.js';
import { switchGroup } from './lib/group.js';

const sidebar = document.getElementById('sidebar');
const toggle = document.getElementById('menuToggle');
toggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', event => {
    if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && !toggle.contains(event.target)) {
        sidebar.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    }
});

const groupSwitcher = document.getElementById('groupSwitcher');
if (groupSwitcher) {
    const selected = groupSwitcher.value;
    groupSwitcher.addEventListener('change', async () => {
        if (!(await switchGroup(Number(groupSwitcher.value)))) {
            groupSwitcher.value = selected;
        }
    });
}

startRouter();
