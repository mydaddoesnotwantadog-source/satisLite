import * as THREE from 'three';

export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };

        this.panSpeedMouse = 20.0;
        this.panSpeedKey = 15.0; // Units per second
        this.zoomSpeed = 0.1;
        this.minZoom = 0.5;
        this.maxZoom = 5.0;

        this.keys = { w: false, a: false, s: false, d: false };

        // Target-based camera to support rotation
        this.target = new THREE.Vector3(0, 0, 0);
        this.angle = Math.PI / 4; // Start at 45 degrees for isometric
        this.pitch = Math.atan(1 / Math.sqrt(2)); // Isometric pitch (~35.264 degrees)
        this.distance = 40; // Distance from target

        this.updateCameraPosition();
        this.setupEvents();
    }

    updateCameraPosition() {
        // Clamp target to map bounds (150x150 map -> -74 to 74)
        const maxBound = 74;
        this.target.x = Math.max(-maxBound, Math.min(maxBound, this.target.x));
        this.target.z = Math.max(-maxBound, Math.min(maxBound, this.target.z));

        const x = this.target.x + this.distance * Math.cos(this.angle) * Math.cos(this.pitch);
        const y = this.target.y + this.distance * Math.sin(this.pitch);
        const z = this.target.z + this.distance * Math.sin(this.angle) * Math.cos(this.pitch);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.target);

        // Recalculate movement vectors based on new camera angle
        this.forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.forward.y = 0;
        if (this.forward.lengthSq() > 0) this.forward.normalize();

        this.right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this.right.y = 0;
        if (this.right.lengthSq() > 0) this.right.normalize();
    }

    setupEvents() {
        this.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2 || e.button === 1) {
                this.isDragging = true;
                this.previousMousePosition = { x: e.offsetX, y: e.offsetY };
            }
        });

        this.domElement.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.offsetX - this.previousMousePosition.x;
                const deltaY = e.offsetY - this.previousMousePosition.y;

                const factor = (1 / this.camera.zoom) * (this.panSpeedMouse / window.innerHeight);

                const moveRight = this.right.clone().multiplyScalar(-deltaX * factor);
                const moveForward = this.forward.clone().multiplyScalar(deltaY * factor);

                this.target.add(moveRight);
                this.target.add(moveForward);
                this.updateCameraPosition();

                this.previousMousePosition = { x: e.offsetX, y: e.offsetY };
            }
        });

        this.domElement.addEventListener('mouseup', (e) => {
            if (e.button === 2 || e.button === 1) {
                this.isDragging = false;
            }
        });

        this.domElement.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });

        this.domElement.addEventListener('wheel', (e) => {
            const zoomAmount = e.deltaY * -0.001 * this.zoomSpeed;
            this.camera.zoom += zoomAmount;
            this.camera.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.camera.zoom));
            this.camera.updateProjectionMatrix();
        });

        this.domElement.addEventListener('contextmenu', e => e.preventDefault());

        // Keyboard Support
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = true;
            }
            if (key === 'q') {
                this.angle += Math.PI / 2; // Rotate left 90 degrees
                this.updateCameraPosition();
            }
            if (key === 'e') {
                this.angle -= Math.PI / 2; // Rotate right 90 degrees
                this.updateCameraPosition();
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = false;
            }
        });
    }

    setIntroState() {
        this.distance = 400;
        this.target.set(0, 0, 0); // Center of the map
        this.updateCameraPosition();
        this.isIntroAnimating = false;
    }

    startIntroAnimation(durationMs) {
        this.isIntroAnimating = true;
        this.animStartTime = performance.now();
        this.animDuration = durationMs;
        this.animStartDist = this.distance;
        this.animEndDist = 40;
    }

    update(deltaTime) {
        if (this.isIntroAnimating) {
            const now = performance.now();
            let t = (now - this.animStartTime) / this.animDuration;
            if (t >= 1) {
                t = 1;
                this.isIntroAnimating = false;
            }
            // Cubic ease out
            const ease = 1 - Math.pow(1 - t, 3);
            this.distance = this.animStartDist + (this.animEndDist - this.animStartDist) * ease;
            this.updateCameraPosition();
            return;
        }

        // Keyboard Panning
        let moved = false;
        const moveVec = new THREE.Vector3(0, 0, 0);

        if (this.keys.w) { moveVec.add(this.forward); moved = true; }
        if (this.keys.s) { moveVec.sub(this.forward); moved = true; }
        if (this.keys.a) { moveVec.sub(this.right); moved = true; }
        if (this.keys.d) { moveVec.add(this.right); moved = true; }

        if (moved) {
            moveVec.normalize().multiplyScalar(this.panSpeedKey * deltaTime * (1 / this.camera.zoom));
            this.target.add(moveVec);
            this.updateCameraPosition();
        }
    }
}
