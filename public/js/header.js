// The top icons are fixed over the page: once it scrolls, <html class="scrolled"> gives them a dark
// backdrop (main.css) so content passing underneath does not clash with the white icons.
(function () {
    const root = document.documentElement;
    let pending = false;
    const update = () => {
        pending = false;
        root.classList.toggle('scrolled', window.scrollY > 4);
    };
    window.addEventListener('scroll', () => {
        if (!pending) {
            pending = true;
            requestAnimationFrame(update);
        }
    }, { passive: true });
    update();
})();
