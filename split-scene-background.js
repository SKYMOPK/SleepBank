/* Shared lifecycle for ambient WebGL scenes, including browser back/forward cache. */
(function (root) {
    'use strict';
    function create(options) {
        let active = null;
        const retryDelays = [500, 1500, 4000];
        const current = run => active === run && run.host.isConnected;
        const visible = run => current(run) && !run.suspended && !document.hidden;
        function pause(run) {
            root.cancelAnimationFrame(run.frame); root.clearTimeout(run.timer);
            run.frame = run.timer = 0;
        }
        function cancelRetry(run) { root.clearTimeout(run.retry); run.retry = 0; }
        function release(run) {
            pause(run); run.generation++; run.loading = false;
            run.canvasEvents?.abort(); run.canvasEvents = null;
            try { run.scene?.dispose(); } catch (error) { console.warn('Background cleanup failed', error); }
            run.scene = null; run.canvas?.remove(); run.canvas = null;
        }
        function cleanup() {
            const run = active; active = null;
            if (!run) return;
            run.events.abort(); cancelRetry(run); release(run);
            delete run.host.dataset.sceneState;
        }
        function retry(run) {
            if (!visible(run) || run.retry || run.attempts >= retryDelays.length) return;
            const delay = retryDelays[run.attempts++];
            run.retry = root.setTimeout(() => { run.retry = 0; start(run); }, delay);
        }
        function unavailable(run, error) {
            if (!current(run)) return;
            release(run); run.host.dataset.sceneState = 'fallback';
            if (error) console.warn(options.errorMessage, error);
            retry(run);
        }
        function schedule(run) {
            if (!visible(run) || run.reduced.matches || !run.scene) return;
            run.timer = root.setTimeout(() => {
                run.timer = 0;
                run.frame = root.requestAnimationFrame(now => {
                    run.frame = 0;
                    if (!visible(run) || !run.scene) return;
                    const delta = Math.min(160, now - run.previous); run.previous = now;
                    if (!options.paused?.()) {
                        run.elapsed += delta;
                        if (!draw(run)) return;
                    }
                    schedule(run);
                });
            }, options.interval);
        }
        function draw(run) {
            try {
                if (run.scene.renderer.getContext().isContextLost()) throw new Error('WebGL context lost');
                options.draw(run.scene, run.reduced.matches ? 0 : run.elapsed / 1000, run.reduced.matches);
                return true;
            } catch (error) { unavailable(run, error); return false; }
        }
        function resume(run) {
            pause(run);
            if (!visible(run)) return;
            if (!run.scene) { if (!run.retry) start(run); return; }
            try { run.scene.resize(); } catch (error) { unavailable(run, error); return; }
            run.previous = performance.now();
            if (draw(run)) schedule(run);
        }
        async function start(run) {
            if (!visible(run) || run.loading) return;
            if (run.scene) { resume(run); return; }
            cancelRetry(run); run.loading = true;
            const generation = run.generation;
            run.host.dataset.sceneState = 'loading';
            try {
                const assets = await options.prepare();
                if (!current(run) || generation !== run.generation) return;
                if (!visible(run)) { run.loading = false; return; }
                const canvas = document.createElement('canvas');
                run.canvas = canvas; canvas.className = options.canvasClass;
                canvas.setAttribute('aria-hidden', 'true'); canvas.style.visibility = 'hidden';
                run.canvasEvents = new AbortController();
                canvas.addEventListener('webglcontextlost', event => {
                    event.preventDefault(); unavailable(run);
                }, { signal: run.canvasEvents.signal });
                run.host.append(canvas);
                run.scene = options.create(canvas, assets);
                run.loading = false;
                if (!draw(run)) return;
                canvas.style.visibility = '';
                run.host.dataset.sceneState = 'ready';
                run.previous = performance.now(); schedule(run);
            } catch (error) {
                if (current(run) && generation === run.generation) unavailable(run, error);
            }
        }
        async function mount(host) {
            if (active?.host === host) {
                if (!active.scene && !active.loading && visible(active)) { active.attempts = 0; await start(active); }
                return;
            }
            cleanup(); if (!host) return;
            const run = { host, events: new AbortController(), reduced: root.matchMedia('(prefers-reduced-motion: reduce)'), frame: 0, timer: 0, retry: 0, attempts: 0, generation: 0, loading: false, suspended: false, elapsed: 0, previous: 0, scene: null, canvas: null };
            active = run;
            const signal = run.events.signal;
            const recover = () => {
                if (!visible(run)) return;
                run.attempts = 0; cancelRetry(run); resume(run);
            };
            root.addEventListener('pagehide', () => {
                run.suspended = true; cancelRetry(run); release(run);
                run.host.dataset.sceneState = 'suspended';
            }, { signal });
            root.addEventListener('pageshow', () => { run.suspended = false; recover(); }, { signal });
            document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(run); cancelRetry(run); } else recover(); }, { signal });
            root.addEventListener('online', recover, { signal });
            root.addEventListener('resize', () => { if (visible(run)) resume(run); }, { signal });
            run.reduced.addEventListener('change', () => resume(run), { signal });
            await start(run);
        }
        return { mount, cleanup };
    }
    root.SceneBackground = { create };
})(globalThis);
