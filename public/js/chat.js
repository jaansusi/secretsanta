var sessionId = '_' + Math.random().toString(36).substr(2, 9);

function displayMessage(msg, type) {
    var messageContainer = document.createElement('div');
    messageContainer.classList.add('message', type);

    var messageContent = document.createElement('div');
    messageContent.classList.add('messageContent');
    if (type === 'server')
        messageContent.innerHTML = msg.content;
    else
        messageContent.textContent = msg.content;

    messageContainer.appendChild(messageContent);

    var chatMessages = document.getElementById('chatMessages');
    chatMessages.appendChild(messageContainer);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.getElementById('sendButton').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    var input = document.getElementById('messageInput');
    var messageText = input.value.trim();
    if (messageText !== '') {
        var userMessage = {
            sessionId: sessionId,
            content: messageText
        };
        displayMessage(userMessage, 'user');

        input.value = '';
        input.focus();

        fetch('/messages/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userMessage)
        })
            .then(response => response.json())
            .then(data => {
                displayMessage(data, 'server');
                if (audioPlaying && data.content.includes('Panin muusika pausile!')) {
                    playPause();
                }
                if (!audioPlaying && data.content.includes('Panin muusika mängima!')) {
                    playPause();
                }
            });
    }
}

function initializeChat(response) {
    setTimeout(() => 
        displayMessage({content: `Tere, ${response.name}! Sina tõmbasid loosiga nime <b>${response.giftingTo}</b>. <br />Kirjuta mulle kui soovid muusikat kinni panna või kui sul on muid muresid või küsimusi!<br />Sinu jõuluvana`}, 'server'), 1000);
}
