(function (root) {
    'use strict';
    const clamp = x => Math.max(0, Math.min(1, x));
    const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };

    function create(T, canvas, woodImage) {
        const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFSoftShadowMap;
        const scene = new T.Scene();
        scene.background = new T.Color('#161512');
        const camera = new T.PerspectiveCamera(60, 1, .035, 30);
        const geometries = new Set(), materials = new Set(), textures = new Set();
        const material = (color, opts = {}) => {
            const m = new T.MeshStandardMaterial({ color, roughness: .84, ...opts }); materials.add(m); return m;
        };
        function texture(kind) {
            const c = document.createElement('canvas'); c.width = c.height = 256;
            const ctx = c.getContext('2d'); const pixels = ctx.createImageData(256, 256);
            let seed = 179;
            for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                const n = (seed / 4294967296 - .5) * 18;
                const weave = kind === 'fabric' ? ((x % 3 === 0 ? -15 : 0) + (y % 3 === 0 ? 12 : 0)) : 0;
                const v = 208 + n + weave, i = (y * 256 + x) * 4;
                pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v; pixels.data[i + 3] = 255;
            }
            ctx.putImageData(pixels, 0, 0);
            const map = new T.CanvasTexture(c); map.wrapS = map.wrapT = T.RepeatWrapping;
            map.repeat.set(kind === 'fabric' ? 4 : 3, kind === 'fabric' ? 4 : 3);
            textures.add(map); return map;
        }
        const plaster = texture('plaster'), fabric = texture('fabric');
        const woodMap = new T.Texture(woodImage); woodMap.colorSpace = T.SRGBColorSpace;
        woodMap.wrapS = woodMap.wrapT = T.RepeatWrapping; woodMap.needsUpdate = true;
        textures.add(woodMap);
        const wood = material('#977455', { map: woodMap, bumpMap: woodMap, bumpScale: .008, roughness: .66 });
        const edgeWood = material('#534333', { map: woodMap, roughness: .7 });
        const wall = material('#b7b1a2', { map: plaster, bumpMap: plaster, bumpScale: .018 });
        const hallWall = material('#716e61', { map: plaster, bumpMap: plaster, bumpScale: .012 });
        const metal = material('#62605a', { metalness: .72, roughness: .32 });
        const steel = material('#343831', { metalness: .45, roughness: .55 });
        const cream = material('#c2b9a3', { map: fabric, bumpMap: fabric, bumpScale: .008 });
        const sage = material('#677971', { map: fabric, bumpMap: fabric, bumpScale: .008 });
        const blue = material('#535e70', { map: fabric, bumpMap: fabric, bumpScale: .008 });
        function mesh(geometry, mat, x, y, z, parent = scene) {
            geometries.add(geometry);
            const obj = new T.Mesh(geometry, mat); obj.position.set(x, y, z);
            obj.castShadow = obj.receiveShadow = true; parent.add(obj); return obj;
        }
        function box(w, h, d, mat, x, y, z, parent) { return mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, parent); }
        function roundBox(w, h, d, r, mat, x, y, z, parent) {
            const shape = new T.Shape(), a = -w / 2 + r, b = -h / 2 + r;
            shape.moveTo(a, -h / 2); shape.lineTo(-a, -h / 2);
            shape.quadraticCurveTo(w / 2, -h / 2, w / 2, b); shape.lineTo(w / 2, -b);
            shape.quadraticCurveTo(w / 2, h / 2, -a, h / 2); shape.lineTo(a, h / 2);
            shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, -b); shape.lineTo(-w / 2, b);
            shape.quadraticCurveTo(-w / 2, -h / 2, a, -h / 2);
            const geo = new T.ExtrudeGeometry(shape, { depth: d - r, bevelEnabled: true, bevelThickness: r / 2, bevelSize: r / 2, bevelSegments: 2, steps: 1, curveSegments: 4 });
            geo.translate(0, 0, -d / 2 + r / 2);
            return mesh(geo, mat, x, y, z, parent);
        }
        function cylinder(r, h, mat, x, y, z, parent = scene) { return mesh(new T.CylinderGeometry(r, r, h, 16), mat, x, y, z, parent); }
        function pillow(x, z, mat) {
            const p = roundBox(.76, .14, .40, .055, mat, x, .75, z);
            p.rotation.y = .06; p.rotation.z = -.025; return p;
        }
        // Real doorway opening: side walls do not cover the aperture.
        box(2.1, 2.9, .22, hallWall, -1.83, 1.45, .03);
        box(2.1, 2.9, .22, hallWall, 1.83, 1.45, .03);
        box(1.56, .48, .22, hallWall, 0, 2.67, .03);
        box(.13, 2.48, .27, edgeWood, -.77, 1.24, 0);
        box(.13, 2.48, .27, edgeWood, .77, 1.24, 0);
        box(1.68, .13, .27, edgeWood, 0, 2.45, 0);
        box(1.52, .025, .34, metal, 0, .012, 0);
        const hinge = new T.Group(); hinge.position.set(-.7, 0, -.025); scene.add(hinge);
        box(1.4, 2.37, .065, wood, .7, 1.205, 0, hinge);
        // Modest flush veneer leaf, visible edge, peephole and a lever with depth.
        box(.018, 2.36, .068, edgeWood, 1.397, 1.205, 0, hinge);
        const escutcheon = cylinder(.038, .014, metal, 1.24, 1.05, .045, hinge); escutcheon.rotation.x = Math.PI / 2;
        const handleStem = cylinder(.012, .058, metal, 1.24, 1.05, .075, hinge); handleStem.rotation.x = Math.PI / 2;
        const lever = roundBox(.16, .023, .026, .008, metal, 1.175, 1.05, .103, hinge);
        const eye = cylinder(.014, .018, metal, .7, 1.65, .038, hinge); eye.rotation.x = Math.PI / 2;
        for (const y of [.3, 1.15, 2.06]) cylinder(.017, .1, metal, .006, y, -.04, hinge);
        const crackMaterial = new T.MeshBasicMaterial({ color: '#f9cd8d', transparent: true, opacity: 0, depthWrite: false }); materials.add(crackMaterial);
        const crack = box(.012, 2.34, .006, crackMaterial, .714, 1.2, .145); crack.castShadow = false;

        // Two-person room: central walking aisle, two beds, shared worktop and chairs.
        box(4.8, .12, 9, material('#827c6e', { map: plaster, roughness: .92 }), 0, -.075, -1);
        box(.15, 2.9, 5.1, wall, -2.4, 1.45, -2.5);
        box(.15, 2.9, 5.1, wall, 2.4, 1.45, -2.5);
        box(4.8, 2.9, .14, wall, 0, 1.45, -5.05);
        box(4.8, .1, 5.1, material('#bcb9ad'), 0, 2.92, -2.5);
        for (const x of [-2.31, 2.31]) box(.045, .12, 5, edgeWood, x, .06, -2.5);
        box(4.7, .12, .045, edgeWood, 0, .06, -4.95);
        const grout = material('#716d61');
        for (let z = -5; z < 3; z += .65) box(4.7, .001, .007, grout, 0, -.011, z);
        for (let x = -2; x < 2.4; x += .65) box(.007, .001, 8, grout, x, -.01, -1);
        const rug = box(1.25, .012, 1.8, material('#777367', { map: fabric }), 0, .005, -2.7); rug.rotation.y = -.015;
        for (const [x, blanket] of [[-1.35, sage], [1.35, blue]]) {
            roundBox(1.05, .16, 2.12, .025, wood, x, .36, -2.8);
            roundBox(1.01, .19, 2.02, .055, cream, x, .52, -2.8);
            box(1.06, .75, .08, wood, x, .52, -3.84);
            for (const dx of [-.43, .43]) for (const dz of [-.89, .89]) box(.045, .34, .045, steel, x + dx, .17, -2.8 + dz);
            pillow(x, -3.47, cream);
            const clothGeo = new T.PlaneGeometry(1.12, 1.45, 24, 28), pos = clothGeo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const xx = pos.getX(i), yy = pos.getY(i);
                pos.setZ(i, .022 * Math.sin(xx * 21 + yy * 4) + .008 * Math.sin(yy * 31) - Math.max(0, Math.abs(xx) - .46) * 2.7);
            }
            clothGeo.computeVertexNormals(); const blanketMesh = mesh(clothGeo, blanket, x, .695, -2.41); blanketMesh.rotation.x = -Math.PI / 2;
            box(.44, .55, .48, wood, x, .275, -1.23);
            box(.39, .2, .015, edgeWood, x, .39, -.98);
            box(.08, .018, .025, metal, x, .4, -.962);
        }
        roundBox(3.3, .065, .64, .012, wood, 0, .78, -4.58);
        for (const x of [-1.5, 0, 1.5]) box(.045, .76, .5, steel, x, .38, -4.58);
        const ceramic = material('#b6ac96', { roughness: .36 });
        for (const [x, offset] of [[-.79, -.05], [.82, .06]]) {
            const chair = new T.Group(); chair.position.set(x, 0, -3.87 + offset); chair.rotation.y = x < 0 ? .13 : -.18; scene.add(chair);
            roundBox(.45, .055, .45, .022, edgeWood, 0, .44, 0, chair);
            roundBox(.44, .43, .05, .035, edgeWood, 0, .77, .21, chair);
            for (const dx of [-.18, .18]) for (const dz of [-.17, .17]) cylinder(.015, .44, steel, dx, .22, dz, chair);
            box(.29, .026, .21, material(x < 0 ? '#727e6f' : '#7a6457'), x, .833, -4.47).rotation.y = .15;
            box(.26, .008, .19, cream, x, .85, -4.47).rotation.y = .15;
            const cup = mesh(new T.CylinderGeometry(.042, .034, .095, 24, 1, true), ceramic, x + .23, .86, -4.56);
            const inner = cylinder(.036, .003, material('#443221'), x + .23, .89, -4.56); inner.castShadow = false;
            mesh(new T.TorusGeometry(.031, .008, 8, 20), ceramic, cup.position.x + .047, .86, -4.56);
        }
        // Window recess and soft linen folds, visible beyond furniture.
        box(1.5, 1.12, .06, edgeWood, 0, 1.94, -4.947);
        box(1.36, 1, .025, material('#101d27', { emissive: '#162536', emissiveIntensity: .15, roughness: 1 }), 0, 1.94, -4.902);
        box(.038, 1.06, .04, cream, 0, 1.94, -4.87);
        for (const side of [-1, 1]) {
            const g = new T.PlaneGeometry(.5, 1.38, 28, 1), p = g.attributes.position;
            for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 76) * .027);
            g.computeVertexNormals(); mesh(g, cream, side * .88, 1.86, -4.8);
        }
        box(.7, 2.15, .58, wood, -1.88, 1.075, -.57);
        box(.012, 2.05, .022, edgeWood, -1.88, 1.075, -.266);
        for (const x of [-1.93, -1.83]) cylinder(.008, .13, metal, x, 1.03, -.245);
        // A cork board and pinned papers: a lived-in room without names or labels.
        box(.73, .51, .025, material('#8d7457', { map: plaster }), 1.48, 1.68, -4.945);
        for (let i = 0; i < 4; i++) {
            const paper = box(.17, .22, .004, material(['#c9c2ac', '#9ba591', '#b0a593', '#b4b5af'][i]), 1.22 + i * .16, 1.7 + (i % 2) * .07, -4.925);
            paper.rotation.z = (i - 1.5) * .045;
        }
        const lampShade = material('#d6c5a1', { emissive: '#ffd6a0', emissiveIntensity: .05, roughness: .8 });
        cylinder(.025, .27, steel, .22, 2.74, -2.8);
        mesh(new T.CylinderGeometry(.18, .30, .18, 32, 1, true), lampShade, .22, 2.52, -2.8);
        const diffuser = cylinder(.265, .012, lampShade, .22, 2.435, -2.8); diffuser.castShadow = false;
        const hemisphere = new T.HemisphereLight('#b3c2d0', '#65513a', .34); scene.add(hemisphere);
        const hall = new T.PointLight('#ddd0ae', 18, 9, 2); hall.position.set(-1, 2.5, 2.4); scene.add(hall);
        const warm = new T.PointLight('#ffd39a', 2, 9, 2); warm.position.set(.22, 2.32, -2.8); scene.add(warm);
        const spill = new T.SpotLight('#ffd39b', 9, 8, Math.PI / 3, .7, 1.7);
        spill.position.set(.15, 2.05, -1.2); spill.target.position.set(.35, .1, 1.8);
        spill.castShadow = true; spill.shadow.mapSize.set(1024, 1024); spill.shadow.bias = -.00025; spill.shadow.normalBias = .015;
        scene.add(spill, spill.target);
        const key = new T.SpotLight('#ffe1b7', 0, 10, 1.35, .85, 1.6);
        key.position.set(.1, 2.66, -2.3); key.target.position.set(0, 0, -3.2);
        key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.normalBias = .02;
        scene.add(key, key.target);
        let disposed = false;
        function resize() {
            const w = root.innerWidth, h = root.innerHeight;
            renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.5, Math.sqrt(1400000 / (w * h))));
            renderer.setSize(w, h, false); camera.aspect = w / h;
            camera.fov = w < h ? 76 : 61; camera.updateProjectionMatrix();
        }
        function update(t, reduced = false) {
            if (disposed) return;
            const time = reduced ? 3.02 : t;
            const approach = smooth(.4, 1.6, time), enter = smooth(1.6, 2.95, time);
            hinge.rotation.y = .25 * smooth(1.2, 1.6, time) + 1.37 * smooth(1.6, 2.38, time);
            crackMaterial.opacity = .65 * smooth(1.2, 1.6, time) * (1 - smooth(1.7, 2.1, time));
            lever.rotation.z = -.18 * Math.sin(Math.PI * smooth(1.12, 1.6, time));
            camera.position.set(.04 * enter, 1.49 - .045 * enter, 3.15 - 1.35 * approach - 2.65 * enter);
            camera.lookAt(-.22 * enter, 1.2 - .10 * enter, -4.6);
            const light = smooth(2.5, 3.15, time);
            warm.intensity = 4 + light * 18; key.intensity = light * 14;
            hemisphere.intensity = .48 + light * .10;
            lampShade.emissiveIntensity = .04 + light * .22;
            renderer.toneMappingExposure = 1.05 - light * .08;
            renderer.render(scene, camera);
        }
        function renderBackground(t = 0) {
            if (disposed) return;
            const drift = Math.sin(t * Math.PI * 2 / 18);
            hinge.rotation.y = 1.62; crackMaterial.opacity = 0;
            camera.position.set(.65 + drift * .045, 1.48, -.78);
            camera.lookAt(-.40 + drift * .11, 1.12, -3.9);
            warm.intensity = 12; key.intensity = 7;
            hemisphere.intensity = .38; hall.intensity = 0;
            lampShade.emissiveIntensity = .10;
            renderer.toneMappingExposure = .73;
            renderer.render(scene, camera);
        }
        function dispose() {
            if (disposed) return; disposed = true;
            geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
            for (const light of [spill, key]) light.shadow.dispose();
            renderer.dispose(); renderer.forceContextLoss(); scene.clear();
        }
        resize();
        return { update, renderBackground, resize, dispose, renderer, camera, hinge };
    }
    root.HomecomingScene = { create, smooth };
})(globalThis);
