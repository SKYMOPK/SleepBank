(function (root) {
    'use strict';
    let primed = null, expiry = 0;
    function clearPrime() {
        clearTimeout(expiry);
        const context = primed; primed = null;
        if (context && context.state !== 'closed') context.close().catch(() => {});
    }
    function prime(muted) {
        if (muted || primed) return;
        const Audio = root.AudioContext || root.webkitAudioContext;
        if (!Audio) return;
        try {
            primed = new Audio();
            primed.resume().catch(() => {});
            const source = primed.createBufferSource();
            source.buffer = primed.createBuffer(1, 1, primed.sampleRate);
            source.connect(primed.destination);
            source.onended = () => source.disconnect(); source.start();
            expiry = setTimeout(clearPrime, 12000);
        } catch { clearPrime(); }
    }
    function create(muted) {
        const Audio = root.AudioContext || root.webkitAudioContext;
        if (muted || !Audio) { clearPrime(); return null; }
        let context;
        try {
            context = primed && primed.state !== 'closed' ? primed : new Audio();
            primed = null; clearTimeout(expiry);
        } catch { return null; }
        const master = context.createGain(), limiter = context.createDynamicsCompressor();
        master.gain.value = .46; limiter.threshold.value = -18; limiter.ratio.value = 4;
        master.connect(limiter); limiter.connect(context.destination);
        const nodes = [], sources = [];
        let stopped = false;
        const ready = context.resume().catch(() => {});
        function roll(at, length, strength, seed) {
            const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * length), context.sampleRate);
            for (let channel = 0; channel < 2; channel++) {
                const samples = buffer.getChannelData(channel); let previous = 0, random = seed + channel * 71;
                for (let i = 0; i < samples.length; i++) {
                    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
                    previous = .985 * previous + (random / 4294967295 * 2 - 1) * .12;
                    const time = i / context.sampleRate;
                    samples[i] = previous * (.65 + .22 * Math.sin(time * 8.3 + channel) + .13 * Math.sin(time * 17.1));
                }
            }
            const source = context.createBufferSource(), low = context.createBiquadFilter(), mid = context.createBiquadFilter();
            const lowGain = context.createGain(), midGain = context.createGain(), envelope = context.createGain();
            source.buffer = buffer; low.type = 'lowpass'; low.frequency.value = 170;
            mid.type = 'bandpass'; mid.frequency.value = 390; mid.Q.value = .55;
            lowGain.gain.value = 1.25; midGain.gain.value = .22;
            source.connect(low); low.connect(lowGain); lowGain.connect(envelope);
            source.connect(mid); mid.connect(midGain); midGain.connect(envelope); envelope.connect(master);
            envelope.gain.setValueAtTime(0, at);
            envelope.gain.linearRampToValueAtTime(strength, at + .26);
            envelope.gain.exponentialRampToValueAtTime(.001, at + length);
            // Quiet delayed texture supplies distance without an obvious echo.
            const delay = context.createDelay(.5), tail = context.createGain();
            delay.delayTime.value = .17; tail.gain.value = .13;
            envelope.connect(delay); delay.connect(tail); tail.connect(master);
            source.start(at); source.stop(at + length); sources.push(source);
            nodes.push(source, low, mid, lowGain, midGain, envelope, delay, tail);
        }
        return {
            start() {
                const requested = performance.now();
                ready.then(() => {
                    if (stopped || context.state !== 'running' || performance.now() - requested > 250) return;
                    const t = context.currentTime;
                    roll(t + .78, 2.5, .36, 921);
                    roll(t + 1.92, 1.9, .55, 413);
                    roll(t + 2.45, 1.55, .38, 813);
                    roll(t + 2.99, 1.05, .42, 291);
                }).catch(() => {});
            },
            stop() {
                if (stopped) return; stopped = true;
                const t = context.currentTime;
                master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
                master.gain.linearRampToValueAtTime(0, t + .06);
                setTimeout(() => {
                    sources.forEach(source => { try { source.stop(); } catch { /* Already finished. */ } });
                    nodes.forEach(node => node.disconnect()); master.disconnect(); limiter.disconnect();
                    context.close().catch(() => {});
                }, 80);
            },
        };
    }
    root.addEventListener('pagehide', clearPrime);
    root.StormAudio = { create, prime, clearPrime };
})(globalThis);
