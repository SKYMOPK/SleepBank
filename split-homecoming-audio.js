(function (root) {
    'use strict';
    function create(muted) {
        if (muted) return null;
        const Audio = root.AudioContext || root.webkitAudioContext;
        if (!Audio) return null;
        let context;
        try { context = new Audio(); } catch { return null; }
        const master = context.createGain(); master.gain.value = .38; master.connect(context.destination);
        const nodes = [];
        let stopped = false;
        context.resume().catch(() => {});
        function noise(at, duration, frequency, gain, q = .7) {
            const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
            const data = buffer.getChannelData(0);
            let previous = 0;
            for (let i = 0; i < data.length; i++) {
                previous = (previous + (Math.random() * 2 - 1) * .12) / 1.12;
                data[i] = previous * 3;
            }
            const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
            source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = q;
            source.connect(filter); filter.connect(envelope); envelope.connect(master);
            envelope.gain.setValueAtTime(0, at);
            envelope.gain.linearRampToValueAtTime(gain, at + Math.min(.02, duration / 5));
            envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
            source.start(at); source.stop(at + duration);
            nodes.push(source, filter, envelope);
        }
        return {
            start() {
                if (stopped || context.state !== 'running') return;
                const t = context.currentTime;
                // Close, dry Foley: latch, wooden friction, then two soft indoor steps.
                noise(t + 1.12, .08, 1800, .32, 1.4);
                noise(t + 1.21, .13, 650, .32);
                noise(t + 1.36, .52, 280, .16, 2);
                noise(t + 1.69, .64, 410, .12, 2.4);
                noise(t + 1.9, .18, 125, .55);
                noise(t + 1.94, .14, 650, .12);
                noise(t + 2.4, .2, 110, .46);
                noise(t + 2.44, .14, 590, .10);
                noise(t + 2.65, .035, 1400, .11);
            },
            stop() {
                if (stopped) return; stopped = true;
                const t = context.currentTime;
                master.gain.cancelScheduledValues(t);
                master.gain.setValueAtTime(master.gain.value, t);
                master.gain.linearRampToValueAtTime(0, t + .045);
                setTimeout(() => {
                    nodes.forEach(node => { try { node.stop?.(); } catch { /* Already ended. */ } node.disconnect(); });
                    master.disconnect(); context.close().catch(() => {});
                }, 60);
            },
        };
    }
    root.HomecomingAudio = { create };
})(globalThis);
