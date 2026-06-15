export class SoundEngine {
    constructor() {
        this.buffers = {};
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
            
            this.preRenderSounds();
        }
    }
    
    _ensureCtx() {
        if (!this.ctx) return false;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
    }
    
    // Synthesize raw PCM data into an AudioBuffer using math
    createBuffer(duration, renderFn) {
        if (!this.ctx) return null;
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            data[i] = renderFn(t, i, length);
        }
        return buffer;
    }
    
    preRenderSounds() {
        // 1. Click (UI): Short metallic clink
        this.buffers.click = this.createBuffer(0.05, (t, i, len) => {
            const env = Math.pow(1 - (i / len), 3);
            // Inharmonic mix for metallic sound
            const osc1 = Math.sin(t * 1200 * Math.PI * 2);
            const osc2 = Math.sin(t * 1850 * Math.PI * 2);
            return (osc1 * 0.6 + osc2 * 0.4) * env * 0.2;
        });

        // 2. Whoosh (Menu): Pneumatic hiss
        this.buffers.whoosh = this.createBuffer(0.15, (t, i, len) => {
            const env = Math.pow(1 - (i / len), 2);
            const noise = Math.random() * 2 - 1;
            // High-pass bias by differentiating noise
            return noise * env * 0.15;
        });

        // 3. Ding (Recipe): Anvil strike / high metallic ring
        this.buffers.ding = this.createBuffer(0.3, (t, i, len) => {
            const env = Math.pow(1 - (i / len), 4);
            const base = Math.sin(t * 1500 * Math.PI * 2);
            const clang = Math.sin(t * 2300 * Math.PI * 2) * Math.exp(-t * 20);
            return (base * 0.5 + clang * 0.5) * env * 0.4;
        });

        // 4. Place (Building): Heavy thud
        this.buffers.place = this.createBuffer(0.15, (t, i, len) => {
            const env = Math.pow(1 - (i / len), 2);
            const freq = 120 * Math.exp(-t * 30); // Fast pitch drop
            const thump = Math.sin(t * freq * Math.PI * 2);
            const noise = (Math.random() * 2 - 1) * Math.exp(-t * 50); // Initial crunch
            return (thump * 0.7 + noise * 0.3) * env * 0.5;
        });

        // 5. Error (Invalid): Harsh electric buzzer
        this.buffers.error = this.createBuffer(0.2, (t, i, len) => {
            const env = 1 - (i / len);
            const freq = 60; // AC hum frequency
            const saw = 2 * (t * freq - Math.floor(t * freq + 0.5));
            // Add some "sparks" (high frequency modulation)
            const spark = Math.sin(t * 3000 * Math.PI * 2) * 0.2;
            return (saw + spark) * env * 0.3;
        });

        // 6. Complete (Machine): Steam whistle / machinery chime
        this.buffers.complete = this.createBuffer(0.4, (t, i, len) => {
            // Two tones overlapping, slightly detuned
            const env = Math.sin(t * Math.PI / 0.4); // Smooth envelope
            const f1 = 800;
            const f2 = 815; // Detuned
            const whistle = Math.sin(t * f1 * Math.PI * 2) * 0.5 + Math.sin(t * f2 * Math.PI * 2) * 0.5;
            // Add air hiss
            const hiss = (Math.random() * 2 - 1) * 0.1;
            return (whistle * 0.8 + hiss * 0.2) * env * 0.3;
        });

        // 7. Fanfare (Quest): Factory Siren
        this.buffers.fanfare = this.createBuffer(1.2, (t, i, len) => {
            // Siren pitch ramps up and then slowly oscillates
            const env = t < 0.2 ? t / 0.2 : Math.pow(1 - (t - 0.2) / 1.0, 2);
            const pitchEnv = 1 - Math.exp(-t * 2);
            const freq = 400 + pitchEnv * 200 + Math.sin(t * Math.PI * 4) * 20;
            const saw = 2 * (t * freq - Math.floor(t * freq + 0.5));
            return saw * env * 0.15;
        });

        // 8. Crunch (Destroy): Crumbling concrete/metal
        this.buffers.destroy = this.createBuffer(0.25, (t, i, len) => {
            const env = Math.pow(1 - (i / len), 2);
            // Low rumble + noise
            const rumble = Math.sin(t * 50 * Math.PI * 2);
            const noise = Math.random() * 2 - 1;
            return (rumble * 0.4 + noise * 0.6) * env * 0.5;
        });

        // 9. Hammer Place (Smelter Place): Heavy metallic thud with ringing
        this.buffers.hammer_place = this.createBuffer(0.3, (t, i, len) => {
            const env = Math.pow(1 - (i / len), 3);
            const thud = Math.sin(t * (100 * Math.exp(-t * 40)) * Math.PI * 2);
            const ring = Math.sin(t * 1200 * Math.PI * 2) * Math.exp(-t * 15);
            return (thud * 0.7 + ring * 0.3) * env * 0.6;
        });

        // 10. Hammer Menu (Smelter Menu): Lighter metallic clank
        this.buffers.hammer_menu = this.createBuffer(0.2, (t, i, len) => {
            const env = Math.pow(1 - (i / len), 4);
            const clank = Math.sin(t * 800 * Math.PI * 2);
            const noise = (Math.random() * 2 - 1) * Math.exp(-t * 30);
            return (clank * 0.6 + noise * 0.4) * env * 0.4;
        });

        // 11. Bethune Theme (Menu Open): Ominous industrial jingle
        this.buffers.bethune_theme = this.createBuffer(2.5, (t, i, len) => {
            const env = Math.pow(1 - (i / len), 1.5);
            
            // Bass drone
            const bassFreq = 55; // A1
            const bass = Math.sin(t * bassFreq * Math.PI * 2) * 0.4;
            
            // Industrial beat/rhythm
            const beat = Math.sin(t * 15 * Math.PI * 2) * Math.exp(- (t % 0.25) * 20) * 0.3;
            
            // Melody (diminished/ominous)
            let noteFreq = 0;
            if (t < 0.5) noteFreq = 220; // A3
            else if (t < 1.0) noteFreq = 261.63; // C4
            else if (t < 1.5) noteFreq = 311.13; // Eb4
            else if (t < 2.5) noteFreq = 207.65; // Ab3
            
            const melody = Math.sin(t * noteFreq * Math.PI * 2) * Math.exp(- (t % 0.5) * 5) * 0.3;
            
            return (bass + beat + melody) * env * 0.5;
        });
    }

    play(name) {
        if (!this._ensureCtx()) return;
        const buffer = this.buffers[name];
        if (!buffer) return;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.masterGain);
        source.start();
    }
}
