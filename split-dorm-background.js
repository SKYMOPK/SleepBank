(function (root) {
    'use strict';
    root.DormBackground = root.SceneBackground.create({
        canvasClass: 'dorm-ambient', interval: 66,
        errorMessage: 'Dorm background unavailable; using still image',
        async prepare() {
            await root.HomecomingEffect.prepare();
            const image = new Image(); image.src = root.HomecomingTextures.wood;
            await image.decode(); return image;
        },
        create(canvas, image) {
            const scene = root.HomecomingScene.create(root.THREE, canvas, image);
            scene.renderer.shadowMap.autoUpdate = false;
            scene.renderer.shadowMap.needsUpdate = true;
            return scene;
        },
        draw: (scene, time) => scene.renderBackground(time),
        paused: () => root.HomecomingEffect.playing,
    });
})(globalThis);
