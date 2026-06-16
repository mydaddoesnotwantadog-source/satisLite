import { GameScene } from './GameScene.js';
import { UI } from './UI.js';
import { GameLogic } from './GameLogic.js';
import { SaveManager } from './SaveManager.js';
import { MobileInputManager } from './MobileInputManager.js';

class GameApp {
    constructor() {
        // Mobile Detection needs to happen before UI setup
        window.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;
        if (window.isMobile) {
            document.body.classList.add('mobile-mode');
        }

        this.logic = new GameLogic();
        this.scene = new GameScene(document.getElementById('game-container'), this.logic, null);
        this.ui = new UI(this, this.logic);
        
        // Pass UI to scene after instantiation
        this.scene.ui = this.ui;
        this.saveManager = new SaveManager(this.logic, this.scene.gridSystem);
        
        if (window.isMobile) {
            this.mobileInputManager = new MobileInputManager(this.scene.cameraController, null, document.getElementById('game-container'));
            this.scene.mobileInputManager = this.mobileInputManager;
        }
        
        // Initial setup for title screen
        this.lastTime = performance.now();
        this.isRunning = false;
        
        this.setupTitleScreen();
        
        // Auto-save every 30 seconds
        setInterval(() => {
            if (this.isRunning && document.getElementById('ui-layer').style.display !== 'none') {
                this.saveManager.saveGame(this.scene.gridSystem.mapSize, this.logic.inventory.confiscatedPhones);
                this.ui.showNotification("Auto-saved!");
            }
        }, 30000);
        
        // Auto-save on page refresh/close
        window.addEventListener('beforeunload', () => {
            if (this.isRunning && document.getElementById('ui-layer').style.display !== 'none') {
                this.saveManager.saveGame(this.scene.gridSystem.mapSize, this.logic.inventory.confiscatedPhones);
            }
        });
        
        // Auto-save when app is backgrounded on mobile
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && this.isRunning && document.getElementById('ui-layer').style.display !== 'none') {
                this.saveManager.saveGame(this.scene.gridSystem.mapSize, this.logic.inventory.confiscatedPhones);
            }
        });
        
        // Manual save button (floppy disk)
        document.getElementById('btn-save-game').addEventListener('click', () => {
            this.saveManager.saveGame(this.scene.gridSystem.mapSize, this.logic.inventory.confiscatedPhones);
            this.ui.showNotification("Game Saved!");
            if (this.scene.soundEngine) this.scene.soundEngine.play('click');
        });
    }

    triggerRocketLaunch() {
        if (this.isLaunchingRockets) return;
        this.isLaunchingRockets = true;
        this.ui.updateDisplay(); // Hide the button immediately
        
        if (this.scene.soundEngine) {
            this.scene.soundEngine.play('rocket_engine');
        }
        
        const consumed = this.logic.consumeQuestResources();
        this.ui.updateDisplay(); // Show updated resource counts
        
        if (this.scene.triggerRocketLaunch) {
            this.scene.triggerRocketLaunch(consumed, () => {
                this.logic.advanceQuest();
                this.isLaunchingRockets = false;
                this.ui.updateDisplay();
            });
        } else {
            // Fallback if not implemented
            this.logic.advanceQuest();
            this.isLaunchingRockets = false;
            this.ui.updateDisplay();
        }
    }
    
    setupTitleScreen() {
        const titleContainer = document.getElementById('title-container');
        const titleSvgOverlay = document.getElementById('title-svg-overlay');
        const titleUiContent = document.getElementById('title-ui-content');
        const mainUi = document.getElementById('ui-layer');
        
        const saveSection = document.getElementById('save-section');
        const newGameSection = document.getElementById('new-game-section');
        const btnContinue = document.getElementById('btn-continue-game');
        const btnDeleteSave = document.getElementById('btn-delete-save');
        const btnStart = document.getElementById('btn-start-game');
        
        // Start continuous loop immediately so background renders
        this.scene.cameraController.setIntroState();
        this.isRunning = true;
        this.lastTime = performance.now();
        this.animate();
        
        // Toggle Save UI
        if (this.saveManager.hasSave()) {
            saveSection.style.display = 'flex';
            newGameSection.style.display = 'none';
            document.getElementById('title-subtitle').innerText = "SAVE FOUND. RESUME MISSION?";
            document.getElementById('mask-text').textContent = "satisLite";
        }
        
        btnDeleteSave.addEventListener('click', () => {
            this.saveManager.deleteSave();
            saveSection.style.display = 'none';
            newGameSection.style.display = 'block';
            document.getElementById('title-subtitle').innerText = "A BIG THUNE ADVENTURE";
            document.getElementById('mask-text').textContent = "SATISLITE";
        });
        
        const difficultyMap = {
            'easy': 500,
            'medium': 250,
            'hard': 100
        };
        
        let selectedMapSize = 50;
        let selectedDifficulty = 'easy';
        
        const mapButtons = document.querySelectorAll('.map-btn');
        mapButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                mapButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                selectedMapSize = parseInt(e.target.getAttribute('data-size'));
            });
        });
        
        const diffButtons = document.querySelectorAll('.diff-btn');
        diffButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                diffButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                selectedDifficulty = e.target.getAttribute('data-diff');
            });
        });
        
        const doZoomTransition = (onComplete = null) => {
            if (this.scene.soundEngine) this.scene.soundEngine.play('click');
            
            titleUiContent.classList.add('fade-out');
            
            // Fade out the dark background immediately so the world is visible
            const titleBgRect = document.getElementById('title-bg-rect');
            if (titleBgRect) titleBgRect.style.opacity = '0';
            
            // Scale and fade the solid text logo
            titleSvgOverlay.classList.add('zoom-through');
            
            // Tell the camera to start its sweeping drop animation
            this.scene.cameraController.startIntroAnimation(4000);
            
            // Wait for animation to finish then reveal UI and hide masks
            setTimeout(() => {
                titleContainer.style.display = 'none';
                if (onComplete) {
                    onComplete();
                } else {
                    mainUi.style.display = 'block';
                }
            }, 4500);
        };

        btnStart.addEventListener('click', () => {
            // Initialize game scene with selected map size
            this.scene.initGameScene(selectedMapSize);
            
            // Set starting phones
            this.logic.inventory.confiscatedPhones = difficultyMap[selectedDifficulty];
            this.ui.updateDisplay(); // initial render
            
            doZoomTransition();
        });
        
        btnContinue.addEventListener('click', () => {
            const data = JSON.parse(localStorage.getItem('satislite_save'));
            if (data) {
                this.scene.initGameScene(data.mapSize || 50);
                this.ui.updateDisplay();
                doZoomTransition(() => {
                    this.saveManager.loadGame(this.scene.placementSystem, () => {
                        mainUi.style.display = 'block';
                    });
                });
            }
        });
    }

    animate() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.animate());
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.logic.update(deltaTime);
        this.scene.update(deltaTime);
        this.ui.update(deltaTime);
    }
}

function bootApp() {
    console.log("Booting GameApp...");
    window.app = new GameApp();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}
