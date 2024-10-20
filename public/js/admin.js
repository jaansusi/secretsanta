function generateSantas() {
    let a = confirm("OLED KINDEL?");
    if (a)
        location.href = '/admin/generate';
}

function openUserEditModal(id, name, email, idCode, strategy, isUserAdmin, familyId) {
    document.getElementById('editUserId').value = id ? id : '';
    document.getElementById('editUserName').value = name ? name : '';
    document.getElementById('editUserEmail').value = email ? email : '';
    document.getElementById('editUserIdCode').value = idCode ? idCode : '';
    document.getElementById('editUserStrategy').value = strategy ? strategy : '';
    document.getElementById('editUserIsAdmin').checked = isUserAdmin ? true : false;
    document.getElementById('editUserFamily').value = familyId ? familyId : '';
    var editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
    editUserModal.show();
}

function saveUser() {
    const id = document.getElementById('editUserId').value;
    const name = document.getElementById('editUserName').value;
    const email = document.getElementById('editUserEmail').value;
    const idCode = document.getElementById('editUserIdCode').value;
    const isAdmin = document.getElementById('editUserIsAdmin').checked;
    const strategy = document.getElementById('editUserStrategy').value;
    const familyId = document.getElementById('editUserFamily').value;

    let user = {
        id: id ? parseInt(id) : null,
        name: name,
        email: email,
        idCode: idCode,
        encryptionStrategy: strategy,
        isAdmin: isAdmin,
        familyId: familyId ? parseInt(familyId) : null
    };
    // Make the request to the server
    fetch("/admin/user", {
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
        fetch("/admin/user/" + id, {
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

function openFamilyEditModal(id, name, email, strategy, isAdmin, familyId) {
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
    fetch("/admin/family", {
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
        fetch("/admin/family/" + id, {
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