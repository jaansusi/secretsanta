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

function submitCode() {
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
        document.getElementById('responseContainer').classList.remove('hidden');
        let authContainer = document.getElementById('authContainer');
        if (authContainer !== undefined && authContainer !== null && res.error === undefined)
            authContainer.classList.add('hidden');
        if (res.error) {
            document.getElementById('recipient').innerHTML = res.error;
            document.getElementById('preRecipientText').classList.add('hidden');
        } else {
            document.getElementById('preRecipientText').classList.remove('hidden');
            document.getElementById('inputContainer').classList.add('hidden');
            document.getElementById('logoutContainer').classList.add('hidden');
            document.getElementById('welcome').innerHTML = 'Tere, ' + res.name + '!';
            document.getElementById('recipient').innerHTML = res.giftingTo;
            if (!snowActive) {
                snowActive = true;
                createSnowFlakes();
            }
            if (!audioPlaying)
                playPause();
        }
    });
}

window.addEventListener("load", (event) => {
    const togglePassword = document.querySelector('#toggleUserCodeVisibility');
    if (togglePassword === null) return;
    togglePassword.addEventListener('click', function () {
        const password = document.querySelector('#userCode');

        const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
        password.setAttribute('type', type);

        this.querySelector('i').classList.toggle('bi-eye');
        this.querySelector('i').classList.toggle('bi-eye-slash');
    });
});