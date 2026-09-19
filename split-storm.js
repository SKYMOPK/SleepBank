(function (root) {
    'use strict';
    const duration = 4200;
    const strikes = [1.70, 2.22, 2.76];
    const smooth = (a, b, v) => { const x = Math.max(0, Math.min(1, (v - a) / (b - a))); return x * x * (3 - 2 * x); };
    const pulse = (t, at, strength = 1) => strength * Math.exp(-Math.pow((t - at) / .075, 2));
    let textures, photo = null, photoReady, effect = null, ambient = null;
    function ready() {
        prepare();
        if (!photoReady) photoReady = new Promise(resolve => {
            if (!root.StormCloudPhoto) { resolve(); return; }
            const image = new Image(); image.src = root.StormCloudPhoto;
            image.decode().then(() => {
                photo = document.createElement('canvas'); photo.width = image.width; photo.height = image.height;
                const ctx = photo.getContext('2d'); ctx.drawImage(image, 0, 0);
                const mask = ctx.createLinearGradient(0, 0, 0, photo.height);
                mask.addColorStop(0, '#fff'); mask.addColorStop(.67, '#fff'); mask.addColorStop(1, '#fff0');
                ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = mask; ctx.fillRect(0, 0, photo.width, photo.height);
                resolve();
            }).catch(() => resolve());
        });
        return photoReady;
    }
    function noise(x, y, seed) {
        const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        const hash = (a, b) => {
            let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed;
            n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295;
        };
        const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
        return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
    }
    function field(x, y, seed) {
        // Domain distortion and multiple scales produce irregular folded cloud masses.
        const warp = noise(x * .62, y * .62, seed + 91) * 1.8;
        let sum = 0, weight = .55;
        for (let octave = 0; octave < 5; octave++) {
            sum += weight * noise(x + warp, y + warp * .45, seed + octave * 47);
            x *= 2.03; y *= 2.03; weight *= .48;
        }
        return sum;
    }
    function prepare() {
        if (textures) return textures;
        textures = [193, 421].map((seed, layer) => {
            const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 160;
            const ctx = canvas.getContext('2d'), image = ctx.createImageData(canvas.width, canvas.height);
            const heights = new Float32Array(canvas.width * canvas.height);
            for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                heights[y * canvas.width + x] = field(x / 50, y / 62, seed);
            }
            for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                const index = y * canvas.width + x, h = heights[index];
                const dx = heights[y * canvas.width + Math.min(canvas.width - 1, x + 1)] - h;
                const dy = heights[Math.min(canvas.height - 1, y + 1) * canvas.width + x] - h;
                const lighting = Math.max(0, Math.min(1, .38 + dx * 16 - dy * 22));
                const density = smooth(.24, .64, h);
                const lower = 1 - smooth(.48 + h * .30, 1, y / canvas.height);
                const shade = 15 + lighting * 32 + h * 21;
                const p = index * 4;
                image.data[p] = shade * .86;
                image.data[p + 1] = shade * .94;
                image.data[p + 2] = shade + 5 + layer * 2;
                image.data[p + 3] = density * lower * 245;
            }
            ctx.putImageData(image, 0, 0); return canvas;
        });
        return textures;
    }
    function createRenderer(canvas) {
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) throw new Error('Storm canvas unavailable');
        const layers = prepare();
        ready();
        function resize() {
            const ratio = Math.min(root.devicePixelRatio || 1, 1.25, Math.sqrt(850000 / (innerWidth * innerHeight)));
            canvas.width = Math.round(innerWidth * ratio); canvas.height = Math.round(innerHeight * ratio);
        }
        function draw(seconds, options = {}) {
            const w = canvas.width, h = canvas.height, background = !!options.ambient;
            const reduced = !!options.reduced;
            const coverage = background ? .92 : smooth(0, .8, seconds) * (1 - smooth(2.9, 4.2, seconds));
            const flash = reduced ? 0 : options.flash ?? strikes.reduce((sum, at, i) => sum + pulse(seconds, at, [1, .72, .90][i]), 0);
            ctx.clearRect(0, 0, w, h);
            const sky = ctx.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, `rgba(9,13,23,${background ? 1 : coverage * .32})`);
            sky.addColorStop(.68, `rgba(15,18,28,${background ? 1 : coverage * .27})`);
            sky.addColorStop(1, `rgba(13,15,23,${background ? 1 : coverage * .18})`);
            ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
            // Behind-cloud sheet lightning illuminates a direction, never the full viewport.
            if (flash > .005) {
                const side = options.side ?? (seconds < 2 ? .78 : seconds < 2.5 ? .22 : .65);
                const light = ctx.createRadialGradient(w * side, h * .11, 0, w * side, h * .11, w * .75);
                light.addColorStop(0, `rgba(164,186,218,${flash * .52})`);
                light.addColorStop(.4, `rgba(100,130,172,${flash * .22})`); light.addColorStop(1, 'rgba(63,86,120,0)');
                ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
            }
            if (photo) {
                const height = h * .79, width = Math.max(w * 1.2, height * 1.75);
                const drift = reduced ? 0 : Math.sin(seconds * .014) * w * .04;
                ctx.globalAlpha = coverage * (background ? 1 : .48);
                ctx.drawImage(photo, (w - width) / 2 + drift, -height * .04 - (1 - coverage) * h * .10, width, height);
                if (flash > .005) {
                    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = coverage * flash * .78;
                    ctx.drawImage(photo, (w - width) / 2 + drift, -height * .04 - (1 - coverage) * h * .10, width, height);
                    ctx.globalCompositeOperation = 'source-over';
                }
            }
            for (let i = 0; i < layers.length; i++) {
                const speed = background ? .0018 : .009;
                const drift = reduced ? 0 : Math.sin(seconds * speed * (i + 1)) * w * .10;
                const gather = background ? 0 : (1 - coverage) * w * .24 * (i % 2 ? 1 : -1);
                const width = Math.max(w * 1.32, h * 1.1), height = h * [.80, .71, .64][i];
                const x = (w - width) / 2 + drift + gather;
                ctx.globalAlpha = coverage * (photo ? [.16, .24][i] : [1, .81][i]);
                ctx.drawImage(layers[i], x, -height * [.15, .20, .26][i], width, height);
                if (flash > .005) {
                    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = coverage * flash * [.34, .26, .13][i];
                    ctx.drawImage(layers[i], x, -height * [.15, .20, .26][i], width, height);
                    ctx.globalCompositeOperation = 'source-over';
                }
            }
            ctx.globalAlpha = 1;
            const veil = ctx.createLinearGradient(0, h * .26, 0, h);
            veil.addColorStop(0, 'rgba(8,11,19,0)'); veil.addColorStop(1, `rgba(9,12,19,${background ? .58 : coverage * .25})`);
            ctx.fillStyle = veil; ctx.fillRect(0, 0, w, h);
            if (!background && flash > .10 && seconds > 2.5) {
                // One brief, fine cloud-to-cloud filament behind the foreground canopy.
                ctx.strokeStyle = `rgba(197,216,239,${flash * .50})`; ctx.lineWidth = Math.max(1, w / 1100);
                ctx.beginPath(); ctx.moveTo(w * .62, h * .10);
                for (let i = 1; i <= 28; i++) ctx.lineTo(w * (.62 + i * .005), h * (.10 + i * .003 + noise(i * .7, 0, 27) * .014));
                ctx.stroke();
            }
            return { coverage, flash };
        }
        function dispose() { canvas.width = canvas.height = 1; }
        resize(); return { draw, resize, dispose };
    }
    let reflection = '';
    function reflect(flash) {
        const value = (Math.min(1, flash) * .055).toFixed(4);
        if (value === reflection) return;
        reflection = value;
        document.body.style.setProperty('--storm-reflection', value);
        document.body.classList.toggle('storm-lit', flash > .005);
    }
    function stopEffect(reason = 'cleanup') {
        const run = effect; effect = null;
        if (!run) return;
        cancelAnimationFrame(run.frame); clearTimeout(run.watchdog); run.events.abort();
        run.audio?.stop(); run.renderer?.dispose(); run.host?.remove();
        document.body.classList.remove('storm-playing'); reflect(0);
        run.resolve({ reason });
    }
    function play(options = {}) {
        stopEffect();
        return new Promise(resolve => {
            const run = { resolve, events: new AbortController(), frame: 0, renderer: null };
            effect = run;
            try {
                const reduced = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
                const host = document.createElement('div'); host.className = 'storm-effect'; run.host = host;
                const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
                const button = document.createElement('button'); button.className = 'storm-skip'; button.type = 'button'; button.textContent = '略過';
                button.setAttribute('aria-label', '略過雷霆特效'); host.append(canvas, button); document.body.append(host);
                document.body.classList.add('storm-playing');
                run.audio = root.StormAudio?.create(options.muted !== false || reduced);
                run.renderer = createRenderer(canvas);
                const start = performance.now(), length = reduced ? 900 : duration;
                run.audio?.start();
                const signal = run.events.signal;
                button.addEventListener('click', () => stopEffect('skipped'), { signal });
                root.addEventListener('resize', () => run.renderer.resize(), { signal });
                root.addEventListener('pagehide', () => stopEffect('hidden'), { signal });
                document.addEventListener('visibilitychange', () => { if (document.hidden) stopEffect('hidden'); }, { signal });
                document.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); stopEffect('skipped'); } }, { signal, capture: true });
                document.addEventListener('click', e => { if (e.target.closest('.undo-toast')) stopEffect('undo'); }, { signal, capture: true });
                run.watchdog = setTimeout(() => stopEffect('timeout'), length + 1500);
                let previous = -Infinity;
                function frame(now) {
                    if (effect !== run) return;
                    const elapsed = now - start;
                    if (elapsed >= length) { stopEffect('complete'); return; }
                    if (now - previous >= (innerWidth < 600 ? 1000 / 30 : 1000 / 40)) {
                        previous = now;
                        const seconds = reduced ? 1.4 : elapsed / 1000;
                        const state = run.renderer.draw(seconds, { reduced }); reflect(state.flash);
                        host.style.opacity = reduced ? Math.min(1, elapsed / 160, (length - elapsed) / 240) : 1;
                        host.dataset.stage = reduced ? 'still' : seconds < .8 ? 'gather' : seconds < 1.6 ? 'rumble' : seconds < 2.9 ? 'lightning' : 'clear';
                    }
                    run.frame = requestAnimationFrame(frame);
                }
                run.frame = requestAnimationFrame(frame);
            } catch (error) { console.warn('Storm effect unavailable', error); stopEffect('unavailable'); }
        });
    }
    function cleanupAmbient() {
        const run = ambient; ambient = null;
        if (!run) return;
        cancelAnimationFrame(run.frame); run.events.abort(); run.renderer.dispose(); run.canvas.remove();
        if (!effect) reflect(0);
    }
    function mount(host) {
        if (ambient?.host === host) return;
        cleanupAmbient(); if (!host) return;
        let run;
        try {
            const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); canvas.className = 'storm-ambient';
            const renderer = createRenderer(canvas); host.append(canvas);
            run = { host, canvas, renderer, events: new AbortController(), frame: 0, elapsed: 0, previous: performance.now(), nextStrike: 24000, strikeAt: -10000, count: 0 };
            ambient = run;
            const reduced = matchMedia('(prefers-reduced-motion: reduce)'), signal = run.events.signal;
            function draw() {
                const flash = reduced.matches ? 0 : pulse(run.elapsed / 1000, run.strikeAt / 1000, .27);
                renderer.draw(run.elapsed / 1000, { ambient: true, reduced: reduced.matches, flash, side: run.count % 2 ? .83 : .16 });
                if (!effect) reflect(flash);
            }
            function frame(now) {
                if (ambient !== run) return;
                run.frame = requestAnimationFrame(frame);
                if (effect || root.HomecomingEffect?.playing) { run.previous = now; return; }
                const since = now - run.previous;
                const flashing = Math.abs(run.elapsed - run.strikeAt) < 350;
                if (since < (flashing ? 33 : 100)) return;
                run.elapsed += Math.min(since, 150); run.previous = now;
                if (run.elapsed >= run.nextStrike) {
                    run.strikeAt = run.elapsed; run.count++;
                    run.nextStrike = run.elapsed + [31000, 42000, 27000][run.count % 3];
                }
                draw();
            }
            function resume() {
                cancelAnimationFrame(run.frame); run.previous = performance.now(); draw();
                if (!document.hidden && !reduced.matches) run.frame = requestAnimationFrame(frame);
            }
            document.addEventListener('visibilitychange', resume, { signal });
            root.addEventListener('resize', () => { renderer.resize(); draw(); }, { signal });
            root.addEventListener('pagehide', cleanupAmbient, { signal });
            reduced.addEventListener('change', resume, { signal }); resume();
        } catch (error) { if (run) cleanupAmbient(); console.warn('Storm background unavailable', error); }
    }
    root.SpecialThemes = {
        ...root.SpecialThemes,
        thunder: { ambient: { mount, cleanup: cleanupAmbient }, onAdd: play, stop: stopEffect },
    };
    root.StormVisuals = { prepare, ready, createRenderer, duration, strikes };
})(globalThis);
