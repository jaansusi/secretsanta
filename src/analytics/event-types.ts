/** Every event type the site records, with the label the admin panel shows for it. */
export const EVENT_TYPES = {
    page_view: 'Opened the site',
    link_open: 'Opened personal link',
    link_invalid: 'Used an invalid link code',
    login_google: 'Signed in with Google',
    login_failed: 'Google sign-in not recognised',
    reveal: 'Opened their mission',
    reveal_error: 'Mission failed to open',
    reveal_closed: 'Tried to open mission while closed',
    letter_view: "Opened Santa's letter",
    briefing_complete: 'Heard Santa to the end',
    briefing_replay: 'Replayed Santa',
    autoplay_blocked: 'Audio autoplay was blocked',
} as const;

export type EventType = keyof typeof EVENT_TYPES;

/** Events the browser may report through POST /track. Everything else is recorded server-side only. */
export const CLIENT_EVENT_TYPES: EventType[] = ['briefing_complete', 'briefing_replay', 'autoplay_blocked'];

/** Event types that count as someone visiting the site. */
export const VISIT_TYPES: EventType[] = ['page_view', 'link_open'];
