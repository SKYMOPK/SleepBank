(function (root) {
    'use strict';
    const base = new URL('.', document.currentScript.src);
    const duration = 3300;
    let assets = null, woodImage = null, ambient = null, effect = null;
    function script(path) {
        return new Promise((resolve, reject) => {
            const node = document.createElement('script'); node.src = new URL(path, base).href;
            const timeout = setTimeout(() => done(new Error('Chess asset timed out')), 9000);
            function done(error) {
                clearTimeout(timeout); node.onload = node.onerror = null; node.remove();
                error ? reject(error) : resolve();
            }
            node.onload = () => done(); node.onerror = () => done(new Error('Chess asset unavailable'));
            document.head.append(node);
        });
    }
    function prepare() {
        if (!assets) assets = Promise.all([
            root.THREE ? Promise.resolve() : script('assets/vendor/three-0.160.1.min.js'),
            root.ChessScene ? Promise.resolve() : script('split-chess-scene.js?v=chess-1'),
            root.HomecomingTextures ? Promise.resolve() : script('assets/homecoming/textures.js'),
        ]).then(async () => {
            woodImage = new Image(); woodImage.src = root.HomecomingTextures.wood;
            await woodImage.decode();
        }).catch(error => { assets = null; woodImage = null; throw error; });
        return assets;
    }
    function reflect(strength) {
        const value = Math.max(0, Math.min(.065, strength)).toFixed(4);
        if (document.body.style.getPropertyValue('--chess-impact') !== value) document.body.style.setProperty('--chess-impact', value);
        document.body.classList.toggle('chess-lit', Number(value) > .001);
    }
    function cleanupAmbient() {
        const run = ambient; ambient = null;
        if (!run) return;
        cancelAnimationFrame(run.frame); clearTimeout(run.timer);
        run.events.abort(); run.scene?.dispose(); run.canvas?.remove();
    }
    async function mount(host) {
        if (ambient?.host === host) return;
        cleanupAmbient(); if (!host) return;
        const run = { host, frame: 0, timer: 0, events: new AbortController(), previous: 0, elapsed: 0 };
        ambient = run;
        try {
            await prepare(); if (ambient !== run) return;
            const canvas = document.createElement('canvas'); canvas.className = 'chess-ambient';
            canvas.setAttribute('aria-hidden', 'true'); host.append(canvas); run.canvas = canvas;
            run.scene = root.ChessScene.create(root.THREE, canvas, woodImage);
            const reduced = matchMedia('(prefers-reduced-motion: reduce)'), signal = run.events.signal;
            function draw() { run.scene.render(run.elapsed / 1000, { reduced: reduced.matches }); }
            function schedule() { run.timer = setTimeout(() => { run.frame = requestAnimationFrame(frame); }, 125); }
            function frame(now) {
                if (ambient !== run) return;
                if (effect || root.HomecomingEffect?.playing) { run.previous = now; schedule(); return; }
                run.elapsed += Math.min(160, now - run.previous); run.previous = now; draw();
                schedule();
            }
            function resume() {
                cancelAnimationFrame(run.frame); clearTimeout(run.timer);
                run.previous = performance.now(); draw();
                if (!document.hidden && !reduced.matches) schedule();
            }
            root.addEventListener('resize', () => { run.scene.resize(); draw(); }, { signal });
            document.addEventListener('visibilitychange', resume, { signal });
            root.addEventListener('pagehide', cleanupAmbient, { signal });
            reduced.addEventListener('change', resume, { signal });
            canvas.addEventListener('webglcontextlost', cleanupAmbient, { signal });
            resume();
        } catch (error) { if (ambient === run) cleanupAmbient(); console.warn('Chess background unavailable', error); }
    }
    function stop(reason = 'cleanup') {
        const run = effect; effect = null;
        if (!run) return;
        cancelAnimationFrame(run.frame); clearTimeout(run.watchdog); run.events.abort();
        run.audio?.stop(); run.scene?.dispose(); run.overlay?.remove();
        document.body.classList.remove('chess-playing'); reflect(0);
        run.resolve({ reason });
    }
    function play(options = {}) {
        stop();
        return new Promise(resolve => {
            const run = { resolve, events: new AbortController(), frame: 0 };
            effect = run;
            const overlay = document.createElement('div'); overlay.className = 'chess-effect'; run.overlay = overlay;
            const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
            const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'chess-skip';
            skip.textContent = '略過'; skip.setAttribute('aria-label', '略過關鍵落子特效');
            overlay.append(canvas, skip); document.body.append(overlay);
            document.body.classList.add('chess-playing');
            const signal = run.events.signal;
            skip.addEventListener('click', () => stop('skipped'), { signal });
            root.addEventListener('pagehide', () => stop('hidden'), { signal });
            document.addEventListener('visibilitychange', () => { if (document.hidden) stop('hidden'); }, { signal });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); stop('skipped'); }
            }, { signal, capture: true });
            document.addEventListener('click', event => { if (event.target.closest('.undo-toast')) stop('undo'); }, { signal, capture: true });
            run.watchdog = setTimeout(() => stop('timeout'), 12000);
            prepare().then(() => {
                if (effect !== run) return;
                const reduced = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
                run.scene = root.ChessScene.create(root.THREE, canvas, woodImage);
                run.audio = root.ChessAudio?.create(options.muted !== false || reduced);
                run.audio?.start();
                const started = performance.now(), length = reduced ? 700 : duration;
                let previous = -Infinity;
                function frame(now) {
                    if (effect !== run) return;
                    const elapsed = now - started;
                    if (elapsed >= length) { stop('complete'); return; }
                    if (now - previous >= (innerWidth < 600 ? 1000 / 30 : 1000 / 40)) {
                        previous = now;
                        const seconds = reduced ? 2.5 : elapsed / 1000;
                        const state = run.scene.render(seconds, { motion: !reduced, reduced });
                        reflect(state.impact * .052);
                        overlay.style.opacity = reduced ? String(Math.min(1, elapsed / 140, (length - elapsed) / 180)) :
                            String(Math.min(.94, .72 + elapsed / 1800, (length - elapsed) / 450));
                        overlay.dataset.stage = reduced ? 'still' : seconds < .6 ? 'focus' : seconds < 1.3 ? 'lift' : seconds < 1.8 ? 'hold' : seconds < 2.2 ? 'land' : 'settle';
                    }
                    run.frame = requestAnimationFrame(frame);
                }
                root.addEventListener('resize', () => run.scene.resize(), { signal });
                canvas.addEventListener('webglcontextlost', () => stop('unavailable'), { signal });
                run.frame = requestAnimationFrame(frame);
            }).catch(error => {
                console.warn('Chess effect unavailable', error);
                if (effect !== run) return;
                overlay.dataset.stage = 'fallback'; overlay.style.opacity = '.72';
                clearTimeout(run.watchdog);
                run.watchdog = setTimeout(() => stop('unavailable'), 900);
            });
        });
    }
    root.SpecialThemes = {
        ...root.SpecialThemes,
        chess: { ambient: { mount, cleanup: cleanupAmbient }, onAdd: play, stop, prepare },
    };
    root.ChessVisuals = { duration, prepare };
})(globalThis);
