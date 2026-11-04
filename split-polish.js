(() => {
    const amount = document.getElementById('balanceAmount');
    if (!amount || !window.MutationObserver) return;

    let previous = amount.textContent;
    let animation;
    const observer = new MutationObserver(() => {
        const current = amount.textContent;
        if (current === previous) return;
        previous = current;
        if (document.hidden || !amount.getClientRects().length || matchMedia('(prefers-reduced-motion: reduce)').matches || !amount.animate) return;
        if (animation) animation.cancel();
        animation = amount.animate([
            { opacity: .75, transform: 'translateY(3px)' },
            { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 240, easing: 'ease-out' });
    });
    observer.observe(amount, { childList: true, characterData: true, subtree: true });
    window.addEventListener('pagehide', event => {
        if (event.persisted) return;
        observer.disconnect();
        if (animation) animation.cancel();
    });
})();
