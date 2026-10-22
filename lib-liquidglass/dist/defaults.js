/**
 * Default configuration values for the liquid glass effect.
 * These can be overridden per-element via dataset.config (JSON string)
 * or globally via LiquidGlass.init({ defaults: { ... } }).
 */
export const DEFAULTS = {
    blurAmount: 0.00,
    refraction: 0.69,
    chromAberration: 0.05,
    edgeHighlight: 0.05,
    specular: 0.00,
    fresnel: 1.00,
    distortion: 0.00,
    cornerRadius: 65,
    zRadius: 40,
    opacity: 1.00,
    saturation: 0.00,
    tintStrength: 0.00,
    brightness: 0.00,
    shadowOpacity: 0.30,
    shadowSpread: 10,
    shadowOffsetY: 1,
    floating: false,
    button: false,
    bevelMode: 0,
};
/** Number of Gaussian blur passes (higher = smoother but slower) */
export const BLUR_ITERATIONS = 3;
/** Extra padding around each panel for rendering the drop shadow (px) */
export const SHADOW_PAD = 20;
//# sourceMappingURL=defaults.js.map