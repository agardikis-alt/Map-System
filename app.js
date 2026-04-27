        // Close modal on outside click
        document.getElementById('edit-modal').addEventListener('click', (e) => {
            if (e.target.id === 'edit-modal') {
                this.closeModal();
            }
        });
    }

    // ===== BOOTH POSITION EDITOR =====

    togglePositionMode() {
        this.positionMode = !this.positionMode;
        const btn = document.getElementById('btn-position-mode');
        
        if (this.positionMode) {
            btn.textContent = 'Exit Position Editor';
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
            this.enablePositionEditing();
            this.showNotification('Position editor ON — drag booths to move, drag edges to resize. Export when done.');
            this.showPositionToolbar();
        } else {
            btn.textContent = 'Edit Booth Positions';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            this.disablePositionEditing();
            this.hidePositionToolbar();
            this.showNotification('Position editor OFF');
        }
    }

    showPositionToolbar() {
        let toolbar = document.getElementById('position-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'position-toolbar';
            toolbar.style.cssText = `
                position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
                background: #1565C0; color: white; padding: 10px 20px;
                display: flex; align-items: center; justify-content: space-between;
                font-family: Arial, sans-serif; font-size: 14px;
                box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(toolbar);
        }
        toolbar.innerHTML = `
            <div>
                <strong>POSITION EDITOR</strong> — Drag to move | Orange corner to resize | Green dot to rotate
                <span id="pos-status" style="margin-left: 16px; opacity: 0.8;"></span>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="btn-draw-new-booth" style="background: #4CAF50; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size:13px;">+ Draw Booth</button>
                <button id="btn-rename-selected" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.4); padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size:13px;">Rename</button>
                <button id="btn-delete-selected" style="background: #F44336; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size:13px;">Delete</button>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="btn-export-svg" style="background: #FFD54F; color: #333; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    Export SVG
                </button>
                <button id="btn-exit-position" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.4); padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    Done
                </button>
            </div>
        `;
        
        toolbar.querySelector('#btn-export-svg').addEventListener('click', () => this.exportCorrectedSVG());
        toolbar.querySelector('#btn-exit-position').addEventListener('click', () => this.togglePositionMode());
        // V2 toolbar buttons
        toolbar.querySelector('#btn-draw-new-booth') && toolbar.querySelector('#btn-draw-new-booth').addEventListener('click', () => this._toggleDrawBoothMode());
        toolbar.querySelector('#btn-rename-selected') && toolbar.querySelector('#btn-rename-selected').addEventListener('click', () => this._promptRenameBooth());
        toolbar.querySelector('#btn-delete-selected') && toolbar.querySelector('#btn-delete-selected').addEventListener('click', () => this._deleteSelectedBooth());
        toolbar.style.display = 'flex';
    }

    hidePositionToolbar() {
        const toolbar = document.getElementById('position-toolbar');
        if (toolbar) toolbar.style.display = 'none';
    }

    enablePositionEditing() {
        const svg = document.querySelector('#map-content svg');
        if (!svg) return;

        this._posState = { dragging: null, resizing: null, startX: 0, startY: 0, startRect: {} };
        
        // Make all booths visually editable
        const booths = svg.querySelectorAll('.booth');
        booths.forEach(booth => {
            if (!booth.id) return;
            
            // Add visible outline so you can see the clickable regions
            booth.style.stroke = 'rgba(21, 101, 192, 0.6)';
            booth.style.strokeWidth = '1.5';
            booth.style.strokeDasharray = '4,2';
            booth.style.fill = 'rgba(21, 101, 192, 0.05)';
            booth.style.cursor = 'move';

            // Add resize handle (bottom-right corner)
            const x = parseFloat(booth.getAttribute('x')) || 0;
            const y = parseFloat(booth.getAttribute('y')) || 0;
            const w = parseFloat(booth.getAttribute('width')) || 30;
            const h = parseFloat(booth.getAttribute('height')) || 30;

            const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            handle.setAttribute('x', x + w - 6);
            handle.setAttribute('y', y + h - 6);
            handle.setAttribute('width', 8);
            handle.setAttribute('height', 8);
            handle.setAttribute('fill', '#FF5722');
            handle.setAttribute('stroke', 'white');
            handle.setAttribute('stroke-width', '1');
            handle.style.cursor = 'nwse-resize';
            handle.classList.add('resize-handle');
            handle.dataset.boothId = booth.id;
            
            // Copy transform if present
            const transform = booth.getAttribute('transform');
            if (transform) handle.setAttribute('transform', transform);
            
            svg.appendChild(handle);

            // Add rotation handle (green circle, top-center)
            const rotHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            rotHandle.setAttribute('cx', x + w / 2);
            rotHandle.setAttribute('cy', y - 12);
            rotHandle.setAttribute('r', 5);
            rotHandle.setAttribute('fill', '#4CAF50');
            rotHandle.setAttribute('stroke', 'white');
            rotHandle.setAttribute('stroke-width', '1.5');
            rotHandle.style.cursor = 'grab';
            rotHandle.classList.add('rotate-handle');
            rotHandle.dataset.boothId = booth.id;
            if (transform) rotHandle.setAttribute('transform', transform);
            svg.appendChild(rotHandle);
        });

        // SVG coordinate helper — getScreenCTM works perfectly with viewBox zoom (no CSS transforms)
        this._getSVGCoords = (e) => {
            const svg = document.querySelector('#map-content svg');
            if (!svg) return { x: 0, y: 0 };
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) return { x: 0, y: 0 };
            const svgPt = pt.matrixTransform(ctm.inverse());
            return { x: svgPt.x, y: svgPt.y };
        };

        // Helper to reposition all handles for a booth
        this._updateHandles = (boothEl) => {
            const x = parseFloat(boothEl.getAttribute('x')) || 0;
            const y = parseFloat(boothEl.getAttribute('y')) || 0;
            const w = parseFloat(boothEl.getAttribute('width')) || 30;
            const h = parseFloat(boothEl.getAttribute('height')) || 30;
            const transform = boothEl.getAttribute('transform') || '';

            const resHandle = document.querySelector(`.resize-handle[data-booth-id="${boothEl.id}"]`);
            if (resHandle) {
                resHandle.setAttribute('x', x + w - 6);
                resHandle.setAttribute('y', y + h - 6);
                resHandle.setAttribute('transform', transform);
            }
            const rotHandle = document.querySelector(`.rotate-handle[data-booth-id="${boothEl.id}"]`);
            if (rotHandle) {
                rotHandle.setAttribute('cx', x + w / 2);
                rotHandle.setAttribute('cy', y - 12);
                rotHandle.setAttribute('transform', transform);
            }
        };

        // Mouse handlers
        this._onPosMouseDown = (e) => {
            const target = e.target;
            const svg = document.querySelector('#map-content svg');
            const pt = this._getSVGCoords(e);

            if (target.classList.contains('rotate-handle')) {
                // Start rotation
                const boothEl = document.getElementById(target.dataset.boothId);
                if (!boothEl) return;
                e.preventDefault();
                e.stopPropagation();
                const bx = parseFloat(boothEl.getAttribute('x')) || 0;
                const by = parseFloat(boothEl.getAttribute('y')) || 0;
                const bw = parseFloat(boothEl.getAttribute('width')) || 30;
                const bh = parseFloat(boothEl.getAttribute('height')) || 30;
                const cx = bx + bw / 2;
                const cy = by + bh / 2;
                // Parse current rotation
                const curTransform = boothEl.getAttribute('transform') || '';
                const rotMatch = curTransform.match(/rotate\(\s*([-\d.]+)/);
                const curAngle = rotMatch ? parseFloat(rotMatch[1]) : 0;
                this._posState.rotating = boothEl;
                this._posState.rotHandle = target;
                this._posState.rotCenter = { x: cx, y: cy };
                this._posState.rotStartAngle = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
                this._posState.rotBaseAngle = curAngle;
            } else if (target.classList.contains('resize-handle')) {
                // Start resize
                const boothEl = document.getElementById(target.dataset.boothId);
                if (!boothEl) return;
                e.preventDefault();
                e.stopPropagation();
                this._posState.resizing = boothEl;
                this._posState.handle = target;
                this._posState.startX = pt.x;
                this._posState.startY = pt.y;
                this._posState.startRect = {
                    x: parseFloat(boothEl.getAttribute('x')),
                    y: parseFloat(boothEl.getAttribute('y')),
                    w: parseFloat(boothEl.getAttribute('width')),
                    h: parseFloat(boothEl.getAttribute('height'))
                };
            } else if (target.classList.contains('booth') && target.id) {
                // Start drag
                e.preventDefault();
                e.stopPropagation();
                this._selectedBoothEl = target; // V2: track selected booth
                this._updatePosStatus();
                this._posState.dragging = target;
                this._posState.startX = pt.x;
                this._posState.startY = pt.y;
                this._posState.startRect = {
                    x: parseFloat(target.getAttribute('x')),
                    y: parseFloat(target.getAttribute('y')),
                    w: parseFloat(target.getAttribute('width')),
                    h: parseFloat(target.getAttribute('height'))
                };
                target.style.opacity = '0.7';
            }
        };

        this._onPosMouseMove = (e) => {
            const state = this._posState;
            if (!state.dragging && !state.resizing && !state.rotating) return;
            
            const pt = this._getSVGCoords(e);
            const dx = pt.x - state.startX;
            const dy = pt.y - state.startY;

            if (state.rotating) {
                const cx = state.rotCenter.x;
                const cy = state.rotCenter.y;
                const currentAngle = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
                let newAngle = state.rotBaseAngle + (currentAngle - state.rotStartAngle);
                // Snap to 5-degree increments when holding Shift
                if (e.shiftKey) newAngle = Math.round(newAngle / 5) * 5;
                const el = state.rotating;
                el.setAttribute('transform', `rotate(${newAngle.toFixed(1)}, ${cx}, ${cy})`);
                this._updateHandles(el);
                this.updatePositionStatus(el.id, parseFloat(el.getAttribute('x')), parseFloat(el.getAttribute('y')), parseFloat(el.getAttribute('width')), parseFloat(el.getAttribute('height')), newAngle);
                return;
            }

            if (state.dragging) {
                const el = state.dragging;
                const newX = state.startRect.x + dx;
                const newY = state.startRect.y + dy;
                el.setAttribute('x', newX);
                el.setAttribute('y', newY);
                this._updateHandles(el);
                this.updatePositionStatus(el.id, newX, newY, state.startRect.w, state.startRect.h);
            }

            if (state.resizing) {
                const el = state.resizing;
                const newW = Math.max(10, state.startRect.w + dx);
                const newH = Math.max(10, state.startRect.h + dy);
                el.setAttribute('width', newW);
                el.setAttribute('height', newH);
                this._updateHandles(el);
                this.updatePositionStatus(el.id, state.startRect.x, state.startRect.y, newW, newH);
            }
        };

        this._onPosMouseUp = (e) => {
            const state = this._posState;
            let changed = false;
            if (state.dragging) {
                state.dragging.style.opacity = '';
                state.dragging = null;
                changed = true;
            }
            if (state.resizing) {
                state.resizing = null;
                state.handle = null;
                changed = true;
            }
            if (state.rotating) {
                state.rotating = null;
                state.rotHandle = null;
                changed = true;
            }
            // Auto-save after every edit
            if (changed) {
                this.saveSvgToStorage(this.currentEvent, false);
            }
        };

        svg.addEventListener('mousedown', this._onPosMouseDown);
        document.addEventListener('mousemove', this._onPosMouseMove);
        document.addEventListener('mouseup', this._onPosMouseUp);
    }

    updatePositionStatus(id, x, y, w, h, angle) {
        const status = document.getElementById('pos-status');
        if (status) {
            const boothId = id.replace('booth-', '');
            let info = `Booth ${boothId}: x=${Math.round(x)} y=${Math.round(y)} w=${Math.round(w)} h=${Math.round(h)}`;
            if (angle !== undefined) info += ` rot=${Math.round(angle)}°`;
            status.textContent = info;
        }
    }

    disablePositionEditing() {
        const svg = document.querySelector('#map-content svg');
        if (!svg) return;

        // Remove event listeners
        if (this._onPosMouseDown) svg.removeEventListener('mousedown', this._onPosMouseDown);
        if (this._onPosMouseMove) document.removeEventListener('mousemove', this._onPosMouseMove);
        if (this._onPosMouseUp) document.removeEventListener('mouseup', this._onPosMouseUp);

        // Remove resize handles
        svg.querySelectorAll('.resize-handle').forEach(h => h.remove());
        svg.querySelectorAll('.rotate-handle').forEach(h => h.remove());

        // Clear edit-mode visual styles from all booths before saving so
        // localStorage doesn't carry dashed borders / blue fills into normal view
        svg.querySelectorAll('.booth').forEach(b => {
            b.style.strokeDasharray = '';
            b.style.cursor = '';
            b.style.opacity = '';
        });

        // V2: Auto-save SVG positions to localStorage (no GitHub upload needed)
        this.saveSvgToStorage(this.currentEvent, false); // silent save

        // Restore booth appearance
        this.applyBoothColors();
        this.positionMode = false;

        // Exit draw mode if active
        if (this.drawBoothMode) this._exitDrawBoothMode();
    }

    exportCorrectedSVG() {
        const svg = document.querySelector('#map-content svg');
        if (!svg) {
            this.showNotification('No SVG map loaded');
            return;
        }

        // Remove resize handles before export
        const handles = svg.querySelectorAll('.resize-handle');
        handles.forEach(h => h.remove());

        // Reset inline styles that were added for editing visibility
        svg.querySelectorAll('.booth').forEach(b => {
            b.style.cursor = '';
            b.style.opacity = '';
            b.style.strokeDasharray = '';
            // Keep the repositioned x/y/width/height attributes — that's the whole point
        });

        // Get SVG source
        const serializer = new XMLSerializer();
        let svgStr = serializer.serializeToString(svg);
        
        // Clean up: restore relative image paths for the SVG file context
        svgStr = svgStr.replace(/href="\.\/maps\//g, 'href="');

        // Add XML declaration
        svgStr = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr;

        // Download
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Name based on current map
        const config = this.eventsConfig[this.currentEvent];
        const mapName = config && config.mapFile ? config.mapFile.split('/').pop().split('?')[0] : 'map.svg';
        a.download = mapName;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification(`Exported corrected ${mapName} — upload this to your GitHub maps/ folder`);
        
        // Re-enable editing visuals
        this.enablePositionEditing();
    }

    fitMapToViewport() {
        const svg = document.querySelector('#map-content svg');
        if (!svg) return;
        // Clear any CSS transforms
        svg.style.transform = '';
        const mapContent = document.getElementById('map-content');
        if (mapContent) mapContent.style.transform = '';
        // Reset to natural viewBox
        if (this._originalViewBox) {
            const vb = this._originalViewBox;
            svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
            this._vbX = vb.x; this._vbY = vb.y;
            this._vbW = vb.w; this._vbH = vb.h;
        }
        this._updateZoomDisplay();
    }

    setupMapZoom() {
        const mapContainer = document.querySelector('.map-container');
        if (!mapContainer) return;

        this._isPanning = false;

        // Initialize viewBox tracking after a short delay (SVG needs to load)
        setTimeout(() => this._initViewBox(), 500);

        // Trackpad/mouse: two-finger scroll = pan, pinch = zoom
        mapContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const svg = document.querySelector('#map-content svg');
            if (!svg || !this._originalViewBox) return;

            if (e.ctrlKey) {
                // Pinch-to-zoom — zoom toward cursor
                const zoomFactor = Math.abs(e.deltaY) < 10 ? 0.015 : 0.06;
                const zoomDir = e.deltaY > 0 ? 1 + zoomFactor : 1 - zoomFactor;
                // Get cursor position in SVG space
                const rect = svg.getBoundingClientRect();
                const mx = (e.clientX - rect.left) / rect.width;
                const my = (e.clientY - rect.top) / rect.height;
                // Zoom viewBox around cursor point
                const newW = this._vbW * zoomDir;
                const newH = this._vbH * zoomDir;
                // Clamp zoom (don't zoom in more than 10x or out more than 2x)
                const orig = this._originalViewBox;
                if (newW < orig.w / 10 || newW > orig.w * 2) return;
                this._vbX += (this._vbW - newW) * mx;
                this._vbY += (this._vbH - newH) * my;
                this._vbW = newW;
                this._vbH = newH;
                this._applyViewBox();
            } else {
                // Normal scroll = pan
                const panSpeed = this._vbW / 800;
                this._vbX += e.deltaX * panSpeed;
                this._vbY += e.deltaY * panSpeed;
                this._applyViewBox();
            }
        }, { passive: false });

        // Right-click drag to pan
        mapContainer.addEventListener('contextmenu', (e) => e.preventDefault());
        mapContainer.addEventListener('mousedown', (e) => {
            if (e.button === 2 || e.button === 1) {
                e.preventDefault();
                this._isPanning = true;
                this._panStartMouse = { x: e.clientX, y: e.clientY };
                this._panStartVB = { x: this._vbX, y: this._vbY };
                mapContainer.style.cursor = 'grabbing';
            }
        });
        document.addEventListener('mousemove', (e) => {
            if (!this._isPanning) return;
            const svg = document.querySelector('#map-content svg');
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            // Convert pixel movement to viewBox movement
            const scaleX = this._vbW / rect.width;
            const scaleY = this._vbH / rect.height;
            this._vbX = this._panStartVB.x - (e.clientX - this._panStartMouse.x) * scaleX;
            this._vbY = this._panStartVB.y - (e.clientY - this._panStartMouse.y) * scaleY;
            this._applyViewBox();
        });
        document.addEventListener('mouseup', () => {
            if (this._isPanning) {
                this._isPanning = false;
                const mapContainer = document.querySelector('.map-container');
                if (mapContainer) mapContainer.style.cursor = '';
            }
        });

        // Zoom controls
        const controls = document.createElement('div');
        controls.id = 'map-zoom-controls';
        controls.style.cssText = `
            position: absolute; bottom: 16px; right: 16px; z-index: 50;
            display: flex; flex-direction: column; gap: 4px;
            background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            padding: 4px; font-family: Arial, sans-serif;
        `;
        controls.innerHTML = `
            <button id="zoom-in" style="width:36px;height:36px;border:none;background:none;font-size:20px;cursor:pointer;border-radius:4px;">+</button>
            <button id="zoom-reset" style="width:36px;height:28px;border:none;background:none;font-size:11px;cursor:pointer;border-radius:4px;color:#757575;" title="Reset zoom">100%</button>
            <button id="zoom-out" style="width:36px;height:36px;border:none;background:none;font-size:20px;cursor:pointer;border-radius:4px;">−</button>
        `;
        mapContainer.style.position = 'relative';
        mapContainer.appendChild(controls);
        controls.querySelector('#zoom-in').addEventListener('click', () => {
            if (!this._originalViewBox) return;
            const cx = this._vbX + this._vbW / 2;
            const cy = this._vbY + this._vbH / 2;
            this._vbW *= 0.75; this._vbH *= 0.75;
            this._vbX = cx - this._vbW / 2;
            this._vbY = cy - this._vbH / 2;
            this._applyViewBox();
        });
        controls.querySelector('#zoom-out').addEventListener('click', () => {
            if (!this._originalViewBox) return;
            const cx = this._vbX + this._vbW / 2;
            const cy = this._vbY + this._vbH / 2;
            this._vbW *= 1.33; this._vbH *= 1.33;
            // Clamp to max 2x original
            const orig = this._originalViewBox;
            if (this._vbW > orig.w * 2) { this._vbW = orig.w * 2; this._vbH = orig.h * 2; }
            this._vbX = cx - this._vbW / 2;
            this._vbY = cy - this._vbH / 2;
            this._applyViewBox();
        });
        controls.querySelector('#zoom-reset').addEventListener('click', () => this.fitMapToViewport());
    }

    _initViewBox() {
        const svg = document.querySelector('#map-content svg');
        if (!svg) return;
        // Clear any CSS transforms
        svg.style.transform = '';
        const mapContent = document.getElementById('map-content');
        if (mapContent) mapContent.style.transform = '';
        // Read or set initial viewBox
        const vb = svg.viewBox.baseVal;
        if (vb && vb.width > 0) {
            this._originalViewBox = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
        } else {
            // Fallback: use SVG width/height attributes
            const w = parseFloat(svg.getAttribute('width')) || 1632;
            const h = parseFloat(svg.getAttribute('height')) || 1056;
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            this._originalViewBox = { x: 0, y: 0, w, h };
        }
        this._vbX = this._originalViewBox.x;
        this._vbY = this._originalViewBox.y;
        this._vbW = this._originalViewBox.w;
        this._vbH = this._originalViewBox.h;
        this._updateZoomDisplay();
    }

    _applyViewBox() {
        const svg = document.querySelector('#map-content svg');
        if (!svg) return;
        svg.setAttribute('viewBox', `${this._vbX} ${this._vbY} ${this._vbW} ${this._vbH}`);
        this._updateZoomDisplay();
    }

    _updateZoomDisplay() {
        const resetBtn = document.getElementById('zoom-reset');
        if (resetBtn && this._originalViewBox) {
            const zoom = Math.round((this._originalViewBox.w / (this._vbW || this._originalViewBox.w)) * 100);
            resetBtn.textContent = `${zoom}%`;
        }
    }

    // ===================================================
    // V2: SVG PERSISTENCE
    // ===================================================

    loadSvgFromStorage(eventId) {
        try { return localStorage.getItem(`boothmap_svg_${eventId}`); } catch(e) { return null; }
    }

    saveSvgToStorage(eventId, notify = true) {
        try {
            const svg = document.querySelector('#map-content svg');
            if (!svg) return false;
            // Strip editing artifacts
            const clone = svg.cloneNode(true);
            clone.querySelectorAll('.resize-handle, .draw-preview').forEach(el => el.remove());
            clone.querySelectorAll('.booth').forEach(b => {
                b.style.cursor = '';
                b.style.strokeDasharray = '';
                // Keep fill/stroke/position changes — those are intentional
            });
            localStorage.setItem(`boothmap_svg_${eventId}`, clone.outerHTML);
            if (notify) this.showNotification('Map saved to browser');
            return true;
        } catch(e) { this.showError('Save failed: ' + e.message); return false; }
    }

    clearSvgFromStorage(eventId) {
        try { localStorage.removeItem(`boothmap_svg_${eventId}`); } catch(e) {}
    }

    // ===================================================
    // V2: CUSTOM EVENTS
    // ===================================================

    loadCustomEvents() {
        try {
            const raw = localStorage.getItem('boothmap_custom_events');
            if (!raw) return;
            const customs = JSON.parse(raw);
            Object.entries(customs).forEach(([id, cfg]) => {
                this.eventsConfig[id] = cfg;
                const saved = this.loadFromLocalStorage(id);
                this.eventsData[id] = saved || { eventId: id, eventName: cfg.name, booths: {} };
                this.originalEventsData[id] = JSON.parse(JSON.stringify(this.eventsData[id]));
                this._addEventOptionToDropdown(id, cfg.name);
            });
        } catch(e) { console.error('loadCustomEvents error:', e); }
    }

    _getCustomEvents() {
        try { return JSON.parse(localStorage.getItem('boothmap_custom_events') || '{}'); } catch(e) { return {}; }
    }

    _saveCustomEvents(obj) {
        try { localStorage.setItem('boothmap_custom_events', JSON.stringify(obj)); } catch(e) {}
    }

    _addEventOptionToDropdown(eventId, name) {
        const select = document.getElementById('event-select');
        if (!select || select.querySelector(`option[value="${CSS.escape(eventId)}"]`)) return;
        const opt = document.createElement('option');
        opt.value = eventId;
        opt.textContent = name;
        opt.dataset.custom = '1';
        select.appendChild(opt);
    }

    _showUploadMapDialog() {
        const modal = document.getElementById('upload-map-modal');
        if (modal) {
            document.getElementById('upload-event-name').value = '';
            document.getElementById('upload-map-file').value = '';
            modal.classList.add('active');
        }
    }

    async _confirmUploadMap() {
        const nameInput = document.getElementById('upload-event-name');
        const fileInput = document.getElementById('upload-map-file');
        const name = nameInput.value.trim();
        if (!name) { alert('Please enter an event name.'); return; }
        if (!fileInput.files || !fileInput.files.length) { alert('Please select an SVG file.'); return; }

        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            const svgContent = e.target.result;
            if (!svgContent.includes('<svg') && !svgContent.includes('<SVG')) {
                alert('File does not appear to be a valid SVG.'); return;
            }
            const eventId = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').slice(0,20) + '_' + Date.now().toString(36);
            // Save SVG to localStorage
            localStorage.setItem(`boothmap_svg_${eventId}`, svgContent);
            // Save event config
            const customs = this._getCustomEvents();
            customs[eventId] = { id: eventId, name, mapFile: null, dataFile: null };
            this._saveCustomEvents(customs);
            // Register in memory
            this.eventsConfig[eventId] = customs[eventId];
            this.eventsData[eventId] = { eventId, eventName: name, booths: {} };
            this.originalEventsData[eventId] = { eventId, eventName: name, booths: {} };
            this._addEventOptionToDropdown(eventId, name);
            document.getElementById('upload-map-modal').classList.remove('active');
            // Switch to new event
            document.getElementById('event-select').value = eventId;
            this.loadEvent(eventId);
            this._updateCustomEventUI();
            this.showNotification(`"${name}" uploaded. Now enter position mode to assign booth IDs.`);
        };
        reader.readAsText(file);
    }

    _deleteCustomEvent(eventId) {
        if (!eventId || !eventId.startsWith('custom_')) {
            this.showNotification('Built-in events cannot be deleted.');
            return;
        }
        const name = this.eventsConfig[eventId]?.name || eventId;
        if (!confirm(`Delete event "${name}"? All booth data and map edits will be permanently removed.`)) return;
        // Clear storage
        this.clearSvgFromStorage(eventId);
        localStorage.removeItem(`boothmap_${eventId}`);
        // Remove from custom events registry
        const customs = this._getCustomEvents();
        delete customs[eventId];
        this._saveCustomEvents(customs);
        // Remove from memory
        delete this.eventsData[eventId];
        delete this.originalEventsData[eventId];
        delete this.eventsConfig[eventId];
        // Remove from dropdown
        const opt = document.querySelector(`#event-select option[value="${eventId}"]`);
        if (opt) opt.remove();
        // Switch to first available event
        const select = document.getElementById('event-select');
        if (select.options.length > 0) {
            select.selectedIndex = 0;
            this.loadEvent(select.value);
        }
        this._updateCustomEventUI();
        this.showNotification(`Event "${name}" deleted.`);
    }

    _updateCustomEventUI() {
        const eventId = this.currentEvent;
        const btn = document.getElementById('btn-delete-event');
        if (btn) btn.style.display = eventId && eventId.startsWith('custom_') ? 'block' : 'none';
    }

    // ===================================================
    // V2: DRAW NEW BOOTH MODE
    // ===================================================

    _toggleDrawBoothMode() {
        if (this.drawBoothMode) {
            this._exitDrawBoothMode();
        } else {
            this._enterDrawBoothMode();
        }
    }

    _enterDrawBoothMode() {
        this.drawBoothMode = true;
        const svg = document.querySelector('#map-content svg');
        if (!svg) return;
        svg.style.cursor = 'crosshair';

        const btn = document.getElementById('btn-draw-new-booth');
        if (btn) { btn.textContent = '✕ Cancel Draw'; btn.style.background = '#FF9800'; }

        // Remove old draw listeners
        this._cleanupDrawListeners(svg);

        // SVG coordinate helper (may already exist from position mode)
        const getSVGCoords = (e) => {
            const pt = svg.createSVGPoint();
            pt.x = e.clientX; pt.y = e.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) return { x: 0, y: 0 };
            return pt.matrixTransform(ctm.inverse());
        };

        this._drawMouseDown = (e) => {
            if (!this.drawBoothMode) return;
            if (e.target.classList.contains('resize-handle')) return;
            const pt = getSVGCoords(e);
            this._drawStart = pt;
            // Create preview rect
            if (this._drawPreviewRect) this._drawPreviewRect.remove();
            const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
            r.setAttribute('x', pt.x); r.setAttribute('y', pt.y);
            r.setAttribute('width', 1); r.setAttribute('height', 1);
            r.setAttribute('fill', 'rgba(76,175,80,0.2)');
            r.setAttribute('stroke', '#4CAF50'); r.setAttribute('stroke-width', '2');
            r.setAttribute('stroke-dasharray', '5,3');
            r.classList.add('draw-preview');
            r.style.pointerEvents = 'none';
            svg.appendChild(r);
            this._drawPreviewRect = r;
            e.preventDefault(); e.stopPropagation();
        };

        this._drawMouseMove = (e) => {
            if (!this.drawBoothMode || !this._drawStart || !this._drawPreviewRect) return;
            const pt = getSVGCoords(e);
            const x = Math.min(pt.x, this._drawStart.x);
            const y = Math.min(pt.y, this._drawStart.y);
            const w = Math.max(1, Math.abs(pt.x - this._drawStart.x));
            const h = Math.max(1, Math.abs(pt.y - this._drawStart.y));
            this._drawPreviewRect.setAttribute('x', x);
            this._drawPreviewRect.setAttribute('y', y);
            this._drawPreviewRect.setAttribute('width', w);
            this._drawPreviewRect.setAttribute('height', h);
        };

        this._drawMouseUp = (e) => {
            if (!this.drawBoothMode || !this._drawStart || !this._drawPreviewRect) return;
            const pt = getSVGCoords(e);
            const x = Math.round(Math.min(pt.x, this._drawStart.x));
            const y = Math.round(Math.min(pt.y, this._drawStart.y));
            const w = Math.round(Math.abs(pt.x - this._drawStart.x));
            const h = Math.round(Math.abs(pt.y - this._drawStart.y));

            this._drawPreviewRect.remove();
            this._drawPreviewRect = null;
            this._drawStart = null;

            if (w < 6 || h < 6) return; // too small, ignore
            this._showNewBoothDialog(x, y, w, h);
            e.stopPropagation();
        };

        svg.addEventListener('mousedown', this._drawMouseDown);
        document.addEventListener('mousemove', this._drawMouseMove);
        document.addEventListener('mouseup', this._drawMouseUp);
    }

    _exitDrawBoothMode() {
        this.drawBoothMode = false;
        const svg = document.querySelector('#map-content svg');
        if (svg) {
            svg.style.cursor = '';
            this._cleanupDrawListeners(svg);
            if (this._drawPreviewRect) { this._drawPreviewRect.remove(); this._drawPreviewRect = null; }
        }
        this._drawStart = null;
        const btn = document.getElementById('btn-draw-new-booth');
        if (btn) { btn.textContent = '+ Draw Booth'; btn.style.background = '#4CAF50'; }
    }

    _cleanupDrawListeners(svg) {
        if (this._drawMouseDown) { svg.removeEventListener('mousedown', this._drawMouseDown); this._drawMouseDown = null; }
        if (this._drawMouseMove) { document.removeEventListener('mousemove', this._drawMouseMove); this._drawMouseMove = null; }
        if (this._drawMouseUp) { document.removeEventListener('mouseup', this._drawMouseUp); this._drawMouseUp = null; }
    }

    _showNewBoothDialog(x, y, w, h) {
        this._pendingBooth = { x, y, w, h };
        const modal = document.getElementById('new-booth-modal');
        if (!modal) return;
        document.getElementById('new-booth-id').value = '';
        document.getElementById('new-booth-label').value = '';
        modal.classList.add('active');
        setTimeout(() => document.getElementById('new-booth-id').focus(), 50);
    }

    _confirmNewBooth() {
        const idInput = document.getElementById('new-booth-id');
        const labelInput = document.getElementById('new-booth-label');
        const id = idInput.value.trim();
        const label = labelInput.value.trim() || id;
        if (!id) { alert('Booth ID is required.'); return; }

        const { x, y, w, h } = this._pendingBooth;
        const svg = document.querySelector('#map-content svg');
        if (!svg) return;

        // Create SVG rect
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.id = `booth-${id}`;
        rect.setAttribute('x', x); rect.setAttribute('y', y);
        rect.setAttribute('width', w); rect.setAttribute('height', h);
        rect.classList.add('booth');
        rect.style.fill = 'rgba(21,101,192,0.05)';
        rect.style.stroke = 'rgba(21,101,192,0.6)';
        rect.style.strokeWidth = '1.5';
        svg.appendChild(rect);

        // Create label text
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + w/2); text.setAttribute('y', y + h/2 + 5);
        text.setAttribute('text-anchor', 'middle');
        text.classList.add('booth-label');
        text.style.fontSize = '12px'; text.style.fill = '#212121';
        text.style.pointerEvents = 'none'; text.style.userSelect = 'none';
        text.style.fontFamily = 'sans-serif';
        text.textContent = label;
        svg.appendChild(text);

        // Add to data
        const eventData = this.eventsData[this.currentEvent];
        if (eventData) {
            eventData.booths = eventData.booths || {};
            eventData.booths[id] = {
                boothId: id, vendorName: '', businessName: '',
                vendorCategory: 'Open', boothStatus: 'open',
                boothSize: '10x10', notes: '', phone: '', email: '',
                missingItems: [], mapLabel: label,
            };
            this.saveToLocalStorage(this.currentEvent);
            this.updateStats();
        }

        // Wire up click/hover (position mode handles drag)
        rect.addEventListener('click', () => { if (!this.positionMode) this.selectBooth(id); });
        rect.addEventListener('mouseenter', (e) => this.showTooltip(e, id));
        rect.addEventListener('mouseleave', () => document.getElementById('tooltip').classList.remove('active'));
        rect.addEventListener('mousemove', (e) => this.moveTooltip(e));

        // Add resize handle for position mode if active
        if (this.positionMode) {
            const handle = document.createElementNS('http://www.w3.org/2000/svg','rect');
            handle.setAttribute('x', x+w-6); handle.setAttribute('y', y+h-6);
            handle.setAttribute('width', 8); handle.setAttribute('height', 8);
            handle.setAttribute('fill', '#FF5722'); handle.setAttribute('stroke', 'white');
            handle.setAttribute('stroke-width', '1');
            handle.style.cursor = 'nwse-resize';
            handle.classList.add('resize-handle');
            handle.dataset.boothId = rect.id;
            svg.appendChild(handle);
            rect.style.cursor = 'move';
            rect.style.strokeDasharray = '4,2';
        }

        this.saveSvgToStorage(this.currentEvent, false);
        document.getElementById('new-booth-modal').classList.remove('active');
        this._pendingBooth = null;
        this.showNotification(`Booth ${id} created`);
        this._selectedBoothEl = rect;
    }

    _closeNewBoothDialog() {
        document.getElementById('new-booth-modal').classList.remove('active');
        this._pendingBooth = null;
    }

    // ===================================================
    // V2: RENAME BOOTH
    // ===================================================

    _promptRenameBooth() {
        if (!this._selectedBoothEl) {
            this.showNotification('Click a booth to select it first.');
            return;
        }
        const boothId = this.extractBoothId(this._selectedBoothEl.id);
        const eventData = this.eventsData[this.currentEvent];
        const data = eventData?.booths?.[boothId];

        const modal = document.getElementById('rename-booth-modal');
        if (!modal) return;
        document.getElementById('rename-old-id').textContent = boothId;
        document.getElementById('rename-new-id').value = boothId;
        document.getElementById('rename-new-label').value = data?.mapLabel || boothId;
        modal.classList.add('active');
        setTimeout(() => document.getElementById('rename-new-id').focus(), 50);
    }

    _confirmRenameBooth() {
        if (!this._selectedBoothEl) return;
        const oldId = this.extractBoothId(this._selectedBoothEl.id);
        const newId = document.getElementById('rename-new-id').value.trim();
        const newLabel = document.getElementById('rename-new-label').value.trim() || newId;
        if (!newId) { alert('Booth ID is required.'); return; }
        if (newId === oldId && newLabel === (document.getElementById('rename-old-id').textContent)) {
            document.getElementById('rename-booth-modal').classList.remove('active'); return;
        }

        // Update SVG element ID
        this._selectedBoothEl.id = `booth-${newId}`;

        // Update associated label text
        const svg = document.querySelector('#map-content svg');
        if (svg) {
            // Find nearest text element by proximity
            const rx = parseFloat(this._selectedBoothEl.getAttribute('x') || 0);
            const ry = parseFloat(this._selectedBoothEl.getAttribute('y') || 0);
            const rw = parseFloat(this._selectedBoothEl.getAttribute('width') || 0);
            const rh = parseFloat(this._selectedBoothEl.getAttribute('height') || 0);
            let nearest = null, nearestDist = Infinity;
            svg.querySelectorAll('text.booth-label, text').forEach(t => {
                if (t.closest('.resize-handle')) return;
                const tx = parseFloat(t.getAttribute('x') || 0);
                const ty = parseFloat(t.getAttribute('y') || 0);
                const cx = rx + rw/2, cy = ry + rh/2;
                const dist = Math.sqrt((tx-cx)**2 + (ty-cy)**2);
                // Only consider text within ~100px of booth center and matching old text
                if (dist < 100 && dist < nearestDist && t.textContent.trim() === oldId) {
                    nearest = t; nearestDist = dist;
                }
            });
            if (nearest) nearest.textContent = newLabel;
            // Also update handle dataset
            const handle = svg.querySelector(`.resize-handle[data-booth-id="booth-${oldId}"]`);
            if (handle) handle.dataset.boothId = `booth-${newId}`;
        }

        // Update data
        const eventData = this.eventsData[this.currentEvent];
        if (eventData?.booths) {
            if (newId !== oldId) {
                if (eventData.booths[oldId]) {
                    eventData.booths[newId] = { ...eventData.booths[oldId], boothId: newId, mapLabel: newLabel };
                    delete eventData.booths[oldId];
                } else {
                    eventData.booths[newId] = {
                        boothId: newId, vendorName: '', businessName: '',
                        vendorCategory: 'Open', boothStatus: 'open',
                        boothSize: '10x10', notes: '', phone: '', email: '',
                        missingItems: [], mapLabel: newLabel,
                    };
                }
            } else if (eventData.booths[oldId]) {
                eventData.booths[oldId].mapLabel = newLabel;
            }
            this.saveToLocalStorage(this.currentEvent);
        }

        this.saveSvgToStorage(this.currentEvent, false);
        document.getElementById('rename-booth-modal').classList.remove('active');
        this.showNotification(`Booth renamed: ${oldId} → ${newId}`);
        this._updatePosStatus();
    }

    // ===================================================
    // V2: DELETE BOOTH
    // ===================================================

    _deleteSelectedBooth() {
        if (!this._selectedBoothEl) {
            this.showNotification('Click a booth to select it first.');
            return;
        }
        const boothId = this.extractBoothId(this._selectedBoothEl.id);
        if (!confirm(`Delete booth ${boothId} and all its vendor data? This cannot be undone.`)) return;

        const svg = document.querySelector('#map-content svg');

        // Remove resize handle
        if (svg) {
            const handle = svg.querySelector(`.resize-handle[data-booth-id="${this._selectedBoothEl.id}"]`);
            if (handle) handle.remove();
            // Remove label text
            const rx = parseFloat(this._selectedBoothEl.getAttribute('x') || 0);
            const ry = parseFloat(this._selectedBoothEl.getAttribute('y') || 0);
            const rw = parseFloat(this._selectedBoothEl.getAttribute('width') || 0);
            const rh = parseFloat(this._selectedBoothEl.getAttribute('height') || 0);
            svg.querySelectorAll('text.booth-label, text').forEach(t => {
                const tx = parseFloat(t.getAttribute('x') || 0);
                const ty = parseFloat(t.getAttribute('y') || 0);
                const cx = rx + rw/2, cy = ry + rh/2;
                if (Math.sqrt((tx-cx)**2+(ty-cy)**2) < 100 && t.textContent.trim() === boothId) {
                    t.remove();
                }
            });
        }

        // Remove SVG element
        this._selectedBoothEl.remove();
        this._selectedBoothEl = null;

        // Remove from data
        const eventData = this.eventsData[this.currentEvent];
        if (eventData?.booths?.[boothId]) {
            delete eventData.booths[boothId];
            this.saveToLocalStorage(this.currentEvent);
            this.updateStats();
        }

        this.saveSvgToStorage(this.currentEvent, false);
        this.showNotification(`Booth ${boothId} deleted`);
        this._updatePosStatus();
    }

    _updatePosStatus() {
        const status = document.getElementById('pos-status');
        if (status) {
            const id = this._selectedBoothEl ? this.extractBoothId(this._selectedBoothEl.id) : null;
            status.textContent = id ? `Selected: Booth ${id}` : '';
        }
    }

}

// Initialize the application
const boothMap = new BoothMapSystem();

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
