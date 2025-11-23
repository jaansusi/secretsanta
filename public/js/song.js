// Initialize Socket.IO connection (lazy initialization)
let socket = null;
let currentUserId = null;
let currentUserName = null;

// Initialize WebSocket connection
function initializeWebSocket() {
    if (socket) return; // Already initialized
    
    socket = io();

    // Request current song when connected
    socket.on('connect', () => {
        console.log('Connected to WebSocket');
        
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            socket.emit('getCurrentSong');
            
            // Register user as online
            currentUserId = getUserIdFromCookie();
            currentUserName = getUserName();
            if (currentUserId && currentUserName) {
                socket.emit('userConnected', { userId: currentUserId, userName: currentUserName });
            }
        }, 100);
    });

    // Listen for online users updates
    socket.on('onlineUsers', (users) => {
        console.log('Online users:', users);
        updateOnlineUsersList(users);
    });

    // Update the online users display
    function updateOnlineUsersList(users) {
        const container = document.getElementById('onlineUsersContainer');
        if (!container) return;
        
        if (users.length === 0) {
            container.classList.add('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        const usersList = document.getElementById('onlineUsersList');
        usersList.innerHTML = users.map(user => `
            <span class="online-user-badge">
                <i class="bi bi-person-fill"></i> ${user.userName}
            </span>
        `).join('');
    }

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
}

// Get user ID from cookie
function getUserIdFromCookie() {
    const authCookie = getCookie('santa_auth');
    return authCookie ? parseInt(authCookie) : null;
}

// Get user name from page
function getUserName() {
    const userNameElement = document.getElementById('userName');
    return userNameElement ? userNameElement.textContent : null;
}

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
    
    if (!socket) {
        Toastify({
            text: "Ühendus puudub",
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
