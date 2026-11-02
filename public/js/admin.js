function generateSantas() {
    let a = confirm("OLED KINDEL?");
    if (a)
        location.href = '/admin/generate';
}

function openUserEditModal(id) {
    resetDossierFields();
    if (id === undefined) {
        document.getElementById('editUserId').value = '';
        document.getElementById('editUserName').value = '';
        document.getElementById('editUserEmail').value = '';
        document.getElementById('editUserStrategy').value = 'code';
        document.getElementById('editUserIsAdmin').checked = false;
        document.getElementById('editUserFamily').value = '';
        document.getElementById('editUserLastYearGiftingToId').value = '';
        document.getElementById('editUserInterestingFacts').value = '';
        setDossierEnabled(false);
        var editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
        editUserModal.show();
        return;
    }
    Promise.all([
        fetch("/user/" + id, { headers: { "Content-type": "application/json; charset=UTF-8" } }).then(r => r.json()),
        fetch("/dossier/admin/" + id).then(r => r.ok ? r.json() : null),
    ]).then(([data, dossier]) => {
        document.getElementById('editUserId').value = data.id;
        document.getElementById('editUserName').value = data.name;
        document.getElementById('editUserEmail').value = data.email;
        document.getElementById('editUserStrategy').value = data.encryptionStrategy;
        document.getElementById('editUserIsAdmin').checked = data.isAdmin;
        document.getElementById('editUserFamily').value = data.familyId ? data.familyId : '';
        document.getElementById('editUserLastYearGiftingToId').value = data.lastYearGiftingToId ? data.lastYearGiftingToId : '';
        document.getElementById('editUserInterestingFacts').value = data.interestingFacts || '';
        setDossierEnabled(true);
        renderDossierSummary(data.id, dossier);
        var editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
        editUserModal.show();
    });
}

function resetDossierFields() {
    document.getElementById('editDossierCodename').value = '';
    document.getElementById('editDossierBrief').value = '';
    document.getElementById('editDossierPhoto').value = '';
    document.getElementById('editDossierAudio').value = '';
    renderDossierSummary(null, null);
}

function setDossierEnabled(enabled) {
    document.getElementById('dossierFieldset').disabled = !enabled;
    document.getElementById('dossierNewUserNote').classList.toggle('hidden', enabled);
}

/** Shows the current dossier state (text + whether a photo/audio exists) in the modal. */
function renderDossierSummary(userId, dossier) {
    const summary = dossier || { codename: '', missionBrief: '', hasPhoto: false, hasAudio: false };
    document.getElementById('editDossierCodename').value = summary.codename || '';
    document.getElementById('editDossierBrief').value = summary.missionBrief || '';

    const cacheBuster = '?t=' + Date.now();
    const photo = document.getElementById('dossierPhotoPreviewImg');
    photo.classList.toggle('hidden', !summary.hasPhoto);
    photo.src = summary.hasPhoto ? '/dossier/admin/' + userId + '/photo' + cacheBuster : '';
    document.getElementById('dossierPhotoNone').classList.toggle('hidden', summary.hasPhoto);
    document.getElementById('dossierPhotoRemove').classList.toggle('hidden', !summary.hasPhoto);

    const audio = document.getElementById('dossierAudioPreviewPlayer');
    audio.classList.toggle('hidden', !summary.hasAudio);
    audio.src = summary.hasAudio ? '/dossier/admin/' + userId + '/audio' + cacheBuster : '';
    document.getElementById('dossierAudioNone').classList.toggle('hidden', summary.hasAudio);
    document.getElementById('dossierAudioRemove').classList.toggle('hidden', !summary.hasAudio);
}

async function saveDossier(userId) {
    const textResponse = await fetch("/dossier/admin/" + userId, {
        method: "POST",
        body: JSON.stringify({
            codename: document.getElementById('editDossierCodename').value,
            missionBrief: document.getElementById('editDossierBrief').value,
        }),
        headers: { "Content-type": "application/json; charset=UTF-8" }
    });
    if (!textResponse.ok) throw new Error('Saving dossier text failed');

    for (const kind of ['photo', 'audio']) {
        const input = document.getElementById(kind === 'photo' ? 'editDossierPhoto' : 'editDossierAudio');
        if (!input.files || input.files.length === 0) continue;
        const form = new FormData();
        form.append('file', input.files[0]);
        const response = await fetch("/dossier/admin/" + userId + "/" + kind, { method: "POST", body: form });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error('Uploading ' + kind + ' failed: ' + (body.message || response.status));
        }
    }
}

function removeDossierAsset(kind) {
    const userId = document.getElementById('editUserId').value;
    if (!userId || !confirm("Remove " + kind + "?")) return;
    fetch("/dossier/admin/" + userId + "/" + kind, { method: "DELETE" })
        .then(r => r.json())
        .then(summary => renderDossierSummary(parseInt(userId), summary))
        .catch(error => alert(error.message));
}

async function saveUser() {
    const id = document.getElementById('editUserId').value;
    const name = document.getElementById('editUserName').value;
    const email = document.getElementById('editUserEmail').value;
    const isAdmin = document.getElementById('editUserIsAdmin').checked;
    const strategy = document.getElementById('editUserStrategy').value;
    const familyId = document.getElementById('editUserFamily').value;
    const lastYearGiftingToId = document.getElementById('editUserLastYearGiftingToId').value;
    const interestingFacts = document.getElementById('editUserInterestingFacts').value;

    let user = {
        id: id ? parseInt(id) : null,
        name: name,
        email: email,
        encryptionStrategy: strategy,
        isAdmin: isAdmin,
        familyId: familyId ? parseInt(familyId) : null,
        lastYearGiftingToId: lastYearGiftingToId ? parseInt(lastYearGiftingToId) : null,
        interestingFacts: interestingFacts
    };
    try {
        const response = await fetch("/user", {
            method: "POST",
            body: JSON.stringify(user),
            headers: {
                "Content-type": "application/json; charset=UTF-8"
            }
        });
        if (!response.ok) throw new Error('Saving user failed: ' + response.status);
        if (id) {
            await saveDossier(parseInt(id));
        }
        location.reload();
    } catch (error) {
        console.error('Error:', error);
        alert(error.message);
    }
}

function deleteUser(id) {
    let a = confirm("OLED KINDEL?");
    if (a)
        fetch("/user/" + id, {
            method: "DELETE",
            headers: {
                "Content-type": "application/json; charset=UTF-8"
            }
        })
            .then(data => {
                console.log(data);
                location.reload();
            })
            .catch((error) => {
                console.error('Error:', error);
            });
}

function openFamilyEditModal(id, name) {
    document.getElementById('editFamilyId').value = id ? id : '';
    document.getElementById('editFamilyName').value = name ? name : '';
    var editUserModal = new bootstrap.Modal(document.getElementById('editFamilyModal'));
    editUserModal.show();
}

function saveFamily() {
    const id = document.getElementById('editFamilyId').value;
    const name = document.getElementById('editFamilyName').value;

    let family = {
        id: id ? parseInt(id) : null,
        name: name
    };
    // Make the request to the server
    fetch("/family", {
        method: "POST",
        body: JSON.stringify(family),
        headers: {
            "Content-type": "application/json; charset=UTF-8"
        }
    })
        .then(data => {
            console.log(data);
            location.reload();
        })
        .catch((error) => {
            console.error('Error:', error);
        });

    // Close the modal after saving
    var editUserModal = bootstrap.Modal.getInstance(document.getElementById('editFamilyModal'));
    editUserModal.hide();
}

function deleteFamily(id) {
    let a = confirm("OLED KINDEL?");
    if (a)
        fetch("/family/" + id, {
            method: "DELETE",
            headers: {
                "Content-type": "application/json; charset=UTF-8"
            }
        })
            .then(data => {
                console.log(data);
                location.reload();
            })
            .catch((error) => {
                console.error('Error:', error);
            });
}