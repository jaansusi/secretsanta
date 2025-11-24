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

// Mass Edit Functions
let massEditMode = false;
let originalTableData = {};

function toggleMassEdit() {
    massEditMode = !massEditMode;
    const btn = document.getElementById('massEditBtn');
    const actionsDiv = document.getElementById('massEditActions');
    const table = document.getElementById('usersTable');
    const actionsColumns = document.querySelectorAll('.actions-column');
    
    if (massEditMode) {
        btn.textContent = 'View Mode';
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-secondary');
        actionsDiv.style.display = 'block';
        
        // Hide action buttons
        actionsColumns.forEach(col => col.style.display = 'none');
        
        // Convert cells to inputs
        convertCellsToInputs();
    } else {
        cancelMassEdit();
    }
}

function cancelMassEdit() {
    massEditMode = false;
    const btn = document.getElementById('massEditBtn');
    const actionsDiv = document.getElementById('massEditActions');
    const actionsColumns = document.querySelectorAll('.actions-column');
    
    btn.textContent = 'Mass Edit';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-warning');
    actionsDiv.style.display = 'none';
    
    // Show action buttons
    actionsColumns.forEach(col => col.style.display = '');
    
    // Restore original values
    location.reload();
}

function convertCellsToInputs() {
    const editableCells = document.querySelectorAll('.editable-cell');
    
    editableCells.forEach(cell => {
        const field = cell.dataset.field;
        const value = cell.dataset.value;
        const currentText = cell.textContent.trim();
        
        let input;
        
        switch(field) {
            case 'name':
            case 'email':
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-control form-control-sm';
                input.value = value || '';
                break;
                
            case 'encryptionStrategy':
                input = document.createElement('select');
                input.className = 'form-select form-select-sm';
                window.massEditData.strategies.forEach(strategy => {
                    const option = document.createElement('option');
                    option.value = strategy;
                    option.textContent = strategy;
                    if (strategy === value) option.selected = true;
                    input.appendChild(option);
                });
                break;
                
            case 'familyId':
                input = document.createElement('select');
                input.className = 'form-select form-select-sm';
                
                const noneOption = document.createElement('option');
                noneOption.value = '';
                noneOption.textContent = 'None';
                input.appendChild(noneOption);
                
                window.massEditData.families.forEach(family => {
                    const option = document.createElement('option');
                    option.value = family.id;
                    option.textContent = family.name;
                    if (family.id == value) option.selected = true;
                    input.appendChild(option);
                });
                break;
                
            case 'isAdmin':
                input = document.createElement('select');
                input.className = 'form-select form-select-sm';
                
                const yesOption = document.createElement('option');
                yesOption.value = 'true';
                yesOption.textContent = 'Yes';
                
                const noOption = document.createElement('option');
                noOption.value = 'false';
                noOption.textContent = 'No';
                
                input.appendChild(yesOption);
                input.appendChild(noOption);
                
                input.value = value === 'true' || value === true ? 'true' : 'false';
                break;
                
            case 'lastYearGiftingToId':
                input = document.createElement('select');
                input.className = 'form-select form-select-sm';
                
                const noneOptionLastYear = document.createElement('option');
                noneOptionLastYear.value = '';
                noneOptionLastYear.textContent = 'None';
                input.appendChild(noneOptionLastYear);
                
                window.massEditData.users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = user.name;
                    if (user.id == value) option.selected = true;
                    input.appendChild(option);
                });
                break;
        }
        
        if (input) {
            cell.innerHTML = '';
            cell.appendChild(input);
        }
    });
}

function saveMassEdit() {
    const rows = document.querySelectorAll('#usersTable tbody tr');
    const updates = [];
    
    rows.forEach(row => {
        const userId = parseInt(row.dataset.userId);
        const cells = row.querySelectorAll('.editable-cell');
        
        const userData = {
            id: userId
        };
        
        cells.forEach(cell => {
            const field = cell.dataset.field;
            const input = cell.querySelector('input, select');
            
            if (input) {
                let value = input.value;
                
                // Convert values to appropriate types
                if (field === 'familyId' || field === 'lastYearGiftingToId') {
                    userData[field] = value ? parseInt(value) : null;
                } else if (field === 'isAdmin') {
                    userData[field] = value === 'true';
                } else {
                    userData[field] = value;
                }
            }
        });
        
        updates.push(userData);
    });
    
    // Send batch update to server
    fetch("/user/batch", {
        method: "POST",
        body: JSON.stringify({ users: updates }),
        headers: {
            "Content-type": "application/json; charset=UTF-8"
        }
    })
    .then(response => response.json())
    .then(data => {
        console.log(data);
        location.reload();
    })
    .catch((error) => {
        console.error('Error:', error);
        alert('Failed to save changes. Please try again.');
    });
}
