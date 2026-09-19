(function (root) {
    'use strict';
    const clamp = value => Math.max(0, Math.min(1, value));
    const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };

    function create(T, canvas, woodImage) {
        const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.48;
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
        renderer.setClearColor('#100e0c');
        const scene = new T.Scene();
        scene.background = new T.Color('#100e0c');
        scene.fog = new T.FogExp2('#100e0c', .082);
        const camera = new T.PerspectiveCamera(39, 1, .1, 35);
        const geometries = new Set(), materials = new Set(), textures = new Set();
        const material = (color, options = {}) => {
            const result = new T.MeshStandardMaterial({ color, roughness: .85, metalness: 0, ...options });
            materials.add(result); return result;
        };
        function mesh(geometry, mat, x, y, z, parent = scene) {
            geometries.add(geometry);
            const object = new T.Mesh(geometry, mat); object.position.set(x, y, z);
            object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
        }
        const box = (w, h, d, mat, x, y, z, parent) => mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, parent);
        const cylinder = (top, bottom, height, mat, x, y, z, parent) => mesh(new T.CylinderGeometry(top, bottom, height, 24), mat, x, y, z, parent);
        function grain() {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
            const context = canvas.getContext('2d'), image = context.createImageData(256, 256);
            let seed = 31;
            for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                const drift = 10 * Math.sin(x * .009 + y * .035) + 3 * Math.sin(x * .025 - y * .076);
                const fiber = Math.sin(y * .27 + drift) * 13 + Math.sin(y * .078 + drift * .65) * 12;
                const noise = ((seed >>> 16) / 65535 - .5) * 9;
                const value = 129 + fiber + noise, i = (y * 256 + x) * 4;
                image.data[i] = value * 1.04; image.data[i + 1] = value * .92;
                image.data[i + 2] = value * .75; image.data[i + 3] = 255;
            }
            context.putImageData(image, 0, 0);
            const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
            texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(2, 2);
            texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
            textures.add(texture); return texture;
        }
        const woodTexture = woodImage ? new T.Texture(woodImage) : grain();
        woodTexture.colorSpace = T.SRGBColorSpace; woodTexture.wrapS = woodTexture.wrapT = T.RepeatWrapping;
        woodTexture.repeat.set(1, 1); woodTexture.needsUpdate = true; textures.add(woodTexture);
        const tableTexture = woodTexture.clone(); tableTexture.repeat.set(3, 2); tableTexture.needsUpdate = true; textures.add(tableTexture);
        const tableWood = material('#9c7e62', { map: tableTexture, roughness: .91 });
        const boardFrame = material('#c4a37f', { map: woodTexture, roughness: .78 });
        const boardEdge = material('#705846', { map: woodTexture, roughness: .87 });
        const paleSquare = material('#f1dfbd', { map: woodTexture, roughness: .91 });
        const darkSquare = material('#a1866d', { map: woodTexture, roughness: .94 });
        const fineNoise = grain(); fineNoise.repeat.set(3, 2);
        const ivory = material('#c5b597', { bumpMap: fineNoise, bumpScale: .008, roughness: .91 });
        const ebony = material('#65584b', { bumpMap: fineNoise, bumpScale: .012, roughness: .92 });
        const rim = material('#7f6747', { roughness: .78 });
        box(14, .36, 10, tableWood, 0, -.34, 0);
        box(5.34, .15, 5.34, boardEdge, 0, -.045, 0);
        box(5.16, .12, 5.16, boardFrame, 0, .075, 0);
        box(5.23, .011, 5.23, rim, 0, .013, 0);
        for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
            box(.60, .012, .60, (row + col) % 2 ? darkSquare : paleSquare,
                (col - 3.5) * .60, .143, (row - 3.5) * .60);
        }
        const inset = material('#261c16', { roughness: .83 });
        for (const edge of [-2.57, 2.57]) {
            box(.018, .008, 5.13, inset, edge, .145, 0);
            box(5.13, .008, .018, inset, 0, .145, edge);
        }
        for (const x of [-2.48, 2.48]) for (const z of [-2.48, 2.48]) {
            const pin = cylinder(.018, .018, .008, rim, x, .148, z); pin.castShadow = false;
        }

        const kingProfile = [[0,.04],[.25,.04],[.28,.075],[.265,.11],[.22,.14],[.18,.19],[.17,.27],[.15,.41],[.16,.57],[.22,.63],[.21,.675],[.155,.71],[.12,.755],[.155,.79],[.14,.83],[0,.83]];
        const pawnProfile = [[0,.04],[.18,.04],[.21,.07],[.18,.10],[.12,.13],[.10,.20],[.11,.29],[.14,.31],[.13,.34],[0,.34]];
        function piece(type, color, x, z, isMain = false) {
            const group = new T.Group(); group.position.set(x, .157, z); scene.add(group);
            const body = mesh(new T.LatheGeometry((type === 'king' ? kingProfile : pawnProfile).map(([r, y]) => new T.Vector2(r, y)), 28), color, 0, 0, 0, group);
            body.geometry.computeVertexNormals();
            if (type === 'king') {
                const band = mesh(new T.TorusGeometry(.14, .025, 8, 28), rim, 0, .685, 0, group); band.rotation.x = Math.PI / 2;
                box(.085, .28, .072, color, 0, .96, 0, group);
                box(.255, .075, .072, color, 0, 1.025, 0, group);
            } else {
                mesh(new T.SphereGeometry(.135, 16, 12), color, 0, .45, 0, group);
            }
            const shadowMaterial = new T.MeshBasicMaterial({ color: '#080707', transparent: true, opacity: isMain ? .13 : .10, depthWrite: false });
            materials.add(shadowMaterial);
            const shadow = mesh(new T.CircleGeometry(type === 'king' ? .38 : .29, 24), shadowMaterial, x, .156, z);
            shadow.rotation.x = -Math.PI / 2;
            return { group, shadow, shadowMaterial };
        }
        const king = piece('king', ivory, -.3, .3, true);
        piece('king', ebony, 1.5, -1.5);
        for (const [x, z, white] of [[-1.5,1.5,1],[-.9,1.5,1],[.9,1.5,1],[2.1,.9,0],[-2.1,-.9,0],[-.9,-1.5,0],[.9,-.9,0],[-1.5,-.3,1]]) {
            piece('pawn', white ? ivory : ebony, x, z);
        }
        const ambient = new T.HemisphereLight('#c6b8a5', '#35271f', 1.72); scene.add(ambient);
        const lamp = new T.PointLight('#f1c588', 162, 17, 2); lamp.position.set(-2.7, 5.2, 2.8); scene.add(lamp);
        const edgeLight = new T.DirectionalLight('#a4aebe', 1.02); edgeLight.position.set(3, 4, -3); scene.add(edgeLight);
        const focus = new T.SpotLight('#f0cf99', 8, 15, .6, .9, 2); focus.position.set(-1, 5, 1); focus.target.position.set(0, 0, 0); scene.add(focus, focus.target);
        focus.castShadow = true;
        focus.shadow.mapSize.set(innerWidth < 600 ? 512 : 768, innerWidth < 600 ? 512 : 768);
        focus.shadow.bias = -.00045; focus.shadow.radius = 3;
        const target = new T.Vector3(0, .06, 0);
        function resize() {
            const width = Math.max(1, innerWidth), height = Math.max(1, innerHeight);
            const ratio = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(900000 / (width * height)));
            renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
            camera.aspect = width / height; camera.fov = width < 600 ? 44 : 39;
            camera.updateProjectionMatrix();
        }
        function render(time, options = {}) {
            const motion = !!options.motion;
            const impact = motion ? Math.exp(-Math.pow((time - 2.10) / .115, 2)) : 0;
            const drift = options.reduced ? 0 : Math.sin(time * .085) * .08;
            const narrow = innerWidth < 600;
            const approach = options.preview ? .55 : motion ? smooth(.16, 1.58, time) * (1 - smooth(2.46, 3.3, time)) : 0;
            target.y = .06 + approach * .28;
            camera.position.set(4.0 + drift - approach * 1.1, (narrow ? 7.1 : 5.3) - approach * 2,
                (narrow ? 10.0 : 8.2) - approach * 2.85);
            camera.lookAt(target);
            lamp.position.x = -2.7 + (options.reduced ? 0 : Math.sin(time * .055) * .07) + impact * .11;
            focus.position.x = -1 + impact * .09;
            if (motion) {
                const lift = smooth(.6, 1.18, time) * (1 - smooth(1.83, 2.10, time));
                const move = smooth(.91, 1.38, time);
                king.group.position.set(-.3 + .6 * move, .157 + lift * .57, .3 - .6 * move);
                king.shadow.position.set(king.group.position.x, .156, king.group.position.z);
                king.shadowMaterial.opacity = .13 - lift * .09;
                lamp.intensity = 162 + smooth(0, .6, time) * (1 - smooth(2.15, 3.25, time)) * 12 + impact * 10;
                focus.intensity = 8 + smooth(0, .6, time) * (1 - smooth(2.2, 3.25, time)) * 6;
                camera.position.y += impact * .014;
            } else { king.group.position.set(-.3, .157, .3); king.shadow.position.set(-.3, .156, .3); king.shadowMaterial.opacity = .13; lamp.intensity = 162; focus.intensity = 8; }
            renderer.render(scene, camera);
            return { impact, kingX: king.group.position.x, kingY: king.group.position.y };
        }
        function dispose() {
            geometries.forEach(geometry => geometry.dispose()); materials.forEach(item => item.dispose());
            textures.forEach(texture => texture.dispose()); focus.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); scene.clear();
        }
        resize(); return { render, resize, dispose, renderer };
    }
    root.ChessScene = { create };
})(globalThis);
