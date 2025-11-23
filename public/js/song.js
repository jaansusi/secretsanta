// Initialize Socket.IO connection
const socket = io();

let currentUserId = null;

// Get user ID from cookie
function getUserIdFromCookie() {
    const authCookie = getCookie('santa_auth');
    return authCookie ? parseInt(authCookie) : null;
}

// Request current song when connected
socket.on('connect', () => {
    console.log('Connected to WebSocket');
    socket.emit('getCurrentSong');
});

// Listen for current song response
socket.on('getCurrentSong', (data) => {
    if (data && data.songUrl) {
        playYouTubeSongShared(data.songUrl, data.updatedBy);
    }
});

// Listen for song updates from other users
socket.on('songUpdated', (data) => {
    console.log('Song updated by', data.updatedBy);
    playYouTubeSongShared(data.songUrl, data.updatedBy);
    
    // Show notification
    Toastify({
        text: `${data.updatedBy} muutis laulu!`,
        duration: 3000,
        gravity: "top",
        position: "right",
        style: {
            borderRadius: "10px",
            background: "linear-gradient(to right, #667eea, #764ba2)",
        }
    }).showToast();
});

// Extract YouTube video ID from various URL formats
function extractYouTubeId(url) {
    if (!url) return null;

    // Examples supported:
    // https://www.youtube.com/watch?v=VIDEO_ID
    // https://youtu.be/VIDEO_ID
    // https://www.youtube.com/embed/VIDEO_ID
    // https://www.youtube.com/watch?v=VIDEO_ID&ab_channel=...

    try {
        const parsed = new URL(url);

        // youtu.be/VIDEO_ID
        if (parsed.hostname === 'youtu.be') {
            return parsed.pathname.slice(1) || null;
        }

        // youtube.com/embed/VIDEO_ID
        if (parsed.pathname.startsWith('/embed/')) {
            return parsed.pathname.split('/embed/')[1].split('/')[0] || null;
        }

        // youtube.com/watch?v=VIDEO_ID
        if (parsed.searchParams.has('v')) {
            return parsed.searchParams.get('v');
        }
    } catch (e) {
        // Fallback for non-URL strings or malformed input
        // Try to grab the last part after '=' or '/'
        if (url.includes('v=')) {
            return url.split('v=')[1].split('&')[0];
        }
        if (url.includes('youtu.be/')) {
            return url.split('youtu.be/')[1].split(/[?&]/)[0];
        }
    }

    return null;
}

function playYouTubeSongShared(songUrl, updatedBy) {
    if (!songUrl) return;

    const videoId = extractYouTubeId(songUrl);

    if (videoId) {
        const audioContainer = document.getElementById('audioContainer');
        if (audioContainer) {
            const label = updatedBy ? `${updatedBy} valis` : 'Praegune laul';

            audioContainer.classList.remove('hidden');
            audioContainer.innerHTML = `
                <div style="margin-bottom: 10px; text-align: center; opacity: 0.9;">
                    <small>🎵 ${label}</small>
                </div>
                <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;">
                    <iframe 
                        src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0" 
                        style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        allowfullscreen>
                    </iframe>
                </div>
                <div style="margin-top: 8px; text-align: center; opacity: 0.9; font-size: 0.8rem;">
                    Kui video ei alga automaatselt, vajuta palun Play.
                </div>
            `;
        }
    }
}

function updateSharedSong(songUrl) {
    const userId = getUserIdFromCookie();
    if (!userId) {
        Toastify({
            text: "Palun logi sisse",
            duration: 3000,
            gravity: "top",
            position: "right",
            style: {
                borderRadius: "10px",
                background: "linear-gradient(to right, #ff5f6d, #ffc371)",
            }
        }).showToast();
        return;
    }
    
    socket.emit('updateSong', { songUrl, userId }, (response) => {
        if (response && response.success) {
            Toastify({
                text: "Laul uuendatud!",
                duration: 3000,
                gravity: "top",
                position: "right",
                style: {
                    borderRadius: "10px",
                    background: "linear-gradient(to right, #00b09b, #96c93d)",
                }
            }).showToast();
        } else {
            Toastify({
                text: "Viga laulu uuendamisel",
                duration: 3000,
                gravity: "top",
                position: "right",
                style: {
                    borderRadius: "10px",
                    background: "linear-gradient(to right, #ff5f6d, #ffc371)",
                }
            }).showToast();
        }
    });
}

function handleSaveSongShared() {
    const songUrl = document.getElementById('songUrlInput').value.trim();
    if (songUrl) {
        updateSharedSong(songUrl);
    } else {
        Toastify({
            text: "Palun sisesta YouTube video link",
            duration: 3000,
            gravity: "top",
            position: "right",
            style: {
                borderRadius: "10px",
                background: "linear-gradient(to right, #ff5f6d, #ffc371)",
            }
        }).showToast();
    }
}
