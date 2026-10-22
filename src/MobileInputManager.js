import * as THREE from 'three';

export class MobileInputManager {
    constructor(cameraController, placementSystem, domElement) {
        this.cameraController = cameraController;
        this.placementSystem = placementSystem;
        this.domElement = domElement;
        
        this.touches = {};
        this.initialPinchDist = null;
        this.initialZoom = null;
        
        this.zoomSensitivity = 0.01;
        
        this.setupEvents();
    }
    
    setupEvents() {
        this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.domElement.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
        this.domElement.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: false });
    }
    
    onTouchStart(e) {
        if (e.cancelable) e.preventDefault();
        
        const ps = this.placementSystem;
        const isBuildMode = ps && ps.ui && ps.ui.activeTool !== 'select' && ps.ui.activeTool !== 'delete';

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const isDraggingGhost = e.touches.length === 1 && isBuildMode && ps.isTouchOnGhost(touch.clientX, touch.clientY, 64);
            this.touches[touch.identifier] = {
                startX: touch.clientX,
                startY: touch.clientY,
                lastX: touch.clientX,
                lastY: touch.clientY,
                isTap: true,
                isDraggingGhost: isDraggingGhost
            };
        }
        
        this.initialPinchDist = null;
    }
    
    onTouchMove(e) {
        if (e.cancelable) e.preventDefault();
        
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            
            const touchData = this.touches[touch.identifier];
            if (touchData) {
                const deltaX = touch.clientX - touchData.lastX;
                const deltaY = touch.clientY - touchData.lastY;
                
                if (Math.hypot(touch.clientX - touchData.startX, touch.clientY - touchData.startY) > 14) {
                    touchData.isTap = false;
                }
                
                if (touchData.isDraggingGhost && this.placementSystem) {
                    this.placementSystem.moveGhostFromTouch(touch.clientX, touch.clientY);
                } else {
                    // Calculate exact world units per pixel to keep 1:1 touch mapping
                    const frustumSize = 12; // Matches GameScene
                    // X mapping
                    const factorX = (frustumSize * (this.domElement.clientWidth / this.domElement.clientHeight)) / (this.domElement.clientWidth * this.cameraController.camera.zoom);
                    // Y mapping is scaled because the ground plane is viewed at an angle
                    const factorY = frustumSize / (this.domElement.clientHeight * this.cameraController.camera.zoom) * 1.2; 
                    
                    this.cameraController.target.addScaledVector(this.cameraController.right, -deltaX * factorX);
                    this.cameraController.target.addScaledVector(this.cameraController.forward, deltaY * factorY);
                    this.cameraController.updateCameraPosition();
                }
                
                touchData.lastX = touch.clientX;
                touchData.lastY = touch.clientY;
            }
        } else if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            if (this.touches[touch1.identifier]) {
                this.touches[touch1.identifier].isTap = false;
                this.touches[touch1.identifier].isDraggingGhost = false;
            }
            if (this.touches[touch2.identifier]) {
                this.touches[touch2.identifier].isTap = false;
                this.touches[touch2.identifier].isDraggingGhost = false;
            }
            
            const dx = touch1.clientX - touch2.clientX;
            const dy = touch1.clientY - touch2.clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (this.initialPinchDist === null) {
                this.initialPinchDist = dist;
                this.initialZoom = this.cameraController.camera.zoom;
            } else {
                const scale = dist / this.initialPinchDist;
                let newZoom = this.initialZoom * scale;
                newZoom = Math.max(this.cameraController.minZoom, Math.min(this.cameraController.maxZoom, newZoom));
                this.cameraController.camera.zoom = newZoom;
                this.cameraController.camera.updateProjectionMatrix();
            }
        }
    }
    
    onTouchEnd(e) {
        if (e.cancelable) e.preventDefault();
        
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const touchData = this.touches[touch.identifier];
            
            // Only trigger tap if it was a quick single touch
            if (touchData && touchData.isTap && e.touches.length === 0) {
                this.handleTap(touch.clientX, touch.clientY);
            }
            
            delete this.touches[touch.identifier];
        }
        
        if (e.touches.length < 2) {
            this.initialPinchDist = null;
        }
    }
    
    handleTap(clientX, clientY) {
        const x = (clientX / window.innerWidth) * 2 - 1;
        const y = -(clientY / window.innerHeight) * 2 + 1;
        
        if (this.placementSystem) {
            this.placementSystem.mouse.x = x;
            this.placementSystem.mouse.y = y;
            this.placementSystem.screenMouse.x = clientX;
            this.placementSystem.screenMouse.y = clientY;
            this.placementSystem.executeTap();
        }
    }
}
