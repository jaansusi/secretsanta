function getCookie(name) {
    var dc = document.cookie;
    var prefix = name + "=";
    var begin = dc.indexOf("; " + prefix);
    if (begin == -1) {
        begin = dc.indexOf(prefix);
        if (begin != 0) return null;
    }
    else {
        begin += 2;
        var end = document.cookie.indexOf(";", begin);
        if (end == -1) {
            end = dc.length;
        }
    }
    return decodeURI(dc.substring(begin + prefix.length, end));
}

if (getCookie('santa_auth') !== null) {
    document.getElementById('logoutContainer').classList.remove('hidden');
}

function showBriefingError(message) {
    const errorBox = document.getElementById('briefingError');
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
}

function toggleCodeInput(event) {
    event.preventDefault();
    const group = document.getElementById('codeInputGroup');
    const hidden = group.classList.toggle('hidden');
    document.getElementById('showCodeLink').textContent = hidden ? 'Näita koodi' : 'Peida kood';
}

/** Called from the "accept mission" button: starts Santa's clip and fetches the name. */
function acceptMission() {
    const submit = document.getElementById('submit');
    submit.disabled = true;
    document.getElementById('briefingError').classList.add('hidden');

    // Start the clip inside the click handler, otherwise mobile browsers block it.
    const briefing = document.getElementById('briefingPlayer');
    const source = briefingSource();
    if (briefing.getAttribute('src') !== source) {
        briefing.src = source;
    }
    const playAttempt = playBriefing();

    fetch("/result", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        redirect: "follow",
        body: JSON.stringify({
            code: document.getElementById('userCode').value
        }),
    }).then(res => res.json()).then(res => {
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

        if (!snowActive) {
            snowActive = true;
            createSnowFlakes();
        }
        const dossier = res.dossier || {};
        if (dossier.hasAudio) {
            document.getElementById('replayButton').classList.remove('hidden');
            playAttempt.then(ok => {
                // Autoplay was blocked: the replay button becomes the way to hear Santa.
                if (!ok) document.getElementById('replayButton').classList.add('attention');
            });
        } else {
            briefing.removeAttribute('src');
            startMusic();
        }
    }).catch(() => {
        showBriefingError('Midagi läks valesti, proovi uuesti.');
        submit.disabled = false;
    });
}

function renderDossier(res) {
    const dossier = res.dossier || {};
    document.getElementById('dossierAgent').textContent = res.name;
    document.getElementById('recipient').textContent = res.giftingTo;
    document.getElementById('dossierNumber').textContent = dossierNumber(res.giftingTo);
    document.getElementById('dossierCaption').textContent = res.giftingTo;

    if (dossier.hasPhoto) {
        const photo = document.getElementById('dossierPhoto');
        photo.src = '/dossier/photo';
        photo.alt = res.giftingTo;
        photo.classList.remove('hidden');
        document.getElementById('dossierPhotoPlaceholder').classList.add('hidden');
    }
    if (dossier.codename) {
        document.getElementById('dossierCodename').textContent = dossier.codename;
        document.getElementById('dossierCodenameRow').classList.remove('hidden');
    }
    if (dossier.missionBrief) {
        document.getElementById('dossierBrief').textContent = dossier.missionBrief;
        document.getElementById('dossierBriefRow').classList.remove('hidden');
    }
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

/** A stable, official-looking file number derived from the recipient's name. */
function dossierNumber(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) % 100000;
    }
    return new Date().getFullYear() + '-' + String(hash).padStart(5, '0');
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
        pageUrl.innerHTML = window.location.href;
        if (isInWebView()) {
            document.getElementById('googleAuthButton').classList.add('hidden');
            document.getElementById('webViewWarning').classList.remove('hidden');
        }
    }

    // Let the clip buffer while the user reads the sound notice.
    if (getCookie('santa_auth') !== null) {
        const briefing = document.getElementById('briefingPlayer');
        if (briefing) briefing.src = briefingSource();
    }
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
