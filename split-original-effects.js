/* Legacy effect choreography retained for the ledger cosmetics system. */
(function (root) {
    let cleanup = () => {};
    let audio;
    function play(id, reduced, muted) {
        cleanup();
        root.SpecialThemes?.thunder.stop();
        root.SpecialThemes?.chess.stop();
        if (id === 'thunder_effect') return root.SpecialThemes?.thunder.onAdd({ muted, reducedMotion: reduced });
        if (id === 'chess_effect') return root.SpecialThemes?.chess.onAdd({ muted, reducedMotion: reduced });
        const host = root.document.createElement('div');
        host.className = 'original-fx-host';
        host.dataset.effect = id;
        host.setAttribute('aria-hidden', 'true');
        root.document.body.append(host);
        const timers = new Set(), frames = new Set();
        let stopped = false;
        const setTimeout = (fn, ms) => {
            const handle = root.setTimeout(() => { timers.delete(handle); if (!stopped) fn(); }, ms);
            timers.add(handle); return handle;
        };
        const requestAnimationFrame = fn => {
            const handle = root.requestAnimationFrame(t => { frames.delete(handle); if (!stopped) fn(t); });
            frames.add(handle); return handle;
        };
        const document = {
            body: host,
            createElement: tag => root.document.createElement(tag),
            getElementById: name => name === 'effect-overlay' ? host : null,
            querySelector: selector => host.querySelector(selector),
            querySelectorAll: selector => host.querySelectorAll(selector),
        };
        const window = { innerWidth: root.innerWidth, innerHeight: root.innerHeight };
        const myEquipped = { effect: id };
        const _ac = muted || reduced ? null : (audio ||= new (root.AudioContext || root.webkitAudioContext)());
        const confettiCanvas = root.document.createElement('canvas');
        confettiCanvas.className = 'original-confetti';
        host.append(confettiCanvas);
        const emitter = root.confetti.create(confettiCanvas, { resize: true });
        const confetti = options => reduced ? undefined : emitter(options);
        cleanup = () => {
            stopped = true;
            timers.forEach(handle => root.clearTimeout(handle));
            frames.forEach(handle => root.cancelAnimationFrame(handle));
            emitter.reset(); host.remove();
        };
        function _tone(freq, vol, delay, dur) {
            if (_ac.state === 'suspended') _ac.resume();
            const osc = _ac.createOscillator();
            const gain = _ac.createGain();
            osc.connect(gain); gain.connect(_ac.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = _ac.currentTime + delay;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(vol, t + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.start(t); osc.stop(t + dur + 0.05);
        }
        function _sweep(f0, f1, vol, dur) {
            if (_ac.state === 'suspended') _ac.resume();
            const osc = _ac.createOscillator();
            const gain = _ac.createGain();
            osc.connect(gain); gain.connect(_ac.destination);
            osc.type = 'sine';
            const t = _ac.currentTime;
            osc.frequency.setValueAtTime(f0, t);
            osc.frequency.linearRampToValueAtTime(f1, t + dur);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(vol, t + 0.015);
            gain.gain.linearRampToValueAtTime(0, t + dur);
            osc.start(t); osc.stop(t + dur + 0.05);
        }
        function playSound(type) {
            if (!_ac) return;
            if (type === 'success') {
                _tone(523, 0.13, 0,    0.45);   // C5
                _tone(659, 0.10, 0.13, 0.50);   // E5
                _tone(784, 0.08, 0.26, 0.60);   // G5
            } else if (type === 'coin') {
                _tone(1047, 0.10, 0,    0.22);  // C6
                _tone(1319, 0.07, 0.09, 0.28);  // E6
            } else if (type === 'click') {
                _tone(380, 0.045, 0, 0.07);     // 短促低調 pop
            } else if (type === 'sweep') {
                _sweep(220, 480, 0.055, 0.18);  // 頁面切換上行掃
            } else if (type === 'open') {
                _tone(440, 0.07, 0,    0.20);   // A4
                _tone(554, 0.05, 0.10, 0.28);   // C#5
            } else if (type === 'close') {
                _tone(554, 0.06, 0,    0.14);   // C#5
                _tone(415, 0.04, 0.09, 0.22);   // G#4（下行）
            } else if (type === 'error') {
                _tone(260, 0.09, 0,    0.18);   // C4
                _tone(210, 0.07, 0.15, 0.26);   // 低一點（下行警示）
            } else if (type === 'meow') {
                if (_ac.state === 'suspended') _ac.resume();
                const t = _ac.currentTime;
                // ── 第一聲「喵∼」主體（triangle）
                const mo1 = _ac.createOscillator(); const mg1 = _ac.createGain();
                mo1.connect(mg1); mg1.connect(_ac.destination); mo1.type = 'triangle';
                mo1.frequency.setValueAtTime(340, t);
                mo1.frequency.linearRampToValueAtTime(920, t + 0.13);
                mo1.frequency.linearRampToValueAtTime(540, t + 0.40);
                mg1.gain.setValueAtTime(0, t);
                mg1.gain.linearRampToValueAtTime(0.15, t + 0.025);
                mg1.gain.setValueAtTime(0.15, t + 0.22);
                mg1.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
                mo1.start(t); mo1.stop(t + 0.60);
                // 和聲層（sine +4Hz），增添溫潤感
                const mo2 = _ac.createOscillator(); const mg2 = _ac.createGain();
                mo2.connect(mg2); mg2.connect(_ac.destination); mo2.type = 'sine';
                mo2.frequency.setValueAtTime(344, t);
                mo2.frequency.linearRampToValueAtTime(924, t + 0.13);
                mo2.frequency.linearRampToValueAtTime(544, t + 0.40);
                mg2.gain.setValueAtTime(0, t);
                mg2.gain.linearRampToValueAtTime(0.06, t + 0.025);
                mg2.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
                mo2.start(t); mo2.stop(t + 0.55);
                // ── 第二聲短促「嗚∼」（0.58s 後）
                const mo3 = _ac.createOscillator(); const mg3 = _ac.createGain();
                mo3.connect(mg3); mg3.connect(_ac.destination); mo3.type = 'triangle';
                mo3.frequency.setValueAtTime(480, t + 0.58);
                mo3.frequency.linearRampToValueAtTime(680, t + 0.68);
                mo3.frequency.linearRampToValueAtTime(500, t + 0.84);
                mg3.gain.setValueAtTime(0, t + 0.58);
                mg3.gain.linearRampToValueAtTime(0.09, t + 0.60);
                mg3.gain.exponentialRampToValueAtTime(0.001, t + 0.86);
                mo3.start(t + 0.58); mo3.stop(t + 0.92);
                // ── 尾音：三顆高音鈴鐺上行（1.0s 後）
                [[1760,1.00,0.35],[2093,1.10,0.30],[2637,1.20,0.26]].forEach(([freq,delay,dur]) => {
                    const oc = _ac.createOscillator(); const gc = _ac.createGain();
                    oc.connect(gc); gc.connect(_ac.destination); oc.type = 'sine';
                    const ts = t + delay;
                    gc.gain.setValueAtTime(0, ts);
                    gc.gain.linearRampToValueAtTime(0.048, ts + 0.013);
                    gc.gain.exponentialRampToValueAtTime(0.001, ts + dur);
                    oc.frequency.value = freq; oc.start(ts); oc.stop(ts + dur + 0.05);
                });
            } else if (type === 'matcha') {
                if (_ac.state === 'suspended') _ac.resume();
                const t = _ac.currentTime;
                // 抹茶缽缽音：基音 + 泛音
                [[220, 0, 0.055, 2.0],[440, 0.01, 0.035, 1.5],[660, 0.02, 0.02, 1.0]].forEach(([freq, delay, peak, dur]) => {
                    const osc = _ac.createOscillator(); const gn = _ac.createGain();
                    osc.connect(gn); gn.connect(_ac.destination); osc.type = 'sine';
                    const st = t + delay;
                    gn.gain.setValueAtTime(0, st);
                    gn.gain.linearRampToValueAtTime(peak, st + 0.02);
                    gn.gain.exponentialRampToValueAtTime(0.001, st + dur);
                    osc.frequency.value = freq;
                    osc.start(st); osc.stop(st + dur + 0.05);
                });
            } else if (type === 'rain') {
                if (_ac.state === 'suspended') _ac.resume();
                [[740,0,0.035,0.34],[988,0.07,0.026,0.30],[622,0.15,0.022,0.42]].forEach(([freq,delay,peak,dur]) => {
                    const osc = _ac.createOscillator(); const gn = _ac.createGain();
                    osc.connect(gn); gn.connect(_ac.destination); osc.type = 'sine';
                    const st = _ac.currentTime + delay;
                    gn.gain.setValueAtTime(0, st);
                    gn.gain.linearRampToValueAtTime(peak, st + 0.012);
                    gn.gain.exponentialRampToValueAtTime(0.001, st + dur);
                    osc.frequency.value = freq;
                    osc.start(st); osc.stop(st + dur + 0.04);
                });
            } else if (type === 'stardust') {
                // 深夜星空：玲瓏高音鐘聲上行
                if (_ac.state === 'suspended') _ac.resume();
                [[1047,0,0.55],[1319,0.08,0.50],[1568,0.16,0.62],[2093,0.25,0.58],[1760,0.34,0.52]].forEach(([freq,delay,dur]) => {
                    const osc = _ac.createOscillator(); const gn = _ac.createGain();
                    osc.connect(gn); gn.connect(_ac.destination); osc.type = 'sine';
                    const t = _ac.currentTime + delay;
                    gn.gain.setValueAtTime(0, t);
                    gn.gain.linearRampToValueAtTime(0.065, t + 0.015);
                    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
                    osc.frequency.value = freq;
                    osc.start(t); osc.stop(t + dur + 0.05);
                });
            }
        }



        function fireCheckinEffect() {
            const eff = myEquipped.effect;
            const ov = document.getElementById('effect-overlay');
            if (ov) ov.replaceChildren();

            if (eff === 'cat_effect') {
                // 貓咪落地時喵一聲
                setTimeout(() => playSound('meow'), 720);

                // ── ACT 1：玫瑰閃光開場（0ms）
                const flash = document.createElement('div');
                flash.style.cssText = 'position:fixed;inset:0;background:rgba(210,70,130,0.20);pointer-events:none;z-index:8997;opacity:0;transition:opacity 0.12s;';
                document.body.appendChild(flash);
                requestAnimationFrame(() => requestAnimationFrame(() => { flash.style.opacity = '1'; }));
                setTimeout(() => { flash.style.transition = 'opacity 0.55s'; flash.style.opacity = '0'; setTimeout(() => flash.remove(), 580); }, 140);

                // ── ACT 2：粉紫聚光暈（持續全程）
                const ambience = document.createElement('div');
                ambience.style.cssText = 'position:fixed;inset:0;background:radial-gradient(ellipse at 50% 68%, rgba(215,70,145,0.22) 0%, rgba(145,40,115,0.14) 45%, transparent 72%);pointer-events:none;z-index:8998;opacity:0;transition:opacity 0.6s;';
                document.body.appendChild(ambience);
                requestAnimationFrame(() => requestAnimationFrame(() => { ambience.style.opacity = '1'; }));
                setTimeout(() => { ambience.style.opacity = '0'; setTimeout(() => ambience.remove(), 640); }, 3200);

                // ── ACT 3：CSS 貓咪角色登場
                const catWrap = document.createElement('div');
                catWrap.className = 'ccat-wrap';
                catWrap.innerHTML = `<div class="ccat">
                  <div class="ccat-tail"></div>
                  <div class="ccat-body"></div>
                  <div class="ccat-arm ccat-arm-l"></div>
                  <div class="ccat-arm ccat-arm-r"></div>
                  <div class="ccat-head">
                    <div class="ccat-ear ccat-ear-l"></div>
                    <div class="ccat-ear ccat-ear-r"></div>
                    <div class="ccat-eye ccat-eye-l"></div>
                    <div class="ccat-eye ccat-eye-r"></div>
                    <div class="ccat-nose"></div>
                    <div class="ccat-blush ccat-blush-l"></div>
                    <div class="ccat-blush ccat-blush-r"></div>
                    <div class="ccat-wsk ccat-wsk-l1"></div>
                    <div class="ccat-wsk ccat-wsk-l2"></div>
                    <div class="ccat-wsk ccat-wsk-r1"></div>
                    <div class="ccat-wsk ccat-wsk-r2"></div>
                  </div>
                  <div class="ccat-sp ccat-sp-1">✦</div>
                  <div class="ccat-sp ccat-sp-2">✧</div>
                  <div class="ccat-sp ccat-sp-3">⋆</div>
                  <div class="ccat-sp ccat-sp-4">✴</div>
                </div>`;
                ov.appendChild(catWrap);
                setTimeout(() => catWrap.remove(), 4400);

                // ── ACT 4：降落瞬間星爆（700ms，貓落地時機）
                setTimeout(() => {
                    const burstColors = ['#f9a8d4','#c084fc','#fce7f3','#fb7185','#e879f9','#fff'];
                    const sparkChars = ['✦','✧','⋆','✴','✵','✸','★'];
                    for (let i = 0; i < 22; i++) {
                        const s = document.createElement('div');
                        s.className = 'cat-burst';
                        s.textContent = sparkChars[Math.floor(Math.random() * sparkChars.length)];
                        const angle = Math.random() * Math.PI * 2;
                        const dist = 55 + Math.random() * 90;
                        s.style.cssText = `left:calc(50% + ${Math.cos(angle)*dist}px); bottom:calc(18% + ${Math.abs(Math.sin(angle))*dist*0.6}px); color:${burstColors[Math.floor(Math.random()*burstColors.length)]}; font-size:${10+Math.random()*18}px; text-shadow:0 0 10px currentColor; animation-duration:${(0.6+Math.random()*0.5).toFixed(2)}s; animation-delay:${(Math.random()*0.15).toFixed(2)}s;`;
                        document.body.appendChild(s);
                        setTimeout(() => s.remove(), 1000);
                    }
                }, 700);

                // ── ACT 5：愛心向上飄（0.7s 開始，持續飄出）
                const hearts = ['❤️','💕','🩷','💗','💖','✨'];
                for (let i = 0; i < 16; i++) {
                    const h = document.createElement('div');
                    h.className = 'heart-float';
                    h.textContent = hearts[Math.floor(Math.random() * hearts.length)];
                    const hx = (Math.random() - 0.5) * 50;
                    h.style.cssText = `left:${33+Math.random()*34}%; font-size:${13+Math.random()*13}px; --hdur:${1.6+Math.random()*1.3}s; --hdelay:${(i*0.14).toFixed(2)}s; --hx:${hx}px;`;
                    ov.appendChild(h);
                    setTimeout(() => h.remove(), 3800);
                }

                // ── ACT 6：花瓣雨（12片，分散入場）
                const petalEmoji = ['🌸','🌸','🌺','🌸','🌸','🌸','🌺','🌸','🌸','🌺','🌸','🌸'];
                for (let i = 0; i < 12; i++) {
                    const p = document.createElement('div');
                    p.className = 'petal-fall';
                    p.textContent = petalEmoji[i];
                    const rot = (Math.random() - 0.5) * 80, px = (Math.random() - 0.5) * 80;
                    p.style.cssText = `left:${3+Math.random()*94}%; font-size:${12+Math.random()*12}px; --pdur:${2.5+Math.random()*1.8}s; --pdelay:${Math.random()*1.4}s; --prot:${rot}deg; --px:${px}px; opacity:0.82;`;
                    ov.appendChild(p);
                    setTimeout(() => p.remove(), 5200);
                }

                // ── ACT 7：三波粉紫 confetti
                setTimeout(() => confetti({ particleCount:80, spread:110, origin:{y:0.25},
                    colors:['#fce7f3','#fda4af','#f9a8d4','#e9d5ff','#c084fc','#fff'],
                    gravity:0.38, scalar:0.92, drift:0.55 }), 300);
                setTimeout(() => confetti({ particleCount:50, spread:65, angle:65, origin:{x:0.15,y:0.5},
                    colors:['#fce7f3','#fb7185','#f9a8d4','#e9d5ff'],
                    gravity:0.32, scalar:0.78 }), 950);
                setTimeout(() => confetti({ particleCount:50, spread:65, angle:115, origin:{x:0.85,y:0.5},
                    colors:['#fce7f3','#fb7185','#f9a8d4','#e9d5ff'],
                    gravity:0.32, scalar:0.78 }), 950);

            } else if (eff === 'star_effect') {
                // 深夜星空鐘聲
                playSound('stardust');

                // 短暫深夜氛圍覆蓋
                const ambience = document.createElement('div');
                ambience.style.cssText = 'position:fixed;inset:0;background:rgba(4,8,22,0.6);pointer-events:none;z-index:8998;opacity:0;transition:opacity 0.35s;';
                document.body.appendChild(ambience);
                requestAnimationFrame(() => requestAnimationFrame(() => { ambience.style.opacity = '1'; }));
                setTimeout(() => { ambience.style.opacity = '0'; setTimeout(() => ambience.remove(), 380); }, 1500);

                // 銀白 confetti
                setTimeout(() => confetti({ particleCount: 110, spread: 100, origin: {y:0.5}, colors: ['#bfdbfe','#e0e7ff','#fff','#93c5fd','#60a5fa'] }), 180);

                // 流星線條 16 條
                for (let i = 0; i < 16; i++) {
                    const m = document.createElement('div');
                    m.className = 'meteor-line';
                    const len = 55 + Math.random() * 150;
                    m.style.cssText = `left:${-5+Math.random()*75}vw; top:${Math.random()*65}vh; width:${len}px; --mdur:${(0.45+Math.random()*0.5).toFixed(2)}s; --mdelay:${(Math.random()*0.85).toFixed(2)}s;`;
                    ov.appendChild(m);
                    setTimeout(() => m.remove(), 2200);
                }

                // 星點閃現 22 個
                const sparkleChars = ['✦','✧','⋆','★','✴','✵'];
                for (let i = 0; i < 22; i++) {
                    const s = document.createElement('div');
                    s.className = 'star-sparkle';
                    s.textContent = sparkleChars[Math.floor(Math.random() * sparkleChars.length)];
                    s.style.cssText = `left:${Math.random()*95}%; top:${Math.random()*90}%; font-size:${9+Math.random()*22}px; --sdur:${(0.4+Math.random()*0.65).toFixed(2)}s; --sdelay:${(Math.random()*0.75).toFixed(2)}s;`;
                    ov.appendChild(s);
                    setTimeout(() => s.remove(), 2200);
                }


            } else if (eff === 'matcha_effect') {
                playSound('matcha');

                // ── 深綠氛圍覆蓋（快速浮現、更飽和）
                const ambience = document.createElement('div');
                ambience.style.cssText = 'position:fixed;inset:0;background:radial-gradient(ellipse at 50% 55%, rgba(22,101,52,0.50) 0%, rgba(15,60,30,0.3) 50%, transparent 75%);pointer-events:none;z-index:8998;opacity:0;transition:opacity 0.3s;';
                document.body.appendChild(ambience);
                requestAnimationFrame(() => requestAnimationFrame(() => { ambience.style.opacity = '1'; }));
                setTimeout(() => { ambience.style.opacity = '0'; setTimeout(() => ambience.remove(), 660); }, 2800);

                // ── 墨滴中心爆發（更快更大）
                const drop = document.createElement('div');
                drop.className = 'matcha-drop';
                ov.appendChild(drop);
                setTimeout(() => drop.remove(), 730);

                // ── 漣漪4波（第一波快猛，後三波漸慢）
                const _ripples = [
                    { delay: 0,    dur: '1.1s',  ease: 'cubic-bezier(0.1,0.65,0.2,1)' },
                    { delay: 290,  dur: '1.8s',  ease: 'ease-out' },
                    { delay: 640,  dur: '2.3s',  ease: 'ease-out' },
                    { delay: 1050, dur: '2.7s',  ease: 'ease-out' },
                ];
                _ripples.forEach(({ delay, dur, ease }) => {
                    setTimeout(() => {
                        const ring = document.createElement('div');
                        ring.className = 'matcha-ripple';
                        ring.style.animationDuration = dur;
                        ring.style.animationTimingFunction = ease;
                        ov.appendChild(ring);
                        setTimeout(() => ring.remove(), parseFloat(dur) * 1000 + 120);
                    }, delay);
                });

                // ── 蒸氣粒子（更多，集中在前 480ms）
                for (let i = 0; i < 30; i++) {
                    setTimeout(() => {
                        const st = document.createElement('div');
                        st.className = 'matcha-steam';
                        const size = 6 + Math.random() * 14;
                        const sx = (Math.random() - 0.5) * 148;
                        const startY = 38 + Math.random() * 22;
                        const dur = 1.0 + Math.random() * 0.95;
                        st.style.cssText = `left:calc(50% + ${sx}px); top:${startY}vh; width:${size}px; height:${size}px; --sx:${sx * 0.35}px; --sdur:${dur}s;`;
                        ov.appendChild(st);
                        setTimeout(() => st.remove(), dur * 1000 + 100);
                    }, Math.random() * 480);
                }
            } else if (eff === 'rain_effect') {
                playSound('rain');

                const ambience = document.createElement('div');
                ambience.style.cssText = 'position:fixed;inset:0;background:linear-gradient(120deg, rgba(216,247,255,0.10), rgba(5,18,26,0.38) 45%, rgba(143,211,232,0.08));pointer-events:none;z-index:8998;opacity:0;transition:opacity 0.35s;backdrop-filter:blur(1px);';
                document.body.appendChild(ambience);
                requestAnimationFrame(() => requestAnimationFrame(() => { ambience.style.opacity = '1'; }));
                setTimeout(() => { ambience.style.opacity = '0'; setTimeout(() => ambience.remove(), 520); }, 2700);

                for (let i = 0; i < 46; i++) {
                    const drop = document.createElement('div');
                    drop.style.cssText = `position:fixed;left:${Math.random()*100}vw;top:${-8-Math.random()*28}vh;width:${1+Math.random()*1.5}px;height:${34+Math.random()*70}px;border-radius:999px;background:linear-gradient(180deg, rgba(216,247,255,0), rgba(216,247,255,0.7), rgba(143,211,232,0));transform:rotate(14deg);pointer-events:none;z-index:8999;opacity:${0.28+Math.random()*0.48};transition:transform ${0.9+Math.random()*0.9}s linear, opacity 0.45s;`;
                    ov.appendChild(drop);
                    requestAnimationFrame(() => { drop.style.transform = `translate(${60+Math.random()*80}px, ${window.innerHeight + 180}px) rotate(14deg)`; });
                    setTimeout(() => { drop.style.opacity = '0'; setTimeout(() => drop.remove(), 460); }, 900 + Math.random()*950);
                }

                const glass = document.createElement('div');
                glass.style.cssText = 'position:fixed;left:50%;top:50%;width:min(78vw,460px);aspect-ratio:1/1;border-radius:50%;transform:translate(-50%,-50%) scale(0.25);border:1px solid rgba(199,234,244,0.45);box-shadow:0 0 42px rgba(143,211,232,0.22), inset 0 0 34px rgba(216,247,255,0.08);background:radial-gradient(circle, rgba(216,247,255,0.10), transparent 58%);pointer-events:none;z-index:9001;opacity:0;transition:transform 1.15s cubic-bezier(0.12,0.65,0.2,1),opacity 0.7s;';
                ov.appendChild(glass);
                requestAnimationFrame(() => { glass.style.opacity = '1'; glass.style.transform = 'translate(-50%,-50%) scale(1)'; });
                setTimeout(() => { glass.style.opacity = '0'; glass.style.transform = 'translate(-50%,-50%) scale(1.18)'; setTimeout(() => glass.remove(), 720); }, 1550);

                for (let i = 0; i < 18; i++) {
                    setTimeout(() => {
                        const ripple = document.createElement('div');
                        ripple.style.cssText = `position:fixed;left:${16+Math.random()*68}vw;top:${18+Math.random()*62}vh;width:10px;height:10px;border:1px solid rgba(199,234,244,0.48);border-radius:50%;pointer-events:none;z-index:9000;opacity:0.8;transform:translate(-50%,-50%);transition:width 0.82s,height 0.82s,opacity 0.82s;`;
                        ov.appendChild(ripple);
                        requestAnimationFrame(() => { ripple.style.width = `${48+Math.random()*80}px`; ripple.style.height = ripple.style.width; ripple.style.opacity = '0'; });
                        setTimeout(() => ripple.remove(), 920);
                    }, Math.random() * 1200);
                }

                setTimeout(() => confetti({ particleCount:70, spread:95, origin:{y:0.42}, colors:['#d8f7ff','#8fd3e8','#c7eaf4','#6fb7cf','#ffffff'], gravity:0.28, scalar:0.72, drift:0.28 }), 520);
            }
        }


        if (reduced) {
            host.classList.add('original-fx-reduced');
            const title = root.document.createElement('div');
            title.className = 'original-fx-message';
            title.textContent = '已新增帳目';
            host.append(title);
            setTimeout(cleanup, 400);
        } else {
            fireCheckinEffect();
            host.append(confettiCanvas);
            setTimeout(cleanup, 6000);
        }
    }
    root.LedgerOriginalEffects = { play, stop: () => cleanup() };
})(globalThis);
