// Sign-up page (/liitu/<code>): shows the "new family" name field only when "create a new family" is chosen.
(function () {
    const form = document.querySelector('.signup-form');
    if (!form) return;
    // Stop double submits on a slow connection (disabled after the submit has started, so the post still goes out).
    form.addEventListener('submit', () => {
        const button = form.querySelector('button[type=submit]');
        setTimeout(() => { button.disabled = true; }, 0);
    });
    const select = document.getElementById('signupFamily');
    const field = document.getElementById('newFamilyField');
    if (!select || !field) return;
    const input = document.getElementById('signupNewFamily');
    const sync = () => {
        const isNew = select.value === 'new';
        field.classList.toggle('hidden', !isNew);
        if (isNew && document.activeElement === select) input.focus();
    };
    select.addEventListener('change', sync);
    sync();
})();
