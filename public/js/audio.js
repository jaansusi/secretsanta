// Background music (plays quietly once the dossier is open) and Santa's briefing.
// The briefing is a sequence of clips (intro, name line, outro) played back to back on one <audio> element.
const MUSIC_VOLUME = 0.3;
const MUSIC_DUCKED_VOLUME = 0.05;
let audioPlaying = false;
let briefingQueue = [];
let lastBriefingSequence = [];

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
    });
    // A missing clip should not silence the rest of the briefing.
    briefing.addEventListener('error', () => {
        if (!playNextClip(briefing)) show(false);
    });
});
