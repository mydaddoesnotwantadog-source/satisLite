import { LiquidGlass } from 'liquidglass';

/**
 * GlassManager coordinates @ybouane/liquidglass for SatisLite.
 * Replaces flat CSS backdrop-filter blur with real physical WebGL liquid glass:
 * - Snell's Law optical refraction
 * - Chromatic aberration dispersion
 * - Dual-pass Kawase blur of underlying 3D world
 * - Fresnel rim reflections and specular highlights
 * - SDF rounded-rect geometry with smooth lens bevels
 */
export class GlassManager {
    constructor(app) {
        this.app = app;
        this.instance = null;
        this.initialized = false;
        this.canInit = false;
        this.registeredElements = new Set();
        this._onResize = this._handleResize.bind(this);
    }

    /**
     * Initializes LiquidGlass on target elements (Mobile only).
     */
    async init() {
        this.canInit = true;
        const isMobile = window.isMobile || window.innerWidth < 800 || document.body.classList.contains('mobile-mode');
        if (!isMobile) {
            if (this.initialized) this.destroy();
            window.removeEventListener('resize', this._onResize);
            window.addEventListener('resize', this._onResize);
            return;
        }
        if (this.initialized) return;

        try {
            const root = document.body;
            const elements = [];

            // 1. Bottom toolbar (iOS Dock on mobile)
            const bottomToolbar = document.getElementById('bottom-toolbar');
            if (bottomToolbar) {
                elements.push(bottomToolbar);
                this.registeredElements.add(bottomToolbar);
            }

            // 2. Phone counter panel (liquid glass on mobile, opaque metal styling on desktop)
            const resourcePanel = document.getElementById('resource-panel');
            if (resourcePanel) {
                elements.push(resourcePanel);
                this.registeredElements.add(resourcePanel);
            }

            // 3. Top-right Goal panel (liquid glass on mobile, opaque metal styling on desktop)
            const goalPanel = document.getElementById('goal-panel');
            if (goalPanel && goalPanel.parentElement === root) {
                elements.push(goalPanel);
                this.registeredElements.add(goalPanel);
            }

            // 4. Mobile modals / popups if present as direct children of root
            const popups = ['recipe-popup', 'leigh-high-popup'];
            popups.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.parentElement === root) {
                    elements.push(el);
                    this.registeredElements.add(el);
                }
            });

            if (elements.length === 0) return;

            this.instance = await LiquidGlass.init({
                root: root,
                glassElements: elements,
                defaults: {
                    blurAmount: 1.6,
                    refraction: 0.85,
                    chromAberration: 0.085,
                    edgeHighlight: 0.24,
                    specular: 0.20,
                    fresnel: 0.35,
                    distortion: 0.45,
                    cornerRadius: 99,
                    zRadius: 7,
                    opacity: 1,
                    saturation: 0.30,
                    tintStrength: 0.15,
                    brightness: 0.06,
                    shadowOpacity: 0.25,
                    shadowSpread: 12,
                    shadowOffsetY: 3,
                    floating: false,
                    button: false,
                    bevelMode: 0
                }
            });

            // Activate liquid glass styling (clears CSS backdrop-filter to let WebGL shine)
            elements.forEach(el => el.classList.add('liquid-glass-active'));
            this.initialized = true;

            window.removeEventListener('resize', this._onResize);
            window.addEventListener('resize', this._onResize);
            console.log('[GlassManager] LiquidGlass successfully initialized on', elements.length, 'elements');
        } catch (err) {
            console.warn('[GlassManager] LiquidGlass failed to initialize, keeping CSS fallback:', err);
        }
    }

    _handleResize() {
        if (!this.canInit) return;
        const isMobile = window.isMobile || window.innerWidth < 800 || document.body.classList.contains('mobile-mode');
        if (isMobile && !this.initialized) {
            this.init();
        } else if (!isMobile && this.initialized) {
            this.destroy();
            window.addEventListener('resize', this._onResize);
        }
    }

    /**
     * Mark an element or all glass elements dirty for a re-render.
     */
    markChanged(el) {
        if (this.instance) {
            this.instance.markChanged(el);
        }
    }

    destroy() {
        window.removeEventListener('resize', this._onResize);
        if (this.instance) {
            this.instance.destroy();
            this.instance = null;
        }
        this.registeredElements.forEach(el => el.classList.remove('liquid-glass-active'));
        this.registeredElements.clear();
        this.initialized = false;
    }
}
