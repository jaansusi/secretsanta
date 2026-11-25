// The session cookie is httpOnly (not readable from script), so the server renders the login state and
// the clip playlist into data-* attributes on <body> (no inline script, so the CSP can forbid it).
const pageState = document.body.dataset;
const isLoggedIn = pageState.loggedIn === 'true';
window.SANTA_CLIPS = (function () {
    try {
        return pageState.santaClips ? JSON.parse(pageState.santaClips) : null;
    } catch (e) {
        return null;
    }
})();

if (isLoggedIn) {
    document.getElementById('logoutContainer').classList.remove('hidden');
}

function showBriefingError(message) {
    const errorBox = document.getElementById('briefingError');
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
}

const CLIP_ROTATION_KEY = 'santaClipRotation';

/** True when generated intro and outro clips exist (their URLs are rendered into the page). */
function hasClipLibrary() {
    const library = window.SANTA_CLIPS;
    return !!library && library.intros.length > 0 && library.outros.length > 0;
}

function clipUrl(kind, index) {
    return window.SANTA_CLIPS[kind + 's'][index];
}

function readClipRotation() {
    try {
        return parseInt(localStorage.getItem(CLIP_ROTATION_KEY) || '0', 10) || 0;
    } catch (e) {
        // No storage (private mode etc.): still vary between visits.
        return Math.floor(Math.random() * 1000);
    }
}

/**
 * Which intro, name-line variant and outro this visit gets. A counter in localStorage moves on
 * every accepted mission (advanceClipRotation), so a refresh gives a different combination.
 * The outro and name line also shift by one per full cycle through the intros, so the same
 * intro is not always paired with the same outro.
 */
function clipRotation() {
    const library = window.SANTA_CLIPS || { intros: [], outros: [] };
    const counter = readClipRotation();
    const intros = Math.max(library.intros.length, 1);
    const cycle = Math.floor(counter / intros);
    return {
        intro: counter % intros,
        outro: (counter + 1 + cycle) % Math.max(library.outros.length, 1),
        name: counter + cycle,  // reduced modulo the recipient's clip count once that is known
    };
}

function advanceClipRotation() {
    try {
        localStorage.setItem(CLIP_ROTATION_KEY, String(readClipRotation() + 1));
    } catch (e) { /* storage unavailable, rotation is random anyway */ }
}

/** Called from the "accept mission" button: starts Santa's briefing and fetches the name. */
function acceptMission() {
    const submit = document.getElementById('submit');
    submit.disabled = true;
    document.getElementById('briefingError').classList.add('hidden');

    // Start the first clip inside the click handler, otherwise mobile browsers block it.
    // With a clip library the intro starts now and the name line + outro are queued once we know the recipient.
    const briefing = document.getElementById('briefingPlayer');
    const useClips = hasClipLibrary();
    const rotation = clipRotation();
    const playAttempt = startBriefing([useClips ? clipUrl('intro', rotation.intro) : briefingSource()]);
    if (useClips) advanceClipRotation();

    fetch("/result", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        redirect: "follow",
        body: JSON.stringify({
            code: document.getElementById('userCode').value
        }),
    }).then(async response => {
        const body = await response.json().catch(() => ({}));
        if (response.status === 429) {
            return { error: 'Liiga palju katseid, oota hetk ja proovi uuesti.' };
        }
        if (!response.ok && !body.error) {
            return { error: 'Midagi läks valesti, proovi uuesti.' };
        }
        return body;
    }).then(res => {
        if (res.error) {
            briefing.pause();
            showBriefingError(res.error);
            submit.disabled = false;
            return;
        }
        const authContainer = document.getElementById('authContainer');
        if (authContainer) authContainer.classList.add('hidden');
        document.getElementById('inputContainer').classList.add('hidden');
        document.getElementById('logoutContainer').classList.remove('hidden');

        renderDossier(res);
        showSoundToggle();

        if (!snowActive) {
            snowActive = true;
            createSnowFlakes();
        }
        const dossier = res.dossier || {};
        const nameClips = (dossier.clips && dossier.clips.names) || [];
        briefingFinalized = true;
        if (useClips) {
            if (nameClips.length > 0) {
                queueBriefingClips([nameClips[rotation.name % nameClips.length], clipUrl('outro', rotation.outro)]);
            } else if (dossier.hasAudio) {
                // No generated name clip for this recipient yet: the hand-made message follows the intro.
                queueBriefingClips([briefingSource()]);
            }
        } else if (!dossier.hasAudio) {
            briefing.removeAttribute('src');
            startMusic();
            return;
        }
        document.getElementById('replayButton').classList.remove('hidden');
        playAttempt.then(ok => {
            // Autoplay was blocked: the replay button becomes the way to hear Santa.
            if (!ok) {
                document.getElementById('replayButton').classList.add('attention');
                if (typeof trackEvent === 'function') trackEvent('autoplay_blocked');
            }
        });
    }).catch(() => {
        showBriefingError('Midagi läks valesti, proovi uuesti.');
        submit.disabled = false;
    });
}

function renderDossier(res) {
    const dossier = res.dossier || {};
    // "Jaan - koodnimi Oravake" for the player and their target: everyone has one codename, the name
    // the maze scoreboard shows ("Agent Oravake" there; the dossier already says "Agent").
    const shortCodename = name => (name || '').replace(/^Agent\s+/i, '');
    const ownCodename = shortCodename(res.agentName);
    document.getElementById('dossierAgent').textContent = res.name + (ownCodename ? ' - koodnimi ' + ownCodename : '');
    const target = document.getElementById('recipient');
    target.textContent = formatTargetName(res.giftingTo);
    const targetCodename = shortCodename(dossier.codename);
    if (targetCodename) {
        const codename = document.createElement('span');
        codename.className = 'target-codename';   // smaller than the name
        codename.textContent = '- koodnimi ' + targetCodename;
        target.appendChild(codename);
    }
    const code = (document.getElementById('userCode').value || '').trim();
    document.getElementById('dossierNumber').textContent = dossierNumber(res.giftingTo, code);

    if (dossier.hasPhoto) {
        const photo = document.getElementById('dossierPhoto');
        photo.src = '/dossier/photo';
        photo.alt = res.giftingTo;
        photo.classList.remove('hidden');
        document.getElementById('dossierPhotoPlaceholder').classList.add('hidden');
    }
    if (dossier.missionBrief) {
        document.getElementById('dossierBrief').textContent = dossier.missionBrief;
        document.getElementById('dossierBriefRow').classList.remove('hidden');
    }
    const stats = document.getElementById('dossierStats');
    stats.innerHTML = '';
    const agencyFacts = dossier.agencyFacts || [];
    document.getElementById('dossierStatsRow').classList.toggle('hidden', agencyFacts.length === 0);
    agencyFacts.forEach(fact => {
        const item = document.createElement('li');
        item.textContent = fact;
        stats.appendChild(item);
    });
    if (dossier.facts && dossier.facts.length > 0) {
        const list = document.getElementById('dossierFacts');
        list.innerHTML = '';
        dossier.facts.forEach(fact => {
            const item = document.createElement('li');
            item.textContent = fact;
            list.appendChild(item);
        });
        document.getElementById('dossierFactsRow').classList.remove('hidden');
    }
    document.getElementById('dossier').classList.remove('hidden');
}

/** Folds a string into a fixed number of digits, stable for the same input. */
function digitsOf(text, length) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (hash * 31 + text.charCodeAt(i) * (i + 1)) % Math.pow(10, length);
    }
    return String(hash).padStart(length, '0');
}

/**
 * A stable, official-looking file number: year, two groups from the recipient's
 * name, and a final group from the agent's identity code when one is known.
 */
function dossierNumber(name, code) {
    let number = new Date().getFullYear() + '-' + digitsOf(name, 5) + '-' + digitsOf(name.split('').reverse().join(''), 3);
    if (code) number += '-' + digitsOf(code, 4);
    return number;
}

/** "Mari Maasikas" becomes "Mari MAASIKAS", the way a case file lists a surname. */
function formatTargetName(name) {
    const parts = name.trim().split(/\s+/);
    parts[parts.length - 1] = parts[parts.length - 1].toUpperCase();
    return parts.join(' ');
}

function isInWebView() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const webViewIndicators = [
        'WebView',           // Generic Android WebView
        '(iPhone|iPod|iPad).+AppleWebKit(?!.*Safari)',  // iOS WebView
        'Android.*Version/\\d+\\.\\d+.*Chrome/',       // Android Chrome Custom Tab
        'FBAN', 'FBAV'      // Facebook App WebView
    ];

    const pattern = new RegExp(webViewIndicators.join('|'), 'i');
    return pattern.test(userAgent);
}

window.addEventListener("load", (event) => {
    const bind = (id, eventName, handler) => {
        const element = document.getElementById(id);
        if (element) element.addEventListener(eventName, handler);
    };
    bind('submit', 'click', acceptMission);
    bind('replayButton', 'click', () => playBriefing());
    bind('copyContainer', 'click', () => copyTextToClipboard(window.location.href));
    bind('googleAuthButton', 'click', () => { location.href = '/auth/google'; });

    const togglePassword = document.querySelector('#toggleUserCodeVisibility');
    if (togglePassword !== null) {
        togglePassword.addEventListener('click', function () {
            const password = document.querySelector('#userCode');

            const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
            password.setAttribute('type', type);

            this.querySelector('i').classList.toggle('bi-eye');
            this.querySelector('i').classList.toggle('bi-eye-slash');
        });
    }

    const pageUrl = document.getElementById('pageUrl');
    if (pageUrl) {
        pageUrl.textContent = window.location.href;
        if (isInWebView()) {
            document.getElementById('googleAuthButton').classList.add('hidden');
            document.getElementById('webViewWarning').classList.remove('hidden');
        }
    }

    // Let the first clip buffer while the user reads the sound notice.
    if (isLoggedIn) {
        const briefing = document.getElementById('briefingPlayer');
        if (briefing) briefing.src = hasClipLibrary() ? clipUrl('intro', clipRotation().intro) : briefingSource();
    }
});

// ---- The maze, shown in place of the dossier ---------------------------------------------------
// The maze is a hidden section of this page (views/partials/maze.hbs, run by maze.js), so opening it
// keeps the music playing and the page's other buttons where they are. Its "Tagasi toimiku juurde"
// links and the phone's back gesture bring back whatever was showing before, at the same scroll position.
const MAZE_HIDES = ['inputContainer', 'authContainer', 'webViewWarning', 'dossier'];
let mazeReturn = null;

function mazeOpen() {
    return !document.getElementById('mazeView').classList.contains('hidden');
}

function openMaze({ opener = null, fromUrl = false } = {}) {
    if (!window.MazeView || mazeOpen()) return;
    const shown = MAZE_HIDES.map(id => document.getElementById(id)).filter(el => el && !el.classList.contains('hidden'));
    mazeReturn = { shown, scrollY: window.scrollY, opener, pushed: !fromUrl };
    shown.forEach(el => el.classList.add('hidden'));
    document.getElementById('mazeView').classList.remove('hidden');
    window.scrollTo(0, 0);
    window.MazeView.show();
    // A history entry, so the phone's back gesture closes the maze instead of leaving the site.
    if (fromUrl) history.replaceState({ maze: true }, '', location.pathname + location.search + '#labyrint');
    else history.pushState({ maze: true }, '', location.pathname + location.search + '#labyrint');
}

function closeMaze({ fromHistory = false } = {}) {
    if (!mazeOpen()) return;
    window.MazeView.hide();
    document.getElementById('mazeView').classList.add('hidden');
    const back = mazeReturn || { shown: [], scrollY: 0, opener: null, pushed: false };
    mazeReturn = null;
    back.shown.forEach(el => el.classList.remove('hidden'));
    window.scrollTo(0, back.scrollY);
    if (back.opener) back.opener.focus({ preventScroll: true });
    if (fromHistory) return;
    // Opened by a click: step back over our history entry. Opened from a /labyrint link: just drop the hash.
    if (back.pushed && history.state && history.state.maze) history.back();
    else history.replaceState(null, '', location.pathname + location.search);
}

window.addEventListener('popstate', () => closeMaze({ fromHistory: true }));
document.addEventListener('click', event => {
    if (!event.target.closest) return;
    // The maze's back links, and the corner home icon while the maze is open (a reload would stop the music).
    const back = event.target.closest('#mazeView a.maze-back')
        || (mazeOpen() && event.target.closest('#navigationIconsContainer a[href="/"]'));
    if (back) {
        event.preventDefault();
        closeMaze();
        return;
    }
    const link = event.target.closest('a[href="/labyrint"]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openMaze({ opener: link });
});
// /labyrint redirects here with #labyrint (old links, bookmarks): open the maze for signed-in agents.
window.addEventListener('load', () => {
    if (location.hash === '#labyrint' && isLoggedIn) openMaze({ fromUrl: true });
});

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        var successful = document.execCommand('copy');
        var msg = successful ? 'successful' : 'unsuccessful';
        console.log('Fallback: Copying text command was ' + msg);
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
}
function copyTextToClipboard(text) {
    if (!navigator.clipboard) {
        fallbackCopyTextToClipboard(text);
        return;
    }
    navigator.clipboard.writeText(text).then(function () {
        console.log('Async: Copying to clipboard was successful!');
    }, function (err) {
        console.error('Async: Could not copy text: ', err);
    });

    Toastify({
        text: "Link kopeeritud",
        duration: 5000,
        newWindow: true,
        close: true,
        gravity: "top", // `top` or `bottom`
        position: "right", // `left`, `center` or `right`
        stopOnFocus: true, // Prevents dismissing of toast on hover
        style: {
            borderRadius: "10px",
        }
    }).showToast();
}
