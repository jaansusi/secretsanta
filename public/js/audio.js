// Background music (plays quietly once the dossier is open) and Santa's briefing.
// The briefing is a sequence of clips (intro, name line, outro) played back to back on one <audio> element.
const MUSIC_VOLUME = 0.3;
const MUSIC_DUCKED_VOLUME = 0.05;
let audioPlaying = false;
let briefingQueue = [];
let lastBriefingSequence = [];
// Set once the server has told us which clips follow the intro, so "finished" means the whole briefing.
let briefingFinalized = false;
let briefingCompleteReported = false;

function startMusic() {
    const music = document.getElementById('player');
    if (!music || audioPlaying) return;
    music.volume = MUSIC_VOLUME;
    music.play().then(() => { audioPlaying = true; }).catch(() => { audioPlaying = false; });
}

function duckMusic(ducked) {
    const music = document.getElementById('player');
    if (!music) return;
    music.volume = ducked ? MUSIC_DUCKED_VOLUME : MUSIC_VOLUME;
}

/**
 * Starts a new briefing: the first clip plays now (call this from a user gesture, mobile browsers
 * block it otherwise) and the rest follow as each one ends. Resolves to false if playback was blocked.
 */
function startBriefing(clips) {
    const briefing = document.getElementById('briefingPlayer');
    if (!briefing || clips.length === 0) return Promise.resolve(false);
    lastBriefingSequence = clips.slice();
    briefingQueue = clips.slice(1);
    return playClip(briefing, clips[0]);
}

/** Appends clips to the running briefing, e.g. the name line and outro once the server has answered. */
function queueBriefingClips(clips) {
    const briefing = document.getElementById('briefingPlayer');
    lastBriefingSequence = lastBriefingSequence.concat(clips);
    briefingQueue = briefingQueue.concat(clips);
    // The intro may already have finished while we waited for the server.
    if (briefing && briefing.ended) playNextClip(briefing);
}

/** Replays the whole last briefing from the start (replay button). */
function playBriefing() {
    if (typeof trackEvent === 'function') trackEvent('briefing_replay');
    return startBriefing(lastBriefingSequence.length > 0 ? lastBriefingSequence : [briefingSource()]);
}

function playNextClip(briefing) {
    if (briefingQueue.length === 0) return false;
    playClip(briefing, briefingQueue.shift());
    return true;
}

function playClip(briefing, url) {
    if (briefing.getAttribute('src') !== url) {
        briefing.src = url;
    }
    briefing.currentTime = 0;
    return briefing.play().then(() => true).catch(() => false);
}

/** The hand-uploaded clip from the dossier table, for participants without generated name clips. */
function briefingSource() {
    const codeInput = document.getElementById('userCode');
    const code = codeInput ? codeInput.value : '';
    return '/dossier/audio' + (code ? '?code=' + encodeURIComponent(code) : '');
}

// ---- Sound switch (top-right corner) ----------------------------------------------------------
// One switch for everything that plays here (music and Santa's briefing). Shown once the dossier opens;
// the choice is remembered in this browser. Turning sound on also starts the music if it never got going
// (a phone can block it).
const SOUND_MUTED_KEY = 'santaSoundMuted';
let soundMuted = (() => { try { return localStorage.getItem(SOUND_MUTED_KEY) === '1'; } catch (e) { return false; } })();
let soundAvailable = false;

function audioElements() {
    return ['player', 'briefingPlayer'].map(id => document.getElementById(id)).filter(Boolean);
}

function soundAudible() {
    return !soundMuted && audioElements().some(audio => !audio.paused);
}

function renderSoundToggle() {
    const button = document.getElementById('soundToggle');
    if (!button) return;
    const on = soundAudible();
    button.querySelector('i').className = 'bi ' + (on ? 'bi-volume-up-fill' : 'bi-volume-mute-fill');
    button.setAttribute('aria-label', on ? 'Lülita heli välja' : 'Lülita heli sisse');
}

/** Called when the dossier opens (index.js): from then on there is something to switch. */
function showSoundToggle() {
    soundAvailable = true;
    const button = document.getElementById('soundToggle');
    if (button) button.classList.remove('hidden');
    renderSoundToggle();
}

function toggleSound() {
    if (soundAudible()) {
        soundMuted = true;
    } else {
        soundMuted = false;
        if (soundAvailable && audioElements().every(audio => audio.paused)) startMusic();
    }
    try { localStorage.setItem(SOUND_MUTED_KEY, soundMuted ? '1' : '0'); } catch (e) { /* not remembered */ }
    audioElements().forEach(audio => { audio.muted = soundMuted; });
    renderSoundToggle();
}

window.addEventListener('load', () => {
    audioElements().forEach(audio => {
        audio.muted = soundMuted;
        ['play', 'pause', 'ended', 'volumechange'].forEach(type => audio.addEventListener(type, renderSoundToggle));
    });
    const toggle = document.getElementById('soundToggle');
    if (toggle) toggle.addEventListener('click', toggleSound);
});

window.addEventListener('load', () => {
    const briefing = document.getElementById('briefingPlayer');
    if (!briefing) return;
    const indicator = document.getElementById('speakingIndicator');
    const show = (visible) => indicator && indicator.classList.toggle('hidden', !visible);
    briefing.addEventListener('play', () => { show(true); duckMusic(true); });
    briefing.addEventListener('pause', () => { show(false); duckMusic(false); });
    briefing.addEventListener('ended', () => {
        if (playNextClip(briefing)) return;
        show(false);
        duckMusic(false);
        startMusic();
        if (briefingFinalized && !briefingCompleteReported && typeof trackEvent === 'function') {
            briefingCompleteReported = true;
            trackEvent('briefing_complete');
        }
    });
    // A missing clip should not silence the rest of the briefing.
    briefing.addEventListener('error', () => {
        if (!playNextClip(briefing)) show(false);
    });
});
