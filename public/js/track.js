// Reports the few things only the browser can see (Santa's audio finishing, autoplay being blocked) to /track.
// Fire-and-forget: failures are ignored so the page never breaks because of analytics.
function trackEvent(type) {
    try {
        fetch('/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type }),
            keepalive: true,
        }).catch(function () { });
    } catch (e) { /* ignore */ }
}
