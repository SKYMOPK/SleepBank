(() => {
    'use strict';
    const amount = document.getElementById('balanceAmount');
    const preview = document.getElementById('previewText');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let previousBalance = null;
    let displayed = 0;
    let frame;
    let resultAnimation;
    let previousPreview = preview.textContent;

    function syncAmounts() {
        document.querySelectorAll('.amount-input').forEach(input => {
            input.style.setProperty('--digits', String(Math.max(1, input.value.length)));
        });
    }
    function formatAmount(value) {
        return '$' + String(Number(value.toFixed(2)));
    }
    function animateBalance(value) {
        const signed = Number(value) || 0;
        const target = Math.abs(signed);
        const animate = previousBalance !== null && Math.sign(previousBalance) === Math.sign(signed) && !reduced.matches && !document.hidden;
        if (previousBalance === signed) return;
        previousBalance = signed;
        cancelAnimationFrame(frame);
        if (!animate || Math.abs(displayed - target) < .001) {
            displayed = target;
            amount.textContent = formatAmount(target);
            return;
        }
        const start = displayed;
        const started = performance.now();
        const wholeAmounts = Number.isInteger(start) && Number.isInteger(target);
        const tick = now => {
            const progress = Math.min(1, (now - started) / 380);
            displayed = start + (target - start) * (1 - Math.pow(1 - progress, 3));
            amount.textContent = formatAmount(wholeAmounts ? Math.round(displayed) : displayed);
            if (progress < 1) frame = requestAnimationFrame(tick);
            else displayed = target;
        };
        frame = requestAnimationFrame(tick);
    }
    const observer = new MutationObserver(() => {
        const next = preview.textContent;
        if (next === previousPreview) return;
        previousPreview = next;
        if (!preview.classList.contains('has-value') || reduced.matches || !preview.animate) return;
        resultAnimation?.cancel();
        resultAnimation = preview.animate([{ opacity:.45, transform:'translateY(3px)' }, { opacity:1, transform:'translateY(0)' }], { duration:180, easing:'ease-out' });
    });
    observer.observe(preview, { childList:true, characterData:true, subtree:true });
    document.querySelectorAll('.amount-group').forEach(group => group.addEventListener('click', event => {
        if (!event.target.closest('input, label')) group.querySelector('input')?.focus();
    }));
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) return;
        cancelAnimationFrame(frame);
        displayed = Math.abs(previousBalance || 0);
        amount.textContent = formatAmount(displayed);
    });
    reduced.addEventListener?.('change', event => {
        if (!event.matches) return;
        cancelAnimationFrame(frame);
        displayed = Math.abs(previousBalance || 0);
        amount.textContent = formatAmount(displayed);
        resultAnimation?.cancel();
    });
    window.addEventListener('pagehide', event => {
        if (event.persisted) return;
        cancelAnimationFrame(frame);
        observer.disconnect();
        resultAnimation?.cancel();
    });
    window.LedgerExperience = { syncAmounts, animateBalance };
    syncAmounts();
    const initial = Number(amount.textContent.replace(/[^\d.-]/g, '')) || 0;
    displayed = initial;
    previousBalance = amount.classList.contains('owe') ? -initial : initial;
})();
