import { api } from './api.js';
import { isDirty, setDirty, toast } from './ui.js';

/** The section of an admin path (/admin/participants/12 → /admin/participants): detail pages belong to one group. */
export function sectionOf(path) {
    const match = /^\/admin(\/[\w-]+)?/.exec(path);
    return match ? match[0] : '/admin';
}

/**
 * Makes another group the one the panel manages, then reloads, so no page keeps showing the previous group's
 * data. `target` defaults to the current section.
 */
export async function switchGroup(groupId, target = sectionOf(location.pathname)) {
    if (isDirty() && !confirm('You have unsaved changes. Switch group anyway?')) {
        return false;
    }
    try {
        await api('/group', { method: 'POST', body: { groupId } });
    } catch (err) {
        toast(err.message, 'error');
        return false;
    }
    setDirty(false);
    location.assign(target);
    return true;
}
