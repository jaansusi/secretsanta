// Background music (plays quietly once the dossier is open) and Santa's briefing clip.
const MUSIC_VOLUME = 0.3;
const MUSIC_DUCKED_VOLUME = 0.05;
let audioPlaying = false;

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

/** Plays (or replays) Santa's briefing. Must be called from a user gesture on mobile browsers. */
function playBriefing() {
    const briefing = document.getElementById('briefingPlayer');
    if (!briefing) return Promise.resolve(false);
    if (!briefing.getAttribute('src')) {
        briefing.src = briefingSource();
    }
    briefing.currentTime = 0;
    return briefing.play().then(() => true).catch(() => false);
}

function briefingSource() {
    const codeInput = document.getElementById('userCode');
    const code = codeInput ? codeInput.value : '';
    return '/dossier/audio' + (code ? '?code=' + encodeURIComponent(code) : '');
}

window.addEventListener('load', () => {
    const briefing = document.getElementById('briefingPlayer');
    if (!briefing) return;
    const indicator = document.getElementById('speakingIndicator');
    const show = (visible) => indicator && indicator.classList.toggle('hidden', !visible);
    briefing.addEventListener('play', () => { show(true); duckMusic(true); });
    briefing.addEventListener('pause', () => { show(false); duckMusic(false); });
    briefing.addEventListener('ended', () => { show(false); duckMusic(false); startMusic(); });
    briefing.addEventListener('error', () => show(false));
});
