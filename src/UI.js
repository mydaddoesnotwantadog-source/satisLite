import { ALL_ITEM_KEYS } from './Config.js';

export class UI {
    constructor(app, logic) {
        this.app = app;
        this.logic = logic;
        
        this.activeTool = 'select';
        
        // Rate tracking: sample inventory every second to compute derivatives
        this._rateResources = ALL_ITEM_KEYS;
        this._rateKeys = {};
        for (const r of this._rateResources) {
            this._rateKeys[r] = r === 'phones' ? 'confiscatedPhones' : r;
        }
        this._prevSnapshot = {};
        this._rates = {};
        for (const r of this._rateResources) {
            this._prevSnapshot[r] = 0;
            this._rates[r] = 0;
        }
        this._rateTimer = 0;
        this._rateSampleInterval = 1.0; // seconds

        // Cache DOM elements
        this._resourceEls = {};
        for (const res of this._rateResources) {
            this._resourceEls[res] = document.getElementById(`res-${res}`);
        }
        this.elPhonesInv = document.getElementById('res-phones-inv');
        this.elGoalSubtitle = document.getElementById('goal-subtitle');
        this.elGoalReqDiv = document.getElementById('goal-requirements');
        this.elLaunchBtn = document.getElementById('btn-launch-rocket');
        this.elMobileGoalSubtitle = document.getElementById('mobile-goal-subtitle');
        this.elMobileGoalStatus = document.getElementById('mobile-goal-status');
        this.elMobileLaunchBtn = document.getElementById('btn-launch-rocket-mobile');
        this.elBottomToolbar = document.getElementById('bottom-toolbar');
        this.elRecipeProgressBar = document.getElementById('recipe-progress-bar');
        this.elRecipeBufferStatus = document.getElementById('recipe-buffer-status');
        this.elLeighPopup = document.getElementById('leigh-high-popup');
        this.elBurnProgressBar = document.getElementById('burn-progress-bar');
        this.elBurnStatusText = document.getElementById('burn-status-text');
        
        this._lastUnlockedCount = 0;
        this._lastGoalQuest = null;
        this._goalBars = null;
        this._uiTimer = 0;
        
        this.bindEvents();
        this.populateMachineSubmenu();
        this._setupRateTooltips();
        this.updateDisplay();
        
        this.logic.onBurnComplete = (buildingUuid, phonesEarned) => {
            if (this.app.soundEngine) {
                this.app.soundEngine.play('fanfare');
            }
            
            // Only refresh UI if we are currently looking at the school that finished
            if (this.selectedBuilding && this.selectedBuilding.uuid === buildingUuid && document.getElementById('leigh-high-popup').style.display === 'block') {
                this.openLeighHighUI(this.selectedBuilding);
            }
            this.updateDisplay();
            const bld = this.logic.buildings.find(b => b.uuid === buildingUuid);
            if (bld) {
                const currentTotal = bld.uncollectedPhones || 0;
                const previousTotal = currentTotal - phonesEarned;
                
                if (previousTotal === 0 && currentTotal > 0) {
                    this.showNotification("Phones are waiting in the hotel!", '#ffd700');
                } else if (previousTotal < 12 && currentTotal >= 12) {
                    this.showNotification("Mr. Bethune has been so generous, but you're keeping him waiting!", '#ffd700');
                }
            }
        };
    }
    
    showNotification(text, color = '#2ecc71') {
        const toast = document.createElement('div');
        toast.className = 'glass-panel';
        toast.style.position = 'absolute';
        toast.style.left = '50%';
        toast.style.top = '-100px'; // Start off-screen
        toast.style.transform = 'translateX(-50%)';
        toast.style.zIndex = '2500';
        toast.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'; // Springy effect
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '15px';
        toast.style.padding = '15px 30px';
        toast.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        toast.style.borderTop = `2px solid ${color}`;
        toast.style.boxShadow = `0 10px 30px rgba(0,0,0,0.8), inset 0 10px 20px rgba(0,0,0,0.5), 0 0 15px ${color}40`;
        toast.style.pointerEvents = 'none';

        if (text.toLowerCase().includes('sav') && (window.isMobile || document.body.classList.contains('mobile-mode'))) {
            toast.className = 'save-toast';
            toast.style.background = 'rgba(255, 255, 255, 0.12)';
            toast.style.backdropFilter = 'url(#apple-liquid-glass) blur(16px) saturate(180%)';
            toast.style.webkitBackdropFilter = 'blur(18px) saturate(180%)';
            toast.style.borderRadius = '999px';
            toast.style.border = '1px solid rgba(255, 255, 255, 0.28)';
            toast.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.58), inset 0 -1px 1px rgba(255, 255, 255, 0.16)';
            toast.style.color = '#ffffff';
            toast.style.padding = '10px 22px';
            toast.style.gap = '12px';
            
            toast.innerHTML = `
                <div style="position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">
                    <svg width="22" height="22" viewBox="0 0 24 24" style="position: absolute; top: 0; left: 0; transform: rotate(-90deg); overflow: visible; filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.65));">
                        <circle cx="12" cy="12" r="9.5" fill="none" stroke="rgba(255, 255, 255, 0.24)" stroke-width="2.5" />
                        <circle cx="12" cy="12" r="9.5" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="60" stroke-dashoffset="60" style="transform-origin: center; animation: drawRing 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s forwards, ringPop 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) 2.2s forwards;" />
                    </svg>
                </div>
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 0.9rem; font-weight: 600; letter-spacing: -0.01em; color: #ffffff; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.52), 0 0 10px rgba(0, 0, 0, 0.22);">
                    ${text}
                </div>
                <style>
                    @keyframes drawRing {
                        to { stroke-dashoffset: 0; }
                    }
                    @keyframes ringPop {
                        0% { transform: scale(1); opacity: 1; stroke-width: 2.5; }
                        100% { transform: scale(1.45); opacity: 0; stroke-width: 0; }
                    }
                </style>
            `;
        } else {
            let icon = 'ℹ️';
            if (text.toLowerCase().includes('phone')) icon = '📱';
            toast.innerHTML = `
                <div style="font-size: 2em; filter: drop-shadow(0 0 5px ${color});">${icon}</div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-family: var(--font-display, Orbitron, sans-serif); color: ${color}; font-size: 1.1em; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">Notification</span>
                    <span style="font-size: 0.95em; color: #fff; font-family: var(--font-main, Rajdhani, sans-serif);">${text}</span>
                </div>
            `;
        }
        
        document.getElementById('ui-layer').appendChild(toast);
        
        // Trigger reflow
        void toast.offsetWidth;
        
        // Slide in
        toast.style.top = '30px';
        
        // Slide out after 3 seconds
        setTimeout(() => {
            toast.style.top = '-100px';
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 500);
        }, 3000);
    }


    populateMachineSubmenu() {
        const submenu = document.getElementById('machine-submenu');
        if (!submenu) return;
        submenu.innerHTML = '';
        
        const machines = this.logic.otherBuildings.filter(b => b.id !== 'school');
        
        machines.forEach(mac => {
            const btn = document.createElement('button');
            btn.className = 'tool-btn';
            btn.setAttribute('data-tool', mac.id);
            
            if (!mac.unlocked) {
                btn.classList.add('locked');
                btn.disabled = true;
                btn.textContent = '🔒 ' + mac.name;
            } else {
                btn.textContent = mac.name;
            }
            
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                if (this.app.soundEngine) this.app.soundEngine.play('click');
                
                this.clearAllToolSelections();
                btn.classList.add('active');
                
                const machineBtn = document.getElementById('btn-machine-category');
                if (machineBtn) machineBtn.classList.add('active');
                
                this.activeTool = mac.id;
                
                // On mobile, don't close the submenu when selecting a tool
                if (!window.isMobile) {
                    document.querySelectorAll('.submenu-horizontal').forEach(s => s.classList.remove('show'));
                    if (machineBtn) machineBtn.classList.remove('active');
                }
                
                this.closeRecipeUI();
                this.closeLeighHighUI();
            });

            btn.addEventListener('mouseenter', () => {
                const tooltip = document.getElementById('machine-tooltip');
                if (!tooltip) return;
                document.getElementById('mt-name').textContent = mac.name;
                document.getElementById('mt-desc').textContent = mac.desc || '';
                document.getElementById('mt-size').textContent = mac.size || '1×1';
                document.getElementById('mt-cost').textContent = mac.cost;
                
                tooltip.style.display = 'block';
                tooltip.style.bottom = 'auto';
                
                const rect = btn.getBoundingClientRect();
                tooltip.style.left = `${rect.left}px`;
                tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10}px`;
            });

            btn.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById('machine-tooltip');
                if (tooltip) tooltip.style.display = 'none';
            });

            submenu.appendChild(btn);
        });
    }

    bindEvents() {
        this.bindToolButtons();
        
        document.getElementById('ui-layer').addEventListener('contextmenu', e => e.preventDefault());
        
        const launchBtn = document.getElementById('btn-launch-rocket');
        if (launchBtn) {
            launchBtn.addEventListener('click', () => {
                if (this.app.soundEngine) this.app.soundEngine.play('click');
                launchBtn.style.display = 'none';
                if (this.elMobileLaunchBtn) this.elMobileLaunchBtn.style.display = 'none';
                if (this.app.triggerRocketLaunch) {
                    this.app.triggerRocketLaunch();
                }
            });
        }

        const mobileLaunchBtn = document.getElementById('btn-launch-rocket-mobile');
        if (mobileLaunchBtn) {
            mobileLaunchBtn.addEventListener('click', () => {
                if (this.app.soundEngine) this.app.soundEngine.play('click');
                mobileLaunchBtn.style.display = 'none';
                if (launchBtn) launchBtn.style.display = 'none';
                if (this._toggleMobileMenu) this._toggleMobileMenu(false);
                if (this.app.triggerRocketLaunch) {
                    this.app.triggerRocketLaunch();
                }
            });
        }
        
        const btnOpenMenu = document.getElementById('btn-open-menu');
        const content = document.getElementById('inventory-content');
        const panel = document.getElementById('inventory-panel');
        const techToggle = document.getElementById('tech-tree-toggle');
        const techPage = document.getElementById('tech-tree-page');
        const backdrop = document.getElementById('mobile-backdrop');
        const collapseBtn = document.getElementById('inventory-collapse-btn');
        const invHeader = document.getElementById('inventory-header');

        // Setup desktop inventory collapse logic
        const setCollapsedState = (collapsed) => {
            if (!panel) return;
            const collapseIcon = collapseBtn ? collapseBtn.querySelector('.collapse-icon') : null;
            if (collapsed) {
                panel.classList.add('collapsed');
                if (collapseIcon) collapseIcon.textContent = '▶';
                if (collapseBtn) collapseBtn.title = 'Expand panel (show item names)';
            } else {
                panel.classList.remove('collapsed');
                if (collapseIcon) collapseIcon.textContent = '◀';
                if (collapseBtn) collapseBtn.title = 'Collapse panel (hide item names)';
            }
        };

        const toggleCollapse = () => {
            if (!panel) return;
            const nextState = !panel.classList.contains('collapsed');
            setCollapsedState(nextState);
            localStorage.setItem('satislite_inventory_collapsed', nextState ? 'true' : 'false');
            if (this.app.soundEngine) this.app.soundEngine.play('click');
        };

        if (collapseBtn) {
            collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCollapse();
            });
        }

        if (invHeader) {
            invHeader.addEventListener('click', (e) => {
                if (e.target.closest('#inventory-collapse-btn')) return;
                if (panel && panel.classList.contains('collapsed')) {
                    toggleCollapse();
                }
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key.toLowerCase() === 'i') {
                if (!window.isMobile) {
                    toggleCollapse();
                }
            }
        });

        // Initialize desktop collapse state
        if (!window.isMobile && panel) {
            panel.style.display = '';
            panel.style.opacity = '';
            panel.style.transform = '';
            const savedState = localStorage.getItem('satislite_inventory_collapsed');
            const shouldCollapse = (savedState === null) ? true : (savedState === 'true');
            setCollapsedState(shouldCollapse);
        }

        if (btnOpenMenu) {
            const toggleMenuState = (open) => {
                const bottomToolbar = document.getElementById('bottom-toolbar');
                clearTimeout(this._menuCloseTimer);
                if (!open) {
                    const isTechActive = techPage && techPage.classList.contains('active');
                    
                    document.body.classList.remove('mobile-menu-open');
                    if (bottomToolbar) {
                        bottomToolbar._morphLastTime = performance.now();
                        bottomToolbar.classList.remove('dock-compressed');
                    }
                    
                    panel.style.transition = 'transform 0.22s cubic-bezier(0.32, 0, 0.67, 0), opacity 0.2s ease-out';
                    panel.style.transformOrigin = '50% 92%';
                    panel.style.transform = 'translate3d(0, 24px, 0) scale(0.96)';
                    panel.style.opacity = '0';
                    
                    if (isTechActive) {
                        techPage.style.transition = 'transform 0.22s cubic-bezier(0.32, 0, 0.67, 0), opacity 0.2s ease-out';
                        techPage.style.transformOrigin = '50% 92%';
                        techPage.style.transform = 'translate3d(0, 24px, 0) scale(0.96)';
                        techPage.style.opacity = '0';
                    } else {
                        if (techPage) techPage.classList.remove('active');
                    }
                    
                    panel.classList.remove('swiped-left');
                    if (techToggle && window.isMobile) {
                        techToggle.classList.remove('open');
                        techToggle.style.display = 'none';
                    }
                    if (backdrop) backdrop.classList.remove('active');
                    
                    this._menuCloseTimer = setTimeout(() => {
                        panel.style.display = 'none';
                        content.style.display = 'none';
                        panel.style.transition = '';
                        panel.style.transform = '';
                        panel.style.opacity = '';
                        if (isTechActive) {
                            techPage.classList.remove('active');
                            techPage.style.transition = '';
                            techPage.style.transform = '';
                            techPage.style.opacity = '';
                        }
                    }, 230);
                } else {
                    const machineSubmenu = document.getElementById('machine-submenu');
                    if (machineSubmenu) machineSubmenu.classList.remove('show');

                    document.body.classList.add('mobile-menu-open');
                    if (bottomToolbar) {
                        bottomToolbar._morphLastTime = performance.now();
                        bottomToolbar.classList.add('dock-compressed');
                    }

                    panel.style.display = 'block';
                    content.style.display = 'contents';
                    panel.style.transformOrigin = '50% 92%';
                    panel.style.transition = 'none';
                    panel.style.transform = 'translate3d(0, 26px, 0) scale(0.96)';
                    panel.style.opacity = '0';
                    
                    if (techToggle && window.isMobile) techToggle.style.display = '';
                    if (backdrop) backdrop.classList.add('active');
                    
                    requestAnimationFrame(() => {
                        panel.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease-out';
                        panel.style.transform = 'translate3d(0, 0, 0) scale(1)';
                        panel.style.opacity = '1';
                    });
                    
                    this._menuCloseTimer = setTimeout(() => {
                        panel.style.transition = '';
                    }, 300);
                }
            };
            this._toggleMobileMenu = toggleMenuState;

            btnOpenMenu.addEventListener('click', () => {
                if (this.app.soundEngine) this.app.soundEngine.play('whoosh');
                const isOpen = panel.style.display !== 'none' && panel.style.opacity !== '0';
                toggleMenuState(!isOpen);
            });

            if (techToggle && techPage) {
                techToggle.addEventListener('click', () => {
                    if (this.app.soundEngine) this.app.soundEngine.play('whoosh');
                    const isActive = techPage.classList.toggle('active');
                    techToggle.classList.toggle('active', isActive);
                    techToggle.classList.toggle('open', isActive);
                });
            }

            // Mobile swipe logic (Native 1:1 tracking)
            let touchStartX = 0;
            let touchStartY = 0;
            let isSwiping = false;
            let swipeDirection = null; // 'horizontal' or 'vertical'

            const onTouchStart = (e) => {
                if (content.style.display === 'none') return;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isSwiping = true;
                swipeDirection = null;
                
                panel.style.transition = 'none';
                if (techPage) techPage.style.transition = 'none';
                if (backdrop) backdrop.style.transition = 'none';
            };

            const onTouchMove = (e) => {
                if (!isSwiping || content.style.display === 'none') return;
                let touchCurX = e.touches[0].clientX;
                let touchCurY = e.touches[0].clientY;
                let dx = touchCurX - touchStartX;
                let dy = touchCurY - touchStartY;
                
                if (!swipeDirection) {
                    if (Math.abs(dx) > Math.abs(dy)) swipeDirection = 'horizontal';
                    else if (dy > 0) swipeDirection = 'vertical'; // Only allow swiping DOWN
                    else return;
                }
                
                if (swipeDirection === 'horizontal') {
                    if (e.cancelable) e.preventDefault();
                    const isTechActive = techPage && techPage.classList.contains('active');
                    
                    if (!isTechActive && dx < 0) {
                        panel.style.transform = `translateX(${dx}px)`;
                        if (techPage) techPage.style.transform = `translateX(calc(100vw + ${dx}px))`;
                    } else if (isTechActive && dx > 0) {
                        panel.style.transform = `translateX(calc(-100vw + ${dx}px))`;
                        if (techPage) techPage.style.transform = `translateX(${dx}px)`;
                    }
                } else if (swipeDirection === 'vertical' && dy > 0) {
                    if (e.cancelable) e.preventDefault();
                    const activePanel = (techPage && techPage.classList.contains('active')) ? techPage : panel;
                    
                    // Track downwards and scale down towards the menu button area
                    const scale = Math.max(0.75, 1 - (dy / 800));
                    activePanel.style.transformOrigin = 'bottom left';
                    activePanel.style.transform = `translateY(${dy}px) scale(${scale})`;
                    
                    // Fade out backdrop dynamically
                    const fade = Math.max(0, 1 - (dy / 300));
                    if (backdrop) backdrop.style.opacity = fade.toString();
                }
            };

            const onTouchEnd = (e) => {
                if (!isSwiping || content.style.display === 'none') return;
                isSwiping = false;
                
                let touchEndX = e.changedTouches[0].clientX;
                let touchEndY = e.changedTouches[0].clientY;
                let dx = touchEndX - touchStartX;
                let dy = touchEndY - touchStartY;
                
                panel.style.transition = '';
                if (techPage) techPage.style.transition = '';
                if (backdrop) backdrop.style.transition = '';
                
                panel.style.transformOrigin = '';
                panel.style.transform = '';
                if (techPage) techPage.style.transformOrigin = '';
                if (techPage) techPage.style.transform = '';
                if (backdrop) backdrop.style.opacity = '';

                const isTechActive = techPage && techPage.classList.contains('active');

                if (swipeDirection === 'horizontal') {
                    if (!isTechActive) {
                        if (dx < -60) {
                            if (this.app.soundEngine) this.app.soundEngine.play('whoosh');
                            if (techPage) techPage.classList.add('active');
                            panel.classList.add('swiped-left');
                            if (techToggle) techToggle.classList.add('open');
                        }
                    } else {
                        if (dx > 60) {
                            if (this.app.soundEngine) this.app.soundEngine.play('whoosh');
                            if (techPage) techPage.classList.remove('active');
                            panel.classList.remove('swiped-left');
                            if (techToggle) techToggle.classList.remove('open');
                        }
                    }
                } else if (swipeDirection === 'vertical') {
                    if (dy > 100) {
                        // Close completely
                        if (this.app.soundEngine) this.app.soundEngine.play('whoosh');
                        toggleMenuState(false);
                    }
                }
            };

            panel.addEventListener('touchstart', onTouchStart, {passive: true});
            panel.addEventListener('touchmove', onTouchMove, {passive: false});
            panel.addEventListener('touchend', onTouchEnd, {passive: true});
            panel.addEventListener('touchcancel', onTouchEnd, {passive: true});

            if (techPage) {
                techPage.addEventListener('touchstart', onTouchStart, {passive: true});
                techPage.addEventListener('touchmove', onTouchMove, {passive: false});
                techPage.addEventListener('touchend', onTouchEnd, {passive: true});
                techPage.addEventListener('touchcancel', onTouchEnd, {passive: true});
            }
        }
        const machineBtn = document.getElementById('btn-machine-category');
        const machineSubmenu = document.getElementById('machine-submenu');
        
        machineBtn.addEventListener('click', () => {
            if (this.app.soundEngine) this.app.soundEngine.play('whoosh');
            machineSubmenu.classList.toggle('show');
            
            if (window.isMobile) {
                const isMenuOpen = machineSubmenu.classList.contains('show');
                if (this.app.scene && this.app.scene.gridSystem) {
                    this.app.scene.gridSystem.instancedLeaves.visible = !isMenuOpen;
                }
            }
            
            // Turn off build mode and depress all other buttons (including Select, Delete, and Leigh)
            this.clearAllToolSelections();
            this.activeTool = 'select';
            
            if (machineSubmenu.classList.contains('show')) {
                machineBtn.classList.add('active');
            } else {
                const selBtn = document.querySelector('.switch-btn[data-tool="select"], .tool-btn[data-tool="select"]');
                if (selBtn) {
                    selBtn.classList.add('active');
                    const thumb = document.querySelector('.switch-thumb');
                    if (thumb) {
                        thumb.classList.remove('pos-right');
                        thumb.classList.remove('hidden-thumb');
                    }
                }
            }
        });

        document.getElementById('close-recipe-btn').addEventListener('click', () => {
            if (this.app.soundEngine) this.app.soundEngine.play('click');
            this.closeRecipeUI();
        });
        
        document.getElementById('close-leigh-btn').addEventListener('click', () => {
            if (this.app.soundEngine) this.app.soundEngine.play('click');
            this.closeLeighHighUI();
        });
        
        this.makeDraggable(document.getElementById('recipe-popup'));
        this.makeDraggable(document.getElementById('leigh-high-popup'));
        
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'b') {
                if (this.activeTool === 'delete') {
                    const selBtn = document.querySelector('.switch-btn[data-tool="select"], .tool-btn[data-tool="select"]');
                    if (selBtn) selBtn.click();
                } else {
                    const delBtn = document.getElementById('btn-delete-tool');
                    if (delBtn) delBtn.click();
                }
            }
        });
    }
    
    makeDraggable(el) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = el.querySelector('h2') || el;
        
        header.onmousedown = (e) => {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = () => {
                document.onmouseup = null;
                document.onmousemove = null;
            };
            document.onmousemove = (e) => {
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                el.style.top = (el.offsetTop - pos2) + "px";
                el.style.left = (el.offsetLeft - pos1) + "px";
            };
        };
    }
    
    clearAllToolSelections() {
        document.querySelectorAll('#bottom-toolbar .tool-btn, #bottom-toolbar .switch-btn, #machine-submenu .tool-btn').forEach(b => {
            b.classList.remove('active');
        });
        const thumb = document.querySelector('.switch-thumb');
        if (thumb) thumb.classList.add('hidden-thumb');
    }

    bindToolButtons() {
        const toolBtns = document.querySelectorAll('#bottom-toolbar .tool-btn:not(#btn-machine-category):not(#btn-save-game), #bottom-toolbar .switch-btn');
        toolBtns.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                if (newBtn.disabled) return;
                if (this.app.soundEngine) this.app.soundEngine.play('click');
                
                this.clearAllToolSelections();
                newBtn.classList.add('active');

                // Flip Flop Switch UI update
                const thumb = document.querySelector('.switch-thumb');
                if (newBtn.classList.contains('switch-btn')) {
                    if (thumb) {
                        thumb.classList.remove('hidden-thumb');
                        if (newBtn.getAttribute('data-tool') === 'delete') {
                            thumb.classList.add('pos-right');
                        } else {
                            thumb.classList.remove('pos-right');
                        }
                    }
                }
                
                this.activeTool = newBtn.getAttribute('data-tool');
                
                document.querySelectorAll('.submenu-horizontal').forEach(s => s.classList.remove('show'));
                if (window.isMobile && this.app.scene && this.app.scene.gridSystem && this.app.scene.gridSystem.instancedLeaves) {
                    this.app.scene.gridSystem.instancedLeaves.visible = true;
                }
                
                this.closeRecipeUI();
                this.closeLeighHighUI();
            });
        });

        // Touch sliding support for flip-flop switch (bound once)
        if (!this._flipFlopBound) {
            this._flipFlopBound = true;
            const flipFlopContainer = document.querySelector('.flip-flop-switch');
            if (flipFlopContainer) {
                let startX = 0;
                let isDraggingSwitch = false;
                
                flipFlopContainer.addEventListener('touchstart', (e) => {
                    startX = e.touches[0].clientX;
                    isDraggingSwitch = true;
                });
                
                flipFlopContainer.addEventListener('touchmove', (e) => {
                    if (!isDraggingSwitch) return;
                    e.preventDefault(); // Prevent scrolling
                }, { passive: false });
                
                flipFlopContainer.addEventListener('touchend', (e) => {
                    if (!isDraggingSwitch) return;
                    isDraggingSwitch = false;
                    const endX = e.changedTouches[0].clientX;
                    const dx = endX - startX;
                    
                    if (Math.abs(dx) > 20) { // Require at least 20px drag
                        const targetTool = dx > 0 ? 'delete' : 'select';
                        
                        const targetBtn = flipFlopContainer.querySelector(`[data-tool="${targetTool}"]`);
                        if (targetBtn && !targetBtn.classList.contains('active')) {
                            targetBtn.click();
                        }
                    }
                });
            }
        }
    }

    openRecipeUI(building) {
        this.selectedBuilding = building;
        
        if (building.type === 'smelter') {
            if (this.app.soundEngine) this.app.soundEngine.play('hammer_menu');
        } else {
            if (this.app.soundEngine) this.app.soundEngine.play('click');
        }
        
        const popup = document.getElementById('recipe-popup');
        const title = document.getElementById('recipe-machine-title');
        const list = document.getElementById('recipe-list');
        const info = document.getElementById('recipe-info');
        
        popup.style.display = 'block';
        list.innerHTML = '';
        this.injectPowerSwitch(list, building);
        
        if (building.isExtractor) {
            title.textContent = building.type.charAt(0).toUpperCase() + building.type.slice(1) + ' Extractor';
            info.innerHTML = `Extracts: <strong>${building.type}</strong><br>Rate: <strong>${building.rate.toFixed(2)}</strong>/s`;
            document.getElementById('recipe-buffer-status').innerHTML = '';
            document.getElementById('recipe-progress-bar').style.width = '0%';
            return;
        }

        title.textContent = this.logic.otherBuildings.find(b => b.id === building.type).name;
        const updateInfoText = (recipeKey) => {
            if (!recipeKey) {
                info.innerHTML = '';
                return;
            }
            const recipeData = this.logic.recipes[recipeKey];
            let costText = Object.entries(recipeData.inputs).map(([k,v]) => `${v} ${k}`).join(', ');
            let yieldText = Object.entries(recipeData.outputs).map(([k,v]) => `${v} ${k}`).join(', ');
            info.innerHTML = `<strong>Cost:</strong> ${costText}<br><strong>Yields:</strong> ${yieldText}<br><strong>Time:</strong> ${recipeData.time}s`;
        };
        
        updateInfoText(building.activeRecipe);
        
        if (building.type === 'storage') {
            title.textContent = 'Storage Configuration';
            if (building.inventoryCount > 0) {
                info.innerHTML = 'Box type is fixed while it contains items. Empty it to change the assigned item type.';
            } else {
                info.innerHTML = 'Select an assigned item type for this storage box. Items will not flow in until a type is assigned.';
            }
            
            const clearBtn = document.createElement('button');
            clearBtn.className = 'tool-btn';
            clearBtn.style.display = 'block';
            clearBtn.style.width = '100%';
            clearBtn.style.marginBottom = '5px';
            clearBtn.textContent = 'Unassigned';
            if (!building.storageFilter) clearBtn.classList.add('active');
            if (building.inventoryCount > 0) clearBtn.disabled = true;
            clearBtn.addEventListener('click', () => {
                if (this.app.soundEngine) this.app.soundEngine.play('ding');
                building.storageFilter = null;
                this.openRecipeUI(building);
            });
            list.appendChild(clearBtn);

            const allItems = ['iron', 'copper', 'coal', 'gold', 'water', 'poop', 'ironIngot', 'copperIngot', 'ironRod', 'ironPlate', 'copperWire', 'frame', 'panel'];
            for (const item of allItems) {
                const btn = document.createElement('button');
                btn.className = 'tool-btn';
                btn.style.display = 'block';
                btn.style.width = '100%';
                btn.style.marginBottom = '5px';
                let name = item.replace(/([A-Z])/g, ' $1');
                name = name.charAt(0).toUpperCase() + name.slice(1);
                btn.textContent = name;
                
                if (building.storageFilter === item) {
                    btn.classList.add('active');
                }
                
                if (building.inventoryCount > 0 && building.storageFilter !== item) btn.disabled = true;
                
                btn.addEventListener('click', () => {
                    if (this.app.soundEngine) this.app.soundEngine.play('ding');
                    building.storageFilter = item;
                    this.openRecipeUI(building);
                });
                list.appendChild(btn);
            }
            return;
        }
        
        // Find recipes that this machine can process
        for (const [recipeKey, recipeData] of Object.entries(this.logic.recipes)) {
            if (recipeData.machine === building.type) {
                const btn = document.createElement('button');
                btn.className = 'tool-btn';
                btn.style.display = 'block';
                btn.style.width = '100%';
                btn.style.marginBottom = '5px';
                btn.textContent = recipeData.name;
                
                if (building.activeRecipe === recipeKey) {
                    btn.classList.add('active');
                }
                
                btn.addEventListener('mouseenter', () => {
                    updateInfoText(recipeKey);
                });
                
                btn.addEventListener('mouseleave', () => {
                    updateInfoText(building.activeRecipe);
                });
                
                btn.addEventListener('click', () => {
                    if (building.activeRecipe === recipeKey) return;
                    
                    let hasResources = false;
                    for (const v of Object.values(building.inputBuffer || {})) if (v > 0) hasResources = true;
                    for (const v of Object.values(building.outputBuffer || {})) if (v > 0) hasResources = true;

                    if (hasResources) {
                        const confirmSwitch = window.confirm("Switching recipes will destroy the resources currently in this building's input and output buffers. Are you sure?");
                        if (!confirmSwitch) return;
                    }

                    if (this.app.soundEngine) this.app.soundEngine.play('ding');
                    building.activeRecipe = recipeKey;
                    building.progress = 0;
                    building.isWorking = false;
                    building.inputBuffer = {};
                    building.outputBuffer = {};
                    this.openRecipeUI(building); // refresh active state
                });
                
                list.appendChild(btn);
            }
        }
    }

    closeRecipeUI() {
        this.selectedBuilding = null;
        document.getElementById('recipe-popup').style.display = 'none';
    }

    injectPowerSwitch(container, building) {
        const switchHtml = `
            <div class="power-switch-container">
                <div class="power-switch-label">
                    <div class="power-status-light ${building.isEnabled !== false ? 'on' : ''}"></div>
                    POWER
                </div>
                <div class="power-switch ${building.isEnabled !== false ? 'on' : ''}">
                    <div class="power-lever"></div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', switchHtml);
        
        const switchContainer = container.lastElementChild;
        const switchEl = switchContainer.querySelector('.power-switch');
        const lightEl = switchContainer.querySelector('.power-status-light');
        
        switchEl.addEventListener('click', () => {
            building.isEnabled = building.isEnabled === false ? true : false;
            
            if (building.isEnabled) {
                switchEl.classList.add('on');
                lightEl.classList.add('on');
                if (this.app.soundEngine) this.app.soundEngine.play('wind_up');
                if (building.mesh && building.mesh.userData.powerLightMat) {
                    building.mesh.userData.powerLightMat.color.setHex(0x00ff00);
                    building.mesh.userData.powerLightMat.emissive.setHex(0x00ff00);
                }
            } else {
                switchEl.classList.remove('on');
                lightEl.classList.remove('on');
                if (this.app.soundEngine) this.app.soundEngine.play('breaker_trip');
                if (building.mesh && building.mesh.userData.powerLightMat) {
                    building.mesh.userData.powerLightMat.color.setHex(0xff0000);
                    building.mesh.userData.powerLightMat.emissive.setHex(0xff0000);
                }
            }
        });
    }
    
    openLeighHighUI(building) {
        if (this.app.soundEngine && (!this.selectedBuilding || this.selectedBuilding.uuid !== building.uuid)) {
            this.app.soundEngine.play('bethune_theme');
        }
        
        this.selectedBuilding = building;
        const popup = document.getElementById('leigh-high-popup');
        const list = document.getElementById('leigh-items-list');
        popup.style.display = 'block';
        list.innerHTML = '';
        this.injectPowerSwitch(list, building);
        
        // Setup Custom Dropdown and Input container
        const isQueueFull = this.selectedBuilding.burnQueue && this.selectedBuilding.burnQueue.length >= 10;
        
        const inputContainer = document.createElement('div');
        inputContainer.style.background = '#222';
        inputContainer.style.border = '1px solid #444';
        inputContainer.style.padding = '10px';
        inputContainer.style.marginBottom = '15px';
        inputContainer.style.borderRadius = '3px';
        
        let dropdownHtml = '<div id="leigh-custom-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 250px; overflow-y: auto; background: #1a1a1a; border: 1px solid #555; border-top: none; z-index: 1001; border-radius: 0 0 3px 3px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);">';
        const itemsList = [];
        for (const [key, rate] of Object.entries(this.logic.phoneExchangeRates)) {
            let name = key.replace(/([A-Z])/g, ' $1');
            name = name.charAt(0).toUpperCase() + name.slice(1);
            itemsList.push({ key, name });
            dropdownHtml += `<div class="leigh-dropdown-item" data-key="${key}" data-name="${name}" style="padding: 6px 10px; cursor: pointer; color: #eee; border-bottom: 1px solid #333;">${name}</div>`;
        }
        dropdownHtml += '</div>';
        
        inputContainer.innerHTML = `
            <div style="margin-bottom: 8px; position: relative;">
                <label style="font-size: 0.9em; color: #ccc;">Select Item to Burn:</label><br>
                <input type="text" id="leigh-item-input" autocomplete="off" placeholder="Type or select..." style="width: 100%; padding: 5px; background: #111; color: #fff; border: 1px solid #555; border-radius: 3px; font-size: 1em;">
                ${dropdownHtml}
            </div>
            <div id="leigh-item-info" style="font-size: 0.85em; color: #aaa; margin-bottom: 8px; min-height: 20px;"></div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <label style="font-size: 0.9em; color: #ccc;">Amount:</label>
                    <input type="number" id="leigh-burn-amount" value="1" min="1" style="width: 60px; padding: 4px; background: #111; color: #fff; border: 1px solid #555; border-radius: 3px;">
                </div>
                <button id="leigh-burn-btn" class="tool-btn" style="flex-grow: 1; min-width: 120px; padding: 6px;">Add to Queue</button>
            </div>
        `;
        list.appendChild(inputContainer);
        
        const inputField = inputContainer.querySelector('#leigh-item-input');
        const infoDiv = inputContainer.querySelector('#leigh-item-info');
        const amountField = inputContainer.querySelector('#leigh-burn-amount');
        const burnBtn = inputContainer.querySelector('#leigh-burn-btn');
        const dropdown = inputContainer.querySelector('#leigh-custom-dropdown');
        const dropdownItems = inputContainer.querySelectorAll('.leigh-dropdown-item');
        
        burnBtn.disabled = true; // disabled until valid item selected
        if (isQueueFull) burnBtn.disabled = true;
        
        // Custom Dropdown Interactions
        dropdownItems.forEach(item => {
            item.addEventListener('mouseenter', () => item.style.background = '#333');
            item.addEventListener('mouseleave', () => item.style.background = 'transparent');
            item.addEventListener('mousedown', (e) => {
                // mousedown fires before blur, allowing us to set value
                e.preventDefault();
                inputField.value = item.getAttribute('data-name');
                dropdown.style.display = 'none';
                inputField.dispatchEvent(new Event('input')); // trigger validation
            });
        });
        
        const getValidKey = (val) => {
            if (!val) return null;
            const cleanVal = val.toLowerCase().replace(/\s+/g, '');
            for (const item of itemsList) {
                const cleanName = item.name.toLowerCase().replace(/\s+/g, '');
                if (cleanName === cleanVal || item.key.toLowerCase() === cleanVal) {
                    return item.key;
                }
            }
            return null;
        };
        
        inputField.addEventListener('focus', () => {
            dropdown.style.display = 'block';
            inputField.dispatchEvent(new Event('input')); // trigger filter update
        });
        
        inputField.addEventListener('blur', () => {
            dropdown.style.display = 'none';
        });
        
        inputField.addEventListener('input', () => {
            dropdown.style.display = 'block';
            const filterVal = inputField.value.toLowerCase().replace(/\s+/g, '');
            
            let anyVisible = false;
            dropdownItems.forEach(item => {
                const cleanName = item.getAttribute('data-name').toLowerCase().replace(/\s+/g, '');
                if (cleanName.includes(filterVal)) {
                    item.style.display = 'block';
                    anyVisible = true;
                } else {
                    item.style.display = 'none';
                }
            });
            
            if (!anyVisible) dropdown.style.display = 'none';
            
            const key = getValidKey(inputField.value);
            inputField.dataset.currentKey = key || '';
            if (key) {
                const rate = this.logic.phoneExchangeRates[key];
                const reqAmount = Math.ceil(1 / rate);
                const currentAmount = Math.floor(this.logic.inventory[key] || 0);
                infoDiv.innerHTML = `<span style="color: #fff;">1 Phone = ${reqAmount} items.</span> <span style="color: #5f5; margin-left: 10px;">You have: ${currentAmount}</span>`;
                burnBtn.disabled = isQueueFull ? true : false;
            } else {
                infoDiv.innerHTML = '';
                burnBtn.disabled = true;
            }
        });
        
        burnBtn.addEventListener('click', () => {
            if (isQueueFull || burnBtn.disabled) return;
            const key = getValidKey(inputField.value);
            if (key) {
                if (this.app.soundEngine) this.app.soundEngine.play('ding');
                const rate = this.logic.phoneExchangeRates[key];
                const reqAmount = Math.ceil(1 / rate);
                const mult = parseInt(amountField.value) || 1;
                
                const success = this.logic.startBurn(this.selectedBuilding.uuid, key, reqAmount * mult, mult);
                if (success) {
                    this.openLeighHighUI(this.selectedBuilding);
                    this.updateDisplay();
                }
            }
        });
        
        // Show active queue
        if (this.selectedBuilding.burnQueue && this.selectedBuilding.burnQueue.length > 0) {
            const queueHeader = document.createElement('div');
            queueHeader.style.marginTop = '15px';
            queueHeader.style.marginBottom = '5px';
            queueHeader.innerHTML = `<strong>Delivery Queue (${this.selectedBuilding.burnQueue.length}/10):</strong>`;
            list.appendChild(queueHeader);
            
            this.selectedBuilding.burnQueue.forEach((q, i) => {
                let name = q.itemKey.replace(/([A-Z])/g, ' $1');
                name = name.charAt(0).toUpperCase() + name.slice(1);
                
                const qRow = document.createElement('div');
                qRow.style.display = 'flex';
                qRow.style.justifyContent = 'space-between';
                qRow.style.alignItems = 'center';
                qRow.style.background = '#111';
                qRow.style.border = '1px solid #333';
                qRow.style.padding = '4px 8px';
                qRow.style.marginBottom = '4px';
                qRow.style.borderRadius = '3px';
                
                const remaining = q.amount - q.received;
                
                qRow.innerHTML = `
                    <div style="flex-grow: 1;">
                        <div style="font-weight: bold; color: #fff;">${q.amount}x ${name}</div>
                        <span id="leigh-queue-status-${i}"></span>
                    </div>
                    <button class="cancel-burn-btn" style="background: none; border: none; font-size: 1.2em; cursor: pointer; color: #e74c3c; padding: 0 5px;" title="Cancel Order">🗑️</button>
                `;
                
                qRow.querySelector('.cancel-burn-btn').addEventListener('click', () => {
                    if (this.app.soundEngine) this.app.soundEngine.play('click');
                    if (this.logic.cancelBurn(this.selectedBuilding.uuid, i)) {
                        this.openLeighHighUI(this.selectedBuilding);
                        this.updateDisplay();
                    }
                });
                
                list.appendChild(qRow);
            });
        }
        
        const progRow = document.createElement('div');
        progRow.style.marginTop = '10px';
        progRow.style.marginBottom = '20px';
        progRow.innerHTML = `
            <div id="burn-status-text" style="font-size: 0.9em; margin-bottom: 5px; color: #fff;">Idle</div>
            <div style="width: 100%; height: 10px; background: #222; border: 1px solid #000; border-radius: 5px; overflow: hidden;">
                <div id="burn-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #ffd700, #ffaa00); transition: width 0.1s linear;"></div>
            </div>
        `;
        list.appendChild(progRow);
        
        // Phone Hotel Section
        const hotelContainer = document.createElement('div');
        hotelContainer.style.background = '#4a69bd'; // Light blue canvas
        hotelContainer.style.border = '2px solid #1e3799';
        hotelContainer.style.padding = '10px';
        hotelContainer.style.marginTop = '20px';
        hotelContainer.style.borderRadius = '5px';
        hotelContainer.style.boxShadow = '0 5px 15px rgba(0,0,0,0.5)';
        
        hotelContainer.innerHTML = `
            <div style="text-align: center; font-weight: bold; font-family: sans-serif; color: #fff; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px; text-shadow: 1px 1px 0 #000;">
                Classroom Phone Hotel
            </div>
            <div id="leigh-hotel-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-bottom: 15px;">
                <!-- Filled by updateLeighHighProgress -->
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center; background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 4px; border-top: 2px solid #2980b9; border-bottom: 2px solid #1a252f; box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);">
                <div style="font-weight: 900; font-family: Impact, sans-serif; font-size: 1.1em; color: #f1c40f; text-shadow: 1px 1px 2px #000; display: flex; align-items: center;">
                    PHONES: <span id="leigh-basket-count" style="color: #fff; background: #000; padding: 2px 8px; border-radius: 3px; border: 1px solid #555; margin-left: 10px; font-family: 'Courier New', monospace;">${this.selectedBuilding.uncollectedPhones || 0}</span>
                </div>
                <button id="leigh-collect-btn" class="nuke-btn" style="flex-grow: 1; min-width: 140px; padding: 8px;">CONFISCATE ALL</button>
            </div>
        `;
        list.appendChild(hotelContainer);
        
        hotelContainer.querySelector('#leigh-collect-btn').addEventListener('click', (e) => {
            if (this.app.soundEngine) this.app.soundEngine.play('ding');
            const collected = this.logic.collectPhones(this.selectedBuilding.uuid);
            if (collected > 0) {
                // Satisfying float text on collection
                const floatText = document.createElement('div');
                floatText.textContent = `+${collected} Phones Collected!`;
                floatText.style.position = 'absolute';
                floatText.style.left = e.clientX + 'px';
                floatText.style.top = e.clientY + 'px';
                floatText.style.transform = 'translate(-50%, -50%)';
                floatText.style.color = '#2ecc71';
                floatText.style.fontSize = '1.5em';
                floatText.style.fontWeight = 'bold';
                floatText.style.textShadow = '0 0 5px #27ae60, 2px 2px 0 #000';
                floatText.style.pointerEvents = 'none';
                floatText.style.zIndex = '1000';
                floatText.classList.add('floating-text-anim');
                document.body.appendChild(floatText);
                
                setTimeout(() => floatText.remove(), 1500);

                this.updateDisplay();
            }
        });
        
        this.updateLeighHighProgress();
    }
    
    closeLeighHighUI() {
        this.selectedBuilding = null;
        document.getElementById('leigh-high-popup').style.display = 'none';
    }

    updateDisplay() {
        // Determine active quest demands map for integrated inventory rows
        let questDemands = {};
        let questTitle = "All Demands Complete";
        if (this.logic.currentQuest === 1) {
            questTitle = "Unlock Constructor";
            questDemands = { ironIngot: 100, copperIngot: 100 };
        } else if (this.logic.currentQuest === 2) {
            questTitle = "Unlock Big Constructor";
            questDemands = { ironPlate: 25, ironRod: 25 };
        } else if (this.logic.currentQuest === 3) {
            questTitle = "Deliver Panels";
            questDemands = { panel: 15 };
        }
        const isMobileView = window.isMobile || document.body.classList.contains('mobile-mode');
        let metDemandsCount = 0;
        const totalDemandsCount = Object.keys(questDemands).length;

        // Update Inventory UI with dirty checks + integrated demand rows
        for (const res of this._rateResources) {
            const el = this._resourceEls[res];
            if (el) {
                const key = this._rateKeys[res];
                const val = Math.floor(this.logic.inventory[key] || 0);
                const row = el.parentElement;
                const demandMax = (res !== 'phones') ? questDemands[res] : undefined;

                if (row && res !== 'phones') {
                    if (demandMax) {
                        if (!row.classList.contains('demanded-item')) {
                            row.classList.add('demanded-item');
                        }
                        if (!row._demandFillEl) {
                            const fillEl = document.createElement('div');
                            fillEl.className = 'demand-row-fill mobile-only';
                            row.insertBefore(fillEl, row.firstChild);
                            row._demandFillEl = fillEl;
                        }
                        const nameEl = row.querySelector('.resource-name');
                        if (nameEl && !row._demandBadgeEl) {
                            const badgeEl = document.createElement('span');
                            badgeEl.className = 'demand-badge mobile-only';
                            nameEl.appendChild(badgeEl);
                            row._demandBadgeEl = badgeEl;
                        }
                        const pct = Math.min(100, Math.max(0, (val / demandMax) * 100));
                        const isMet = val >= demandMax;
                        if (isMet) metDemandsCount++;
                        row.dataset.demandMet = isMet ? 'true' : 'false';
                        if (row._demandFillEl._lastPct !== pct) {
                            row._demandFillEl.style.width = pct + '%';
                            row._demandFillEl._lastPct = pct;
                        }
                        const badgeText = isMet ? 'READY ✓' : 'DEMAND';
                        if (row._demandBadgeEl && row._demandBadgeEl._lastText !== badgeText) {
                            row._demandBadgeEl.textContent = badgeText;
                            row._demandBadgeEl._lastText = badgeText;
                        }
                    } else if (row.classList.contains('demanded-item')) {
                        row.classList.remove('demanded-item');
                        delete row.dataset.demandMet;
                        if (row._demandFillEl) row._demandFillEl.style.width = '0%';
                        el._lastVal = null;
                        el._lastDemandHtml = null;
                    }
                }
                
                if (row && row.dataset.showDerivative === 'true') {
                    const rate = this._rates[res] || 0;
                    const rounded = Math.round(rate);
                    const sign = rounded >= 0 ? '+' : '';
                    const color = rounded > 0 ? '#5f5' : rounded < 0 ? '#f55' : '#aaa';
                    const html = `<span style="color:${color}; font-family:'Courier New',monospace; font-weight:bold;">${sign}${rounded}/s</span>`;
                    if (el._lastDerivativeHtml !== html) {
                        el.innerHTML = html;
                        el._lastDerivativeHtml = html;
                        el._lastVal = null;
                        el._lastDemandHtml = null;
                    }
                } else if (demandMax && isMobileView) {
                    const isMet = val >= demandMax;
                    const demandHtml = `<span class="demand-cur${isMet ? ' met' : ''}">${val}</span><span class="demand-slash">/${demandMax}</span>`;
                    if (el._lastDemandHtml !== demandHtml) {
                        el.innerHTML = demandHtml;
                        el._lastDemandHtml = demandHtml;
                        el._lastVal = null;
                        el._lastDerivativeHtml = null;
                    }
                } else {
                    if (el._lastVal !== val || el._lastDemandHtml !== null) {
                        el.textContent = val;
                        el._lastVal = val;
                        el._lastDerivativeHtml = null;
                        el._lastDemandHtml = null;
                    }
                }
            }
        }

        // Update Special Items -> Phones row in mobile inventory list
        if (this.elPhonesInv) {
            const phonesRow = this.elPhonesInv.parentElement;
            if (phonesRow && phonesRow.dataset.showDerivative === 'true') {
                const rate = this._rates['phones'] || 0;
                const rounded = Math.round(rate);
                const sign = rounded >= 0 ? '+' : '';
                const color = rounded > 0 ? '#5f5' : rounded < 0 ? '#f55' : '#aaa';
                const html = `<span style="color:${color}; font-family:'Courier New',monospace; font-weight:bold;">${sign}${rounded}/s</span>`;
                if (this.elPhonesInv._lastDerivativeHtml !== html) {
                    this.elPhonesInv.innerHTML = html;
                    this.elPhonesInv._lastDerivativeHtml = html;
                    this.elPhonesInv._lastVal = null;
                }
            } else {
                const phonesVal = Math.floor(this.logic.inventory.confiscatedPhones || 0);
                if (this.elPhonesInv._lastVal !== phonesVal) {
                    this.elPhonesInv.textContent = phonesVal;
                    this.elPhonesInv._lastVal = phonesVal;
                    this.elPhonesInv._lastDerivativeHtml = null;
                }
            }
        }

        // Update Mobile Inventory Demands Banner
        if (this.elMobileGoalSubtitle) {
            if (this.elMobileGoalSubtitle._lastText !== questTitle) {
                this.elMobileGoalSubtitle.textContent = questTitle;
                this.elMobileGoalSubtitle._lastText = questTitle;
            }
        }
        const questReady = this.logic.isCurrentQuestReady() && !this.app.isLaunchingRockets;
        if (this.elMobileGoalStatus) {
            const statusText = totalDemandsCount > 0
                ? (metDemandsCount >= totalDemandsCount ? 'Ready to Launch' : `${metDemandsCount}/${totalDemandsCount} Met`)
                : 'Complete ✓';
            if (this.elMobileGoalStatus._lastText !== statusText) {
                this.elMobileGoalStatus.textContent = statusText;
                this.elMobileGoalStatus._lastText = statusText;
            }
            this.elMobileGoalStatus.classList.toggle('ready', metDemandsCount >= totalDemandsCount && totalDemandsCount > 0);
        }
        if (this.elMobileLaunchBtn) {
            this.elMobileLaunchBtn.style.display = questReady ? 'block' : 'none';
        }
        
        // Re-populate machines menu only when unlocked count changes
        let unlockedCount = 0;
        for (let i = 0; i < this.logic.otherBuildings.length; i++) {
            if (this.logic.otherBuildings[i].unlocked) unlockedCount++;
        }
        if (this._lastUnlockedCount !== unlockedCount) {
            this._lastUnlockedCount = unlockedCount;
            this.populateMachineSubmenu();
        }
        
        // Update Goal UI with cached structure
        if (this.elGoalSubtitle && this.elGoalReqDiv) {
            if (this._lastGoalQuest !== this.logic.currentQuest) {
                this._lastGoalQuest = this.logic.currentQuest;
                this.elGoalReqDiv.innerHTML = '';
                this._goalBars = [];
                
                let barsConfig = [];
                if (this.logic.currentQuest === 1) {
                    this.elGoalSubtitle.textContent = "Unlock Constructor";
                    barsConfig = [
                        { key: 'ironIngot', label: 'Iron Ingots', max: 100 },
                        { key: 'copperIngot', label: 'Copper Ingots', max: 100 }
                    ];
                } else if (this.logic.currentQuest === 2) {
                    this.elGoalSubtitle.textContent = "Unlock Big Constructor";
                    barsConfig = [
                        { key: 'ironPlate', label: 'Iron Plates', max: 25 },
                        { key: 'ironRod', label: 'Iron Rods', max: 25 }
                    ];
                } else if (this.logic.currentQuest === 3) {
                    this.elGoalSubtitle.textContent = "Deliver Panels";
                    barsConfig = [
                        { key: 'panel', label: 'Panels', max: 15 }
                    ];
                }
                
                for (const cfg of barsConfig) {
                    const row = document.createElement('div');
                    row.style.cssText = 'position:relative; width:100%; height:16px; background:rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.15); border-radius:2px; overflow:hidden; margin-bottom:3px; display:flex; align-items:center; box-shadow:inset 0 1px 3px rgba(0,0,0,0.5);';
                    
                    const fill = document.createElement('div');
                    fill.style.cssText = 'position:absolute; left:0; top:0; height:100%; width:0%; transition:width 0.2s;';
                    row.appendChild(fill);
                    
                    const label = document.createElement('div');
                    label.style.cssText = 'position:absolute; left:4px; top:0; height:100%; display:flex; align-items:center; z-index:2; font-size:0.8em; font-weight:bold; text-shadow:1px 1px 2px #000; color:#fff;';
                    label.textContent = cfg.label;
                    row.appendChild(label);
                    
                    const count = document.createElement('div');
                    count.style.cssText = 'position:absolute; right:4px; top:0; height:100%; display:flex; align-items:center; z-index:2; font-size:0.8em; font-family:monospace; font-weight:bold; text-shadow:1px 1px 2px #000; color:#fff;';
                    row.appendChild(count);
                    
                    this.elGoalReqDiv.appendChild(row);
                    this._goalBars.push({ key: cfg.key, max: cfg.max, fill, count });
                }
            }
            
            // Fast direct update of goal bar fills and counts without string rebuilds
            if (this._goalBars) {
                for (const gb of this._goalBars) {
                    const current = Math.min(gb.max, Math.floor(this.logic.inventory[gb.key] || 0));
                    const pct = Math.min(100, Math.max(0, (current / gb.max) * 100));
                    const isDone = current >= gb.max;
                    const barColor = isDone ? 'rgba(46, 204, 113, 0.8)' : 'rgba(230, 126, 34, 0.8)';
                    gb.fill.style.width = pct + '%';
                    gb.fill.style.background = barColor;
                    gb.fill.style.boxShadow = `0 0 5px ${barColor}`;
                    gb.count.textContent = `${current}/${gb.max}`;
                }
            }
        }
        
        if (this.elLaunchBtn) {
            if (this.logic.isCurrentQuestReady() && !this.app.isLaunchingRockets) {
                this.elLaunchBtn.style.display = 'block';
                if (this.elGoalReqDiv) this.elGoalReqDiv.style.display = 'none';
            } else {
                this.elLaunchBtn.style.display = 'none';
                if (this.elGoalReqDiv) this.elGoalReqDiv.style.display = 'block';
            }
        }
        
        // Update Recipe Progress Bar and Buffer Status
        if (this.selectedBuilding) {
            if (this.selectedBuilding.activeRecipe) {
                const recipeData = this.logic.recipes[this.selectedBuilding.activeRecipe];
                let percent = 0;
                if (this.selectedBuilding.isWorking && recipeData && recipeData.time > 0) {
                    percent = Math.min(100, Math.max(0, (this.selectedBuilding.progress / recipeData.time) * 100));
                }
                if (this.elRecipeProgressBar) this.elRecipeProgressBar.style.width = percent + '%';
            } else {
                if (this.elRecipeProgressBar) this.elRecipeProgressBar.style.width = '0%';
            }

            if (this.elRecipeBufferStatus) {
                const bld = this.selectedBuilding;
                let inParts = [];
                let outParts = [];
                if (bld.inputBuffer) {
                    for (const [k, v] of Object.entries(bld.inputBuffer)) {
                        if (v > 0) inParts.push(`<span style="color:#f39c12;">${k}:</span> <span style="font-family:'Courier New',monospace; font-weight:bold; color:#fff;">${Math.floor(v)}</span>`);
                    }
                }
                if (bld.outputBuffer) {
                    for (const [k, v] of Object.entries(bld.outputBuffer)) {
                        if (v > 0) outParts.push(`<span style="color:#3498db;">${k}:</span> <span style="font-family:'Courier New',monospace; font-weight:bold; color:#fff;">${Math.floor(v)}</span>`);
                    }
                }
                
                let html = '';
                if (inParts.length > 0) html += `<div style="background: rgba(243, 156, 18, 0.1); border-left: 3px solid #f39c12; padding: 4px 8px;"><strong style="color:#f39c12; font-size:0.85em; text-transform:uppercase; letter-spacing:1px;">Input</strong><br>${inParts.join(' | ')}</div>`;
                if (outParts.length > 0) html += `<div style="background: rgba(52, 152, 219, 0.1); border-left: 3px solid #3498db; padding: 4px 8px;"><strong style="color:#3498db; font-size:0.85em; text-transform:uppercase; letter-spacing:1px;">Output</strong><br>${outParts.join(' | ')}</div>`;
                
                if (this.elRecipeBufferStatus._lastHtml !== html) {
                    this.elRecipeBufferStatus.innerHTML = html;
                    this.elRecipeBufferStatus._lastHtml = html;
                }
            }
        } else {
            if (this.elRecipeProgressBar) this.elRecipeProgressBar.style.width = '0%';
            if (this.elRecipeBufferStatus) {
                this.elRecipeBufferStatus.textContent = '';
                this.elRecipeBufferStatus._lastHtml = '';
            }
        }
        
        this.updateLeighHighProgress();
    }

    updateLeighHighProgress() {
        const pb = document.getElementById('burn-progress-bar');
        const txt = document.getElementById('burn-status-text');
        
        if (this.selectedBuilding && this.selectedBuilding.activeBurn) {
            const pct = (this.selectedBuilding.activeBurn.progress / this.selectedBuilding.activeBurn.duration) * 100;
            if (pb) {
                pb.style.width = pct + '%';
                pb.style.opacity = (Math.sin(performance.now() * 0.01) * 0.2 + 0.8).toString();
            }
            
            let name = this.selectedBuilding.activeBurn.itemKey.replace(/([A-Z])/g, ' $1');
            name = name.charAt(0).toUpperCase() + name.slice(1);
            if (txt) txt.textContent = `Burning ${name}...`;
        } else {
            if (pb) {
                pb.style.width = '0%';
                pb.style.opacity = '1';
            }
            if (this.selectedBuilding && this.selectedBuilding.burnQueue && this.selectedBuilding.burnQueue.length > 0) {
                if (this.selectedBuilding.burnQueue[0].received > 0) {
                    if (txt) txt.textContent = 'Preparing next burn...';
                } else {
                    if (txt) txt.textContent = 'Waiting for drone delivery...';
                }
            } else {
                if (txt) txt.textContent = 'Idle';
            }
        }
        
        if (this.selectedBuilding) {
            // Dynamic Inventory Updates
            const inputField = document.getElementById('leigh-item-input');
            const infoDiv = document.getElementById('leigh-item-info');
            if (inputField && infoDiv) {
                const key = inputField.dataset.currentKey;
                if (key) {
                    const rate = this.logic.phoneExchangeRates[key];
                    const reqAmount = Math.ceil(1 / rate);
                    const currentAmount = Math.floor(this.logic.inventory[key] || 0);
                    infoDiv.innerHTML = `<span style="color: #fff;">1 Phone = ${reqAmount} items.</span> <span style="color: #5f5; margin-left: 10px;">You have: ${currentAmount}</span>`;
                }
            }

            // Dynamic Queue Updates
            if (this.selectedBuilding.burnQueue) {
                this.selectedBuilding.burnQueue.forEach((q, i) => {
                    const statusSpan = document.getElementById(`leigh-queue-status-${i}`);
                    if (statusSpan) {
                        const remaining = q.amount - q.received;
                        if (remaining > 0) {
                            statusSpan.innerHTML = `<span style="color: #f39c12; font-size: 0.85em;">Waiting for ${remaining} more</span>`;
                        } else {
                            statusSpan.innerHTML = `<span style="color: #2ecc71; font-size: 0.85em;">All received, burning...</span>`;
                        }
                    }
                });
            }

            const numPhones = this.selectedBuilding.uncollectedPhones || 0;
            const counter = document.getElementById('leigh-basket-count');
            if (counter) {
                counter.textContent = numPhones;
            }
            
            const hotelGrid = document.getElementById('leigh-hotel-grid');
            if (hotelGrid) {
                // Only redraw hotel if the number of phones changed to preserve hover/click events
                const currentDrawn = hotelGrid.dataset.drawnPhones;
                if (currentDrawn != numPhones) {
                    hotelGrid.dataset.drawnPhones = numPhones;
                    hotelGrid.innerHTML = '';
                    const totalPockets = 12; // 4x3 grid
                    
                    for (let i = 0; i < totalPockets; i++) {
                        const pocket = document.createElement('div');
                        pocket.style.background = '#1e3799'; 
                        pocket.style.border = '1px solid #0c2461';
                        pocket.style.borderRadius = '0 0 4px 4px';
                        pocket.style.height = '40px';
                        pocket.style.position = 'relative';
                        pocket.style.display = 'flex';
                        pocket.style.justifyContent = 'center';
                        pocket.style.alignItems = 'flex-end';
                        pocket.style.paddingBottom = '2px';
                        pocket.style.boxShadow = 'inset 0 -5px 10px rgba(0,0,0,0.5)';
                        
                        const label = document.createElement('div');
                        label.textContent = i + 1;
                        label.style.position = 'absolute';
                        label.style.top = '2px';
                        label.style.left = '4px';
                        label.style.fontSize = '0.6em';
                        label.style.color = '#fff';
                        label.style.opacity = '0.5';
                        pocket.appendChild(label);
                        
                        if (i < numPhones) {
                            const phoneIcon = document.createElement('div');
                            phoneIcon.textContent = '📱';
                            phoneIcon.style.fontSize = '1.4em';
                            phoneIcon.style.filter = 'drop-shadow(0 0 3px #f1c40f)';
                            phoneIcon.style.cursor = 'pointer';
                            phoneIcon.style.transition = 'all 0.1s ease';
                            
                            // Hash-based rotation for consistent look per pocket
                            const rot = ((i * 137.5) % 40) - 20; 
                            phoneIcon.style.transform = `translateY(5px) rotate(${rot}deg)`;
                            
                            phoneIcon.addEventListener('mouseenter', () => {
                                phoneIcon.style.transform = `translateY(0px) rotate(${rot}deg) scale(1.2)`;
                                phoneIcon.style.filter = 'drop-shadow(0 0 8px #f1c40f)';
                            });
                            
                            phoneIcon.addEventListener('mouseleave', () => {
                                phoneIcon.style.transform = `translateY(5px) rotate(${rot}deg)`;
                                phoneIcon.style.filter = 'drop-shadow(0 0 3px #f1c40f)';
                            });
                            
                            phoneIcon.addEventListener('click', (e) => {
                                if (this.app.soundEngine) this.app.soundEngine.play('click');
                                const collected = this.logic.collectPhones(this.selectedBuilding.uuid, 1);
                                if (collected > 0) {
                                    // float text
                                    const floatText = document.createElement('div');
                                    floatText.textContent = `+1 Phone Collected!`;
                                    floatText.style.position = 'absolute';
                                    floatText.style.left = e.clientX + 'px';
                                    floatText.style.top = e.clientY + 'px';
                                    floatText.style.transform = 'translate(-50%, -50%)';
                                    floatText.style.color = '#2ecc71';
                                    floatText.style.fontSize = '1.2em';
                                    floatText.style.fontWeight = 'bold';
                                    floatText.style.textShadow = '0 0 5px #27ae60, 2px 2px 0 #000';
                                    floatText.style.pointerEvents = 'none';
                                    floatText.style.zIndex = '1000';
                                    floatText.classList.add('floating-text-anim');
                                    document.body.appendChild(floatText);
                                    
                                    setTimeout(() => floatText.remove(), 1500);
                                    
                                    this.updateDisplay();
                                }
                            });
                            
                            pocket.appendChild(phoneIcon);
                        }
                        
                        hotelGrid.appendChild(pocket);
                    }
                }
            }
        }
    }

    _setupRateTooltips() {
        // Create the rate tooltip element
        const tooltip = document.createElement('div');
        tooltip.id = 'rate-tooltip';
        tooltip.className = 'glass-panel no-rivets';
        tooltip.style.cssText = 'display:none; position:absolute; pointer-events:none; z-index:1001; white-space:nowrap; padding:4px 10px; font-size:0.85rem;';
        document.getElementById('ui-layer').appendChild(tooltip);
        this._rateTooltip = tooltip;
        
        // Attach hover events to each resource-item row
        const items = document.querySelectorAll('#inventory-panel .resource-item, #resource-panel .resource-item');
        items.forEach(item => {
            const valueEl = item.querySelector('.resource-value');
            if (!valueEl) return;
            
            // Extract the resource key from the id (e.g. "res-iron" -> "iron", "res-phones-inv" -> "phones")
            const resId = valueEl.id.replace('res-', '').replace('-inv', '');
            const nameEl = item.querySelector('.resource-name');
            const resName = nameEl ? nameEl.textContent.trim() : resId;
            
            const formatTooltip = () => {
                const rate = this._rates[resId] || 0;
                const rounded = Math.round(rate);
                const sign = rounded >= 0 ? '+' : '';
                const color = rounded > 0 ? '#5f5' : rounded < 0 ? '#f55' : '#aaa';
                return `<div style="font-size:0.85rem; color:#fff; font-weight:700; margin-bottom:2px;">${resName}</div><span style="color:${color}; font-family:'Courier New',monospace; font-weight:bold;">${sign}${rounded}/s</span>`;
            };

            item.addEventListener('mouseenter', (e) => {
                if (window.isMobile) return;
                this._rateTooltip.innerHTML = formatTooltip();
                this._rateTooltip.style.display = 'block';
                
                const rect = item.getBoundingClientRect();
                this._rateTooltip.style.left = `${rect.right + 8}px`;
                this._rateTooltip.style.top = `${rect.top}px`;
            });
            
            item.addEventListener('mousemove', (e) => {
                if (window.isMobile) return;
                this._rateTooltip.innerHTML = formatTooltip();
            });
            
            item.addEventListener('mouseleave', () => {
                if (window.isMobile) return;
                this._rateTooltip.style.display = 'none';
            });
            
            item.addEventListener('click', () => {
                const isShowing = item.dataset.showDerivative === 'true';
                item.dataset.showDerivative = isShowing ? 'false' : 'true';
                if (this.app && this.app.soundEngine) this.app.soundEngine.play('click');
                this.updateDisplay();
            });
        });
    }

    update(deltaTime) {
        // Sample inventory rates
        this._rateTimer += deltaTime;
        if (this._rateTimer >= this._rateSampleInterval) {
            this._rateTimer -= this._rateSampleInterval;
            for (const r of this._rateResources) {
                const current = this.logic.inventory[this._rateKeys[r]] || 0;
                this._rates[r] = current - this._prevSnapshot[r];
                this._prevSnapshot[r] = current;
            }
        }
        
        // Throttled UI update (10 Hz) eliminates layout thrashing & GC pauses
        this._uiTimer = (this._uiTimer || 0) + deltaTime;
        if (this._uiTimer >= 0.1) {
            this._uiTimer = 0;
            this.updateDisplay();
        } else if (this.selectedBuilding && this.selectedBuilding.isWorking && this.elRecipeProgressBar) {
            // Smooth 60 FPS update only for the open modal's single progress bar
            const recipeData = this.logic.recipes[this.selectedBuilding.activeRecipe];
            if (recipeData && recipeData.time > 0) {
                const percent = Math.min(100, Math.max(0, (this.selectedBuilding.progress / recipeData.time) * 100));
                this.elRecipeProgressBar.style.width = percent + '%';
            }
        }
        
        // Only animate Leigh High progress bar if popup is open
        if (this.elLeighPopup && this.elLeighPopup.style.display !== 'none') {
            this.updateLeighHighProgress();
        }
    }
}
