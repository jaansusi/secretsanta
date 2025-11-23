function generateSantas() {
    let a = confirm("OLED KINDEL?");
    if (a)
        location.href = '/admin/generate';
}

function openUserEditModal(id) {
    if (id === undefined) {
        document.getElementById('editUserId').value = '';
        document.getElementById('editUserName').value = '';
        document.getElementById('editUserEmail').value = '';
        document.getElementById('editUserIdCode').value = '';
        document.getElementById('editUserStrategy').value = 'code';
        document.getElementById('editUserIsAdmin').checked = false;
        document.getElementById('editUserFamily').value = '';
        document.getElementById('editUserLastYearGiftingToId').value = '';
        document.getElementById('editUserInterestingFacts').value = '';
        var editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
        editUserModal.show();
        return;
    }
    fetch("/user/" + id, {
        method: "GET",
        headers: {
            "Content-type": "application/json; charset=UTF-8"
        }
    })
        .then(response => response.json())
        .then(data => {
            document.getElementById('editUserId').value = data.id;
            document.getElementById('editUserName').value = data.name;
            document.getElementById('editUserEmail').value = data.email;
            document.getElementById('editUserIdCode').value = data.idCode;
            document.getElementById('editUserStrategy').value = data.encryptionStrategy;
            document.getElementById('editUserIsAdmin').checked = data.isAdmin;
            document.getElementById('editUserFamily').value = data.familyId ? data.familyId : '';
            document.getElementById('editUserLastYearGiftingToId').value = data.lastYearGiftingToId ? data.lastYearGiftingToId : '';
            document.getElementById('editUserInterestingFacts').value = data.interestingFacts;
            var editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
            editUserModal.show();
        });
}

function saveUser() {
    const id = document.getElementById('editUserId').value;
    const name = document.getElementById('editUserName').value;
    const email = document.getElementById('editUserEmail').value;
    const idCode = document.getElementById('editUserIdCode').value;
    const isAdmin = document.getElementById('editUserIsAdmin').checked;
    const strategy = document.getElementById('editUserStrategy').value;
    const familyId = document.getElementById('editUserFamily').value;
    const lastYearGiftingToId = document.getElementById('editUserLastYearGiftingToId').value;
    const interestingFacts = document.getElementById('editUserInterestingFacts').value;

    let user = {
        id: id ? parseInt(id) : null,
        name: name,
        email: email,
        idCode: idCode,
        encryptionStrategy: strategy,
        isAdmin: isAdmin,
        familyId: familyId ? parseInt(familyId) : null,
        lastYearGiftingToId: lastYearGiftingToId ? parseInt(lastYearGiftingToId) : null,
        interestingFacts: interestingFacts
    };
    // Make the request to the server
    fetch("/user", {
        method: "POST",
        body: JSON.stringify(user),
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
    var editUserModal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
    editUserModal.hide();
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