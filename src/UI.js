export class UI {
    constructor(app, logic) {
        this.app = app;
        this.logic = logic;
        
        this.activeTool = 'select';
        
        // Rate tracking: sample inventory every second to compute derivatives
        this._rateResources = ['phones', 'iron', 'copper', 'coal', 'gold', 'water', 'poop', 'ironIngot', 'copperIngot', 'ironPlate', 'ironRod', 'copperWire', 'frame', 'panel'];
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

        let icon = 'ℹ️';
        if (text.toLowerCase().includes('save')) icon = '💾';
        if (text.toLowerCase().includes('phone')) icon = '📱';

        toast.innerHTML = `
            <div style="font-size: 2em; filter: drop-shadow(0 0 5px ${color});">${icon}</div>
            <div style="display: flex; flex-direction: column;">
                <span style="font-family: var(--font-display, Orbitron, sans-serif); color: ${color}; font-size: 1.1em; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">Notification</span>
                <span style="font-size: 0.95em; color: #fff; font-family: var(--font-main, Rajdhani, sans-serif);">${text}</span>
            </div>
        `;
        
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
            
            submenu.appendChild(btn);
        });
        
        this.bindToolButtons();
    }

    bindEvents() {
        this.bindToolButtons();
        
        document.getElementById('ui-layer').addEventListener('contextmenu', e => e.preventDefault());
        
        const launchBtn = document.getElementById('btn-launch-rocket');
        if (launchBtn) {
            launchBtn.addEventListener('click', () => {
                if (this.app.soundEngine) this.app.soundEngine.play('click');
                launchBtn.style.display = 'none';
                if (this.app.triggerRocketLaunch) {
                    this.app.triggerRocketLaunch();
                }
            });
        }
        
        const invHeader = document.getElementById('inventory-header');
        if (invHeader) {
            const content = document.getElementById('inventory-content');
            const arrow = document.getElementById('inventory-toggle-arrow');
            const panel = document.getElementById('inventory-panel');

            // Default to collapsed on mobile
            if (window.isMobile) {
                content.style.display = 'none';
                arrow.style.transform = 'rotate(180deg)';
                panel.style.minWidth = 'auto';
                panel.classList.remove('mobile-expanded');
            }

            const techToggle = document.getElementById('tech-tree-toggle');
            const techPage = document.getElementById('tech-tree-page');

            invHeader.addEventListener('click', () => {
                if (content.style.display !== 'none') {
                    content.style.display = 'none';
                    arrow.style.transform = 'rotate(180deg)';
                    panel.style.minWidth = 'auto';
                    if (window.isMobile) panel.classList.remove('mobile-expanded');
                    
                    // Close tech tree if inventory is closed
                    if (techPage) techPage.classList.remove('active');
                    panel.classList.remove('swiped-left');
                    if (techToggle) {
                        techToggle.classList.remove('open');
                        techToggle.style.display = 'none';
                    }
                } else {
                    content.style.display = 'contents';
                    arrow.style.transform = 'rotate(0deg)';
                    panel.style.minWidth = '320px';
                    if (window.isMobile) panel.classList.add('mobile-expanded');
                    if (techToggle) techToggle.style.display = '';
                }
            });

            if (techToggle && techPage) {
                techToggle.addEventListener('click', () => {
                    if (content.style.display === 'none') return;
                    if (this.app.soundEngine) this.app.soundEngine.play('whoosh');
                    techPage.classList.toggle('active');
                    techToggle.classList.toggle('open');
                });
            }

            // Mobile swipe logic (Native 1:1 tracking)
            let touchStartX = 0;
            let touchStartY = 0;
            let isSwiping = false;

            const onTouchStart = (e) => {
                if (content.style.display === 'none') return;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isSwiping = true;
                
                // Disable transitions during drag for 1:1 tracking
                panel.style.transition = 'none';
                if (techPage) techPage.style.transition = 'none';
            };

            const onTouchMove = (e) => {
                if (!isSwiping || content.style.display === 'none') return;
                let touchCurX = e.touches[0].clientX;
                let touchCurY = e.touches[0].clientY;
                let dx = touchCurX - touchStartX;
                let dy = Math.abs(touchCurY - touchStartY);
                
                // Lock into horizontal swipe if dx > dy
                if (Math.abs(dx) > dy) {
                    if (e.cancelable) e.preventDefault();
                    
                    const isTechActive = techPage && techPage.classList.contains('active');
                    
                    if (!isTechActive && dx < 0) {
                        // Dragging to open (swiping left)
                        panel.style.transform = `translateX(${dx}px)`;
                        if (techPage) techPage.style.transform = `translateX(calc(100vw + ${dx}px))`;
                    } else if (isTechActive && dx > 0) {
                        // Dragging to close (swiping right)
                        panel.style.transform = `translateX(calc(-100vw + ${dx}px))`;
                        if (techPage) techPage.style.transform = `translateX(${dx}px)`;
                    }
                }
            };

            const onTouchEnd = (e) => {
                if (!isSwiping || content.style.display === 'none') return;
                isSwiping = false;
                
                let touchEndX = e.changedTouches[0].clientX;
                let dx = touchEndX - touchStartX;
                
                // Restore transitions to let CSS snap it
                panel.style.transition = '';
                if (techPage) techPage.style.transition = '';
                
                // Clear inline transforms so classes take over completely
                panel.style.transform = '';
                if (techPage) techPage.style.transform = '';

                const isTechActive = techPage && techPage.classList.contains('active');

                if (!isTechActive) {
                    // Check if dragged far enough left to snap open
                    if (dx < -60) {
                        if (this.app.soundEngine) this.app.soundEngine.play('whoosh');
                        if (techPage) techPage.classList.add('active');
                        panel.classList.add('swiped-left');
                        if (techToggle) techToggle.classList.add('open');
                    }
                } else {
                    // Check if dragged far enough right to snap closed
                    if (dx > 60) {
                        if (this.app.soundEngine) this.app.soundEngine.play('whoosh');
                        if (techPage) techPage.classList.remove('active');
                        panel.classList.remove('swiped-left');
                        if (techToggle) techToggle.classList.remove('open');
                    }
                }
            };

            // {passive: false} on touchmove is necessary to allow e.preventDefault() for native feeling
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
                const invPanel = document.getElementById('inventory-panel');
                const isMenuOpen = machineSubmenu.classList.contains('show');
                
                if (invPanel) {
                    if (isMenuOpen) {
                        invPanel.style.display = 'none';
                    } else {
                        invPanel.style.display = '';
                    }
                }
                
                if (this.app.scene && this.app.scene.gridSystem) {
                    this.app.scene.gridSystem.instancedLeaves.visible = !isMenuOpen;
                }
            }
            
            // Turn off build mode and depress other buttons
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            this.activeTool = 'select';
            
            if (machineSubmenu.classList.contains('show')) {
                machineBtn.classList.add('active');
                machineBtn.textContent = 'Machines ▲';
            } else {
                document.querySelector('.tool-btn[data-tool="select"]').classList.add('active');
                machineBtn.textContent = 'Machines ▼';
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
                    const selBtn = document.querySelector('.tool-btn[data-tool="select"]');
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
    
    bindToolButtons() {
        const toolBtns = document.querySelectorAll('.tool-btn:not(#btn-machine-category):not(#btn-save-game)');
        toolBtns.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                if (newBtn.disabled) return;
                if (this.app.soundEngine) this.app.soundEngine.play('click');
                
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                newBtn.classList.add('active');
                
                if (newBtn.closest('#machine-submenu')) {
                    document.getElementById('btn-machine-category').classList.add('active');
                }
                
                this.activeTool = newBtn.getAttribute('data-tool');
                
                // On mobile, don't close the submenu when selecting a tool
                if (!window.isMobile || !newBtn.closest('#machine-submenu')) {
                    document.querySelectorAll('.submenu-horizontal').forEach(s => s.classList.remove('show'));
                    const machineBtn = document.getElementById('btn-machine-category');
                    if (machineBtn) machineBtn.textContent = 'Machines ▼';
                }
                
                this.closeRecipeUI();
                this.closeLeighHighUI();
            });
            
            const extId = newBtn.getAttribute('data-tool');
            const mac = this.logic.otherBuildings.find(b => b.id === extId);
            if (mac) {
                newBtn.addEventListener('mouseenter', (e) => {
                    const tooltip = document.getElementById('machine-tooltip');
                    document.getElementById('mt-name').textContent = mac.name;
                    document.getElementById('mt-desc').textContent = mac.desc || '';
                    document.getElementById('mt-size').textContent = mac.size || '1×1';
                    document.getElementById('mt-cost').textContent = mac.cost;
                    
                    tooltip.style.display = 'block';
                    tooltip.style.bottom = 'auto';
                    
                    const rect = newBtn.getBoundingClientRect();
                    tooltip.style.left = `${rect.left}px`;
                    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10}px`;
                });
                newBtn.addEventListener('mouseleave', () => {
                    document.getElementById('machine-tooltip').style.display = 'none';
                });
            }
        });
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
        // Update Inventory UI
        const resources = ['phones', 'iron', 'copper', 'coal', 'gold', 'water', 'poop', 'ironIngot', 'copperIngot', 'ironPlate', 'ironRod', 'copperWire', 'frame', 'panel'];
        for (const res of resources) {
            const el = document.getElementById(`res-${res}`);
            if (el) {
                let key = res;
                if (res === 'phones') key = 'confiscatedPhones';
                
                if (el.parentElement.dataset.showDerivative === 'true') {
                    const rate = this._rates[res] || 0;
                    const rounded = Math.round(rate);
                    const sign = rounded >= 0 ? '+' : '';
                    const color = rounded > 0 ? '#5f5' : rounded < 0 ? '#f55' : '#aaa';
                    el.innerHTML = `<span style="color:${color}; font-family:'Courier New',monospace; font-weight:bold;">${sign}${rounded}/s</span>`;
                } else {
                    el.textContent = Math.floor(this.logic.inventory[key] || 0);
                }
            }
        }
        
        // Update Goal UI
        const subtitle = document.getElementById('goal-subtitle');
        const reqDiv = document.getElementById('goal-requirements');
        
        // Re-populate machines menu if any machine was just unlocked
        let updatedLocks = false;
        this.logic.otherBuildings.forEach(mac => {
            const btn = document.querySelector(`.tool-btn[data-tool="${mac.id}"]`);
            if (btn && mac.unlocked && btn.classList.contains('locked')) {
                updatedLocks = true;
            }
        });
        if (updatedLocks) {
            this.populateMachineSubmenu();
        }
        
        const buildGoalBar = (label, current, max) => {
            const percent = Math.min(100, Math.max(0, (current / max) * 100));
            const isDone = current >= max;
            const barColor = isDone ? 'rgba(46, 204, 113, 0.8)' : 'rgba(230, 126, 34, 0.8)';
            return `
                <div style="position: relative; width: 100%; height: 16px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15); border-radius: 2px; overflow: hidden; margin-bottom: 3px; display: flex; align-items: center; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);">
                    <div style="position: absolute; left: 0; top: 0; height: 100%; width: ${percent}%; background: ${barColor}; transition: width 0.2s; box-shadow: 0 0 5px ${barColor};"></div>
                    <div style="position: absolute; left: 4px; top: 0; height: 100%; display: flex; align-items: center; z-index: 2; font-size: 0.8em; font-weight: bold; text-shadow: 1px 1px 2px #000; color: #fff;">${label}</div>
                    <div style="position: absolute; right: 4px; top: 0; height: 100%; display: flex; align-items: center; z-index: 2; font-size: 0.8em; font-family: monospace; font-weight: bold; text-shadow: 1px 1px 2px #000; color: #fff;">${current}/${max}</div>
                </div>
            `;
        };

        if (this.logic.currentQuest === 1) {
            subtitle.textContent = "Unlock Constructor";
            const i1 = Math.min(100, Math.floor(this.logic.inventory.ironIngot));
            const i2 = Math.min(100, Math.floor(this.logic.inventory.copperIngot));
            reqDiv.innerHTML = buildGoalBar('Iron Ingots', i1, 100) + buildGoalBar('Copper Ingots', i2, 100);
        } else if (this.logic.currentQuest === 2) {
            subtitle.textContent = "Unlock Big Constructor";
            const i1 = Math.min(25, Math.floor(this.logic.inventory.ironPlate));
            const i2 = Math.min(25, Math.floor(this.logic.inventory.ironRod));
            reqDiv.innerHTML = buildGoalBar('Iron Plates', i1, 25) + buildGoalBar('Iron Rods', i2, 25);
        } else if (this.logic.currentQuest === 3) {
            subtitle.textContent = "Deliver Panels";
            const i1 = Math.min(15, Math.floor(this.logic.inventory.panel));
            reqDiv.innerHTML = buildGoalBar('Panels', i1, 15);
        }
        
        const launchBtn = document.getElementById('btn-launch-rocket');
        if (launchBtn) {
            if (this.logic.isCurrentQuestReady() && !this.app.isLaunchingRockets) {
                launchBtn.style.display = 'block';
                reqDiv.style.display = 'none';
            } else {
                launchBtn.style.display = 'none';
                reqDiv.style.display = 'block';
            }
        }
        
        // Update Recipe Progress Bar and Buffer Status
        const bufferStatusEl = document.getElementById('recipe-buffer-status');
        if (this.selectedBuilding) {
            if (this.selectedBuilding.activeRecipe) {
                const recipeData = this.logic.recipes[this.selectedBuilding.activeRecipe];
                let percent = 0;
                if (this.selectedBuilding.isWorking && recipeData && recipeData.time > 0) {
                    percent = Math.min(100, Math.max(0, (this.selectedBuilding.progress / recipeData.time) * 100));
                }
                document.getElementById('recipe-progress-bar').style.width = percent + '%';
            } else {
                document.getElementById('recipe-progress-bar').style.width = '0%';
            }

            if (bufferStatusEl) {
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
                
                bufferStatusEl.innerHTML = html;
            }
        } else {
            document.getElementById('recipe-progress-bar').style.width = '0%';
            if (bufferStatusEl) bufferStatusEl.textContent = '';
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
            
            // Extract the resource key from the id (e.g. "res-iron" -> "iron")
            const resId = valueEl.id.replace('res-', '');
            
            item.addEventListener('mouseenter', (e) => {
                if (window.isMobile) return;
                const rate = this._rates[resId] || 0;
                const rounded = Math.round(rate);
                const sign = rounded >= 0 ? '+' : '';
                const color = rounded > 0 ? '#5f5' : rounded < 0 ? '#f55' : '#aaa';
                
                this._rateTooltip.innerHTML = `<span style="color:${color}; font-family:'Courier New',monospace; font-weight:bold;">${sign}${rounded}/s</span>`;
                this._rateTooltip.style.display = 'block';
                
                const rect = item.getBoundingClientRect();
                this._rateTooltip.style.left = `${rect.right + 8}px`;
                this._rateTooltip.style.top = `${rect.top}px`;
            });
            
            item.addEventListener('mousemove', (e) => {
                if (window.isMobile) return;
                const rate = this._rates[resId] || 0;
                const rounded = Math.round(rate);
                const sign = rounded >= 0 ? '+' : '';
                const color = rounded > 0 ? '#5f5' : rounded < 0 ? '#f55' : '#aaa';
                this._rateTooltip.innerHTML = `<span style="color:${color}; font-family:'Courier New',monospace; font-weight:bold;">${sign}${rounded}/s</span>`;
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
        
        this.updateDisplay();
        this.updateLeighHighProgress();
    }
}
