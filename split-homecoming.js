(function (root) {
    'use strict';
    const base = new URL('.', document.currentScript.src);
    let enabled = true, active = null, loading = null, image = null, afterglow = null, glowTimer = 0;
    const loaded = new Set();
    function script(path) {
        if (loaded.has(path)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const node = document.createElement('script'); node.src = new URL(path, base).href;
            const timer = setTimeout(() => done(new Error('Effect asset timed out')), 7000);
            function done(error) {
                clearTimeout(timer); node.onload = node.onerror = null; node.remove();
                if (error) reject(error); else { loaded.add(path); resolve(); }
            }
            node.onload = () => done(); node.onerror = () => done(new Error('Effect asset unavailable'));
            document.head.append(node);
        });
    }
    function prepare() {
        if (!loading) loading = Promise.all([
            root.THREE ? Promise.resolve() : script('assets/vendor/three-0.160.1.min.js'),
            script('assets/homecoming/textures.js'), script('split-homecoming-scene.js'),
        ]).then(() => new Promise((resolve, reject) => {
            image = new Image(); image.onload = resolve; image.onerror = () => reject(new Error('Wood texture unavailable'));
            image.src = root.HomecomingTextures.wood;
        })).catch(error => { loading = null; throw error; });
        return loading;
    }
    function clearGlow() { clearTimeout(glowTimer); afterglow?.remove(); afterglow = null; }
    function finish(run, reason, glow = false) {
        if (active !== run) return;
        active = null; cancelAnimationFrame(run.frame); clearTimeout(run.watchdog);
        const restoreFocus = run.overlay?.contains(document.activeElement);
        run.events.abort(); run.audio?.stop(); run.scene?.dispose(); run.overlay?.remove();
        document.body.classList.remove('homecoming-playing', 'homecoming-returning');
        if (restoreFocus && run.focus?.isConnected) run.focus.focus({ preventScroll: true });
        if (glow) {
            clearGlow(); afterglow = document.createElement('div'); afterglow.className = 'homecoming-afterglow';
            afterglow.setAttribute('aria-hidden', 'true'); document.body.append(afterglow);
            glowTimer = setTimeout(clearGlow, 450);
        }
        run.resolve({ reason });
    }
    function skip() { if (active) finish(active, 'skipped', true); }
    function cleanup() { if (active) finish(active, 'cleanup'); clearGlow(); }
    function play(options = {}) {
        if (!enabled) return Promise.resolve({ reason: 'disabled' });
        cleanup();
        return new Promise(resolve => {
            const run = { resolve, events: new AbortController(), focus: document.activeElement, frame: 0, scene: null };
            active = run;
            const reducedMotion = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
            run.audio = root.HomecomingAudio?.create(options.muted !== false || reducedMotion);
            const signal = run.events.signal;
            run.watchdog = setTimeout(() => finish(run, 'timeout'), 11000);
            document.addEventListener('visibilitychange', () => { if (document.hidden) finish(run, 'hidden'); }, { signal });
            root.addEventListener('pagehide', () => finish(run, 'hidden'), { signal });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); skip(); }
            }, { signal, capture: true });
            document.addEventListener('click', e => { if (e.target.closest('.undo-toast')) skip(); }, { signal, capture: true });
            prepare().then(() => {
                if (active !== run) return;
                const reduced = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
                const overlay = document.createElement('div'); overlay.className = 'homecoming-overlay';
                overlay.setAttribute('role', 'region'); overlay.setAttribute('aria-label', '回到宿舍');
                const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
                const button = document.createElement('button'); button.className = 'homecoming-skip';
                button.type = 'button'; button.textContent = '略過'; button.setAttribute('aria-label', '略過回到宿舍特效');
                overlay.append(canvas, button); run.overlay = overlay; document.body.append(overlay);
                overlay.addEventListener('click', skip, { signal });
                canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); finish(run, 'context-lost'); }, { signal });
                run.scene = root.HomecomingScene.create(root.THREE, canvas, image);
                root.addEventListener('resize', () => { try { run.scene.resize(); } catch { finish(run, 'resize-error'); } }, { signal });
                document.body.classList.add('homecoming-playing'); button.focus({ preventScroll: true });
                run.scene.update(0, reduced);
                const start = performance.now(), duration = reduced ? 1100 : 3800;
                run.audio?.start();
                let lastFrame = -Infinity;
                const interval = innerWidth < 600 ? 1000 / 30 : 1000 / 45;
                const tick = now => {
                    if (active !== run) return;
                    const elapsed = now - start;
                    if (elapsed >= duration) { finish(run, 'complete', true); return; }
                    try {
                        if (now - lastFrame >= interval) {
                            lastFrame = now;
                            const fadeIn = Math.min(1, elapsed / (reduced ? 220 : 400));
                            const fadeOut = Math.min(1, (duration - elapsed) / (reduced ? 280 : 600));
                            overlay.style.opacity = Math.min(fadeIn, fadeOut);
                            document.body.classList.toggle('homecoming-returning', elapsed >= duration - (reduced ? 280 : 600));
                            overlay.dataset.stage = reduced ? 'still' : elapsed < 1200 ? 'approach' : elapsed < 1600 ? 'ajar' : elapsed < 2500 ? 'enter' : elapsed < 3200 ? 'light' : 'return';
                            run.scene.update(elapsed / 1000, reduced);
                        }
                        run.frame = requestAnimationFrame(tick);
                    } catch { finish(run, 'render-error'); }
                };
                run.frame = requestAnimationFrame(tick);
            }).catch(() => finish(run, 'unavailable'));
        });
    }
    root.HomecomingEffect = {
        play, skip, cleanup, prepare,
        enable() { enabled = true; }, disable() { enabled = false; cleanup(); },
        get enabled() { return enabled; }, get playing() { return !!active; },
    };
})(globalThis);
