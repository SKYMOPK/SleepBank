(function (root) {
    'use strict';
    let active = null;
    function cleanup() {
        const run = active; active = null;
        if (!run) return;
        cancelAnimationFrame(run.frame); run.events.abort();
        run.scene?.dispose(); run.canvas?.remove();
    }
    async function mount(host) {
        if (active?.host === host) return;
        cleanup();
        if (!host) return;
        const run = { host, events: new AbortController(), frame: 0, elapsed: 0, previous: 0 };
        active = run;
        try {
            await root.HomecomingEffect.prepare();
            const image = new Image(); image.src = root.HomecomingTextures.wood;
            await image.decode();
            if (active !== run) return;
            const canvas = document.createElement('canvas'); run.canvas = canvas;
            canvas.setAttribute('aria-hidden', 'true'); host.append(canvas);
            run.scene = root.HomecomingScene.create(root.THREE, canvas, image);
            run.scene.renderer.shadowMap.autoUpdate = false;
            run.scene.renderer.shadowMap.needsUpdate = true;
            const reduced = matchMedia('(prefers-reduced-motion: reduce)');
            const signal = run.events.signal;
            function draw() { run.scene.renderBackground(run.elapsed / 1000); }
            function frame(now) {
                if (active !== run) return;
                run.frame = requestAnimationFrame(frame);
                if (document.hidden || root.HomecomingEffect.playing) { run.previous = now; return; }
                if (now - run.previous < 66) return;
                run.elapsed += Math.min(100, now - run.previous); run.previous = now; draw();
            }
            function resume() {
                cancelAnimationFrame(run.frame); run.previous = performance.now(); draw();
                if (!document.hidden && !reduced.matches) run.frame = requestAnimationFrame(frame);
            }
            root.addEventListener('resize', () => { run.scene.resize(); draw(); }, { signal });
            root.addEventListener('pagehide', cleanup, { signal });
            document.addEventListener('visibilitychange', resume, { signal });
            reduced.addEventListener('change', resume, { signal });
            canvas.addEventListener('webglcontextlost', cleanup, { signal });
            resume();
        } catch (error) {
            if (active === run) cleanup();
            console.warn('Dorm background unavailable; using still image', error);
        }
    }
    root.DormBackground = { mount, cleanup };
})(globalThis);
