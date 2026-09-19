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
            primed = new Audio(); primed.resume().catch(() => {});
            const source = primed.createBufferSource();
            source.buffer = primed.createBuffer(1, 1, primed.sampleRate);
            source.connect(primed.destination); source.onended = () => source.disconnect(); source.start();
            expiry = setTimeout(clearPrime, 12000);
        } catch { clearPrime(); }
    }
    function create(muted) {
        const Audio = root.AudioContext || root.webkitAudioContext;
        if (muted || !Audio) { clearPrime(); return null; }
        let context;
        try { context = primed && primed.state !== 'closed' ? primed : new Audio(); primed = null; clearTimeout(expiry); }
        catch { return null; }
        const master = context.createGain(), compressor = context.createDynamicsCompressor();
        master.gain.value = .52; compressor.threshold.value = -18; compressor.ratio.value = 3;
        master.connect(compressor); compressor.connect(context.destination);
        const nodes = [], sources = [];
        let stopped = false;
        const ready = context.resume().catch(() => {});
        function strike(at, amplitude) {
            // Damped inharmonic modes give a dense wooden/stone contact, not a pitched UI tone.
            for (const [frequency, strength, decay] of [[116,.42,.24],[183,.25,.18],[296,.11,.105]]) {
                const oscillator = context.createOscillator(), envelope = context.createGain();
                oscillator.type = 'sine'; oscillator.frequency.value = frequency;
                oscillator.connect(envelope); envelope.connect(master);
                envelope.gain.setValueAtTime(.0001, at);
                envelope.gain.linearRampToValueAtTime(amplitude * strength, at + .003);
                envelope.gain.exponentialRampToValueAtTime(.0001, at + decay);
                oscillator.start(at); oscillator.stop(at + decay + .01);
                sources.push(oscillator); nodes.push(oscillator, envelope);
            }
            const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .16), context.sampleRate);
            const samples = buffer.getChannelData(0); let seed = 83, previous = 0;
            for (let i = 0; i < samples.length; i++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                previous = previous * .88 + (seed / 4294967295 * 2 - 1) * .12;
                samples[i] = previous;
            }
            const source = context.createBufferSource(), lowpass = context.createBiquadFilter(), envelope = context.createGain();
            source.buffer = buffer; lowpass.type = 'lowpass'; lowpass.frequency.value = 620;
            source.connect(lowpass); lowpass.connect(envelope); envelope.connect(master);
            envelope.gain.setValueAtTime(0, at);
            envelope.gain.linearRampToValueAtTime(amplitude * .24, at + .002);
            envelope.gain.exponentialRampToValueAtTime(.0001, at + .135);
            const delay = context.createDelay(.3), tail = context.createGain();
            delay.delayTime.value = .115; tail.gain.value = .12;
            envelope.connect(delay); delay.connect(tail); tail.connect(master);
            source.start(at); source.stop(at + .16);
            sources.push(source); nodes.push(source, lowpass, envelope, delay, tail);
        }
        return {
            start() {
                const requested = performance.now();
                ready.then(() => {
                    if (stopped || context.state !== 'running' || performance.now() - requested > 250) return;
                    const at = context.currentTime;
                    strike(at + .68, .12);
                    strike(at + 2.10, .66);
                }).catch(() => {});
            },
            stop() {
                if (stopped) return; stopped = true;
                const at = context.currentTime;
                master.gain.cancelScheduledValues(at); master.gain.setValueAtTime(master.gain.value, at);
                master.gain.linearRampToValueAtTime(0, at + .05);
                setTimeout(() => {
                    sources.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } });
                    nodes.forEach(node => node.disconnect()); master.disconnect(); compressor.disconnect();
                    context.close().catch(() => {});
                }, 70);
            },
        };
    }
    root.addEventListener('pagehide', clearPrime);
    root.ChessAudio = { prime, create, clearPrime };
})(globalThis);
