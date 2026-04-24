// ===== Vendor Booth Map System =====
// Hardened version with diagnostics, localStorage, and error handling

class BoothMapSystem {
    constructor() {
        this.currentEvent = 'offstreet';
        this.eventsData = {};
        this.originalEventsData = {}; // Store original fetched data
        this.categories = {};
        this.eventsConfig = {};
        this.currentBooth = null;
        this.editMode = false;
        this.positionMode = false;
        this.searchTerm = '';

        // V2: Shape creation / rename / delete state
        this.drawBoothMode = false;
        this._drawStart = null;
        this._drawPreviewRect = null;
        this._selectedBoothEl = null;
        this._drawMouseDown = null;
        this._drawMouseMove = null;
        this._drawMouseUp = null;
        this.categoryFilter = 'all';
        this.statusFilter = 'all';
        
        // Diagnostics state
        this.diagnostics = {
            mapLoaded: false,
            svgBoothCount: 0,
            jsonBoothCount: 0,
            matchedBooths: 0,
            unmatchedSvgBooths: [],
            unmatchedJsonBooths: [],
            loadError: null
        };

        this.init();
    }

    async init() {
        await this.loadData();
        this.loadCustomEvents();
        this.setupEventListeners();
        this.setupMapZoom();
        this.renderCategoryFilter();
        this.renderLegend();
        this.loadEvent(this.currentEvent);
    }

    async loadData() {
        try {
            // Load categories
            const categoriesRes = await fetch('./data/categories.json');
            if (!categoriesRes.ok) throw new Error(`Categories fetch failed: ${categoriesRes.status}`);
            this.categories = await categoriesRes.json();

            // Load events config
            const eventsRes = await fetch('./data/events.json');
            if (!eventsRes.ok) throw new Error(`Events config fetch failed: ${eventsRes.status}`);
            this.eventsConfig = await eventsRes.json();

            // Load all event data
            for (const [key, config] of Object.entries(this.eventsConfig)) {
                // First check localStorage for saved data
                const savedData = this.loadFromLocalStorage(key);
                if (savedData) {
                    this.eventsData[key] = savedData;
                    this.originalEventsData[key] = JSON.parse(JSON.stringify(savedData)); // Deep copy
                    console.log(`Loaded ${key} from localStorage`);
                } else {
                    // Fetch from file - normalize path
                    const dataPath = config.dataFile.startsWith('./') ? config.dataFile : './' + config.dataFile;
                    const eventRes = await fetch(dataPath);
                    if (!eventRes.ok) throw new Error(`Event ${key} fetch failed: ${eventRes.status}`);
                    const data = await eventRes.json();
                    this.eventsData[key] = data;
                    this.originalEventsData[key] = JSON.parse(JSON.stringify(data)); // Deep copy for reset
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Failed to load data: ' + error.message);
        }
    }

    // ===== LOCALSTORAGE METHODS =====
    
    loadFromLocalStorage(eventId) {
        try {
            const key = `boothmap_${eventId}`;
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('localStorage read error:', e);
            return null;
        }
    }

    saveToLocalStorage(eventId) {
        try {
            const key = `boothmap_${eventId}`;
            localStorage.setItem(key, JSON.stringify(this.eventsData[eventId]));
            this.showNotification('Changes saved automatically');
        } catch (e) {
            console.error('localStorage write error:', e);
            this.showError('Failed to save changes');
        }
    }

    resetEventToOriginal(eventId) {
        if (!this.originalEventsData[eventId]) {
            this.showError('No original data available');
            return;
        }
        
        if (confirm(`Reset ${this.eventsConfig[eventId].name} to original data? All unsaved changes will be lost.`)) {
            // Restore from original copy
            this.eventsData[eventId] = JSON.parse(JSON.stringify(this.originalEventsData[eventId]));
            
            // Clear localStorage (data + persisted SVG)
            try {
                localStorage.removeItem(`boothmap_${eventId}`);
                this.clearSvgFromStorage(eventId);
            } catch (e) {
                console.error('localStorage remove error:', e);
            }
            
            // Reload the event
            this.loadEvent(eventId);
            this.showNotification('Event reset to original data');
        }
    }

    importEventData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.eventId || !data.booths) {
                    throw new Error('Invalid event data format');
                }
                
                // Update current event
                this.eventsData[this.currentEvent] = data;
                this.saveToLocalStorage(this.currentEvent);
                this.loadEvent(this.currentEvent);
                this.showNotification('Event data imported successfully');
            } catch (err) {
                this.showError('Failed to import: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ===== EVENT & MAP LOADING =====

    loadEvent(eventId) {
        this.currentEvent = eventId;
        const eventData = this.eventsData[eventId];
        const config = this.eventsConfig[eventId];

        // Update title
        document.getElementById('event-title').textContent = config.name;
        
        // Update event selector
        document.getElementById('event-select').value = eventId;

        // Reset diagnostics
        this.diagnostics = {
            mapLoaded: false,
            svgBoothCount: 0,
            jsonBoothCount: 0,
            matchedBooths: 0,
            unmatchedSvgBooths: [],
            unmatchedJsonBooths: [],
            loadError: null
        };

        // Load SVG map
        this.loadMap(config.mapFile);

        // Update stats
        this.updateStats();

        // Clear detail panel
        this.closeDetailPanel();

        // Update diagnostics panel
        this.updateDiagnosticsPanel();
    }

    async loadMap(mapFile) {
        const mapContent = document.getElementById('map-content');

        // V2: Custom events have no mapFile — SVG lives only in localStorage
        if (!mapFile) {
            const savedSvg = this.loadSvgFromStorage(this.currentEvent);
            if (savedSvg) {
                mapContent.innerHTML = savedSvg;
                this.diagnostics.mapLoaded = true;
                this.normalizeSvgDimensions();
                this._initViewBox();
                this.setupBoothInteractions();
                this.applyBoothColors();
                this.runBoothDiagnostics();
            } else {
                mapContent.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#757575;flex-direction:column;gap:16px;">
                    <div style="font-size:48px;">🗺️</div>
                    <div style="font-size:16px;font-weight:500;">No map loaded</div>
                    <div style="font-size:13px;text-align:center;max-width:300px;">Upload an SVG map using <strong>Upload Custom Map</strong> in the sidebar to get started.</div>
                </div>`;
            }
            this.updateDiagnosticsPanel();
            return;
        }

        // Normalize path - ensure it starts with ./ but doesn't double-prefix
        const normalizedPath = mapFile.startsWith('./') ? mapFile : './' + mapFile;
        
        try {
            // V2: Check localStorage for persisted SVG first
            const savedSvg = this.loadSvgFromStorage(this.currentEvent);
            if (savedSvg) {
                mapContent.innerHTML = savedSvg;
                this.diagnostics.mapLoaded = true;
                this.normalizeSvgDimensions();
                this._initViewBox();
                this.setupBoothInteractions();
                this.applyBoothColors();
                this.runBoothDiagnostics();
                this.updateDiagnosticsPanel();
                return;
            }

            // Show loading state
            mapContent.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; min-height: 400px; color: #666;">
                    <div style="text-align: center;">
                        <div style="font-size: 24px; margin-bottom: 10px;">Loading map...</div>
                        <div style="font-size: 14px;">${normalizedPath}</div>
                    </div>
                </div>
            `;

            const response = await fetch(normalizedPath);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const svgContent = await response.text();
            
            // Check if content is actually SVG
            if (!svgContent.includes('<svg') && !svgContent.includes('<SVG')) {
                throw new Error('File is not a valid SVG');
            }
            
            // Fix relative image paths: when SVG is injected inline, 
            // image hrefs need to be relative to the page, not the SVG file.
            // Determine the folder the SVG lives in from its fetch path.
            const svgFolder = normalizedPath.substring(0, normalizedPath.lastIndexOf('/') + 1);
            const fixedSvgContent = svgContent.replace(
                /href="(?!http|data:|\/)(.*?\.(png|jpg|jpeg|gif|webp))"/gi,
                (match, filename) => `href="${svgFolder}${filename}"`
            );
            
            mapContent.innerHTML = fixedSvgContent;
            this.diagnostics.mapLoaded = true;
            
            // Ensure SVG has proper dimensions
            this.normalizeSvgDimensions();
                this._initViewBox();

            // Setup booth interactions
            this.setupBoothInteractions();

            // Apply current colors
            this.applyBoothColors();
            
            // Run diagnostics
            this.runBoothDiagnostics();
            
        } catch (error) {
            console.error('Error loading map:', error);
            this.diagnostics.loadError = error.message;
            this.diagnostics.mapLoaded = false;
            
            mapContent.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; min-height: 400px; color: #d32f2f; padding: 20px;">
                    <div style="text-align: center; max-width: 400px;">
                        <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
                        <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">Failed to load map</div>
                        <div style="font-size: 14px; color: #666; margin-bottom: 15px;">${error.message}</div>
                        <div style="font-size: 13px; color: #999; background: #f5f5f5; padding: 10px; border-radius: 4px; text-align: left;">
                            <strong>Attempted path:</strong> ${normalizedPath}<br>
                            <strong>Current event:</strong> ${this.currentEvent}<br>
                            <strong>Tip:</strong> Ensure the SVG file exists in the maps/ folder
                        </div>
                    </div>
                </div>
            `;
        }
        
        this.updateDiagnosticsPanel();
    }

    // ===== SVG NORMALIZATION =====
    
    normalizeSvgDimensions() {
        const svg = document.querySelector('#map-content svg');
        if (!svg) return;
        
        // Ensure SVG is visible and properly sized
        svg.style.display = 'block';
        svg.style.maxWidth = '100%';
        svg.style.height = 'auto';
        
        // Check for viewBox
        const hasViewBox = svg.hasAttribute('viewBox');
        const hasWidth = svg.hasAttribute('width');
        const hasHeight = svg.hasAttribute('height');
        
        if (!hasViewBox) {
            // Try to infer dimensions from content
            const bbox = svg.getBBox ? svg.getBBox() : null;
            if (bbox && bbox.width > 0 && bbox.height > 0) {
                svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
                console.log('Added viewBox from content bounds:', bbox);
            } else if (hasWidth && hasHeight) {
                const w = parseFloat(svg.getAttribute('width'));
                const h = parseFloat(svg.getAttribute('height'));
                svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
                console.log('Added viewBox from width/height attributes');
            }
        }
        
        // Ensure width/height are set for proper rendering
        if (!hasWidth) {
            const viewBox = svg.getAttribute('viewBox');
            if (viewBox) {
                const parts = viewBox.split(/\s+/);
                svg.setAttribute('width', parts[2] || '800');
            } else {
                svg.setAttribute('width', '800');
            }
        }
        
        if (!hasHeight) {
            const viewBox = svg.getAttribute('viewBox');
            if (viewBox) {
                const parts = viewBox.split(/\s+/);
                svg.setAttribute('height', parts[3] || '600');
            } else {
                svg.setAttribute('height', '600');
            }
        }
        
        console.log('SVG dimensions normalized:', {
            viewBox: svg.getAttribute('viewBox'),
            width: svg.getAttribute('width'),
            height: svg.getAttribute('height')
        });
    }

    // ===== BOOTH ID NORMALIZATION =====
    
    normalizeBoothId(rawId) {
        if (!rawId) return null;
        
        let id = String(rawId).trim();
        
        // Handle various formats:
        // booth-101, Booth-101, booth_101, 101, A1
        
        // Remove common prefixes
        id = id.replace(/^booth[_-]/i, '');
        id = id.replace(/^Booth[_-]/i, '');
        
        return id;
    }

    extractBoothId(elementId) {
        if (!elementId) return null;
        return this.normalizeBoothId(elementId);
    }

    // ===== DIAGNOSTICS =====

    runBoothDiagnostics() {
        const eventData = this.eventsData[this.currentEvent];
        const svgBooths = document.querySelectorAll('.booth:not(.map-feature)');
        
        const svgBoothIds = [];
        const jsonBoothIds = Object.keys(eventData.booths || {});
        
        svgBooths.forEach(booth => {
            const id = this.extractBoothId(booth.id);
            if (id) svgBoothIds.push(id);
        });
        
        this.diagnostics.svgBoothCount = svgBoothIds.length;
        this.diagnostics.jsonBoothCount = jsonBoothIds.length;
        
        // Find matches
        const matched = [];
        const unmatchedSvg = [];
        const unmatchedJson = [];
        
        svgBoothIds.forEach(id => {
            if (jsonBoothIds.includes(id)) {
                matched.push(id);
            } else {
                unmatchedSvg.push(id);
            }
        });
        
        jsonBoothIds.forEach(id => {
            if (!svgBoothIds.includes(id)) {
                unmatchedJson.push(id);
            }
        });
        
        this.diagnostics.matchedBooths = matched.length;
        this.diagnostics.unmatchedSvgBooths = unmatchedSvg;
        this.diagnostics.unmatchedJsonBooths = unmatchedJson;
        
        // Show warning if no booths match
        if (matched.length === 0 && svgBoothIds.length > 0 && jsonBoothIds.length > 0) {
            console.warn('No booth IDs match between SVG and JSON!');
            console.warn('SVG IDs (sample):', svgBoothIds.slice(0, 5));
            console.warn('JSON IDs (sample):', jsonBoothIds.slice(0, 5));
        }
        
        this.updateDiagnosticsPanel();
    }

    updateDiagnosticsPanel() {
        const panel = document.getElementById('diagnostics-content');
        if (!panel) return;
        
        const d = this.diagnostics;
        const config = this.eventsConfig[this.currentEvent] || {};
        const eventData = this.eventsData[this.currentEvent] || {};
        
        // Get assigned booths missing from SVG
        const assignedMissing = [];
        if (eventData.booths) {
            Object.entries(eventData.booths).forEach(([id, booth]) => {
                if (booth.boothStatus === 'assigned' && d.unmatchedJsonBooths.includes(id)) {
                    assignedMissing.push(id);
                }
            });
        }
        
        panel.innerHTML = `
            <div class="diagnostics-section">
                <div class="diagnostics-row">
                    <span class="diagnostics-label">Current Event:</span>
                    <span class="diagnostics-value">${this.currentEvent}</span>
                </div>
                <div class="diagnostics-row">
                    <span class="diagnostics-label">Map File:</span>
                    <span class="diagnostics-value">${config.mapFile || 'N/A'}</span>
                </div>
                <div class="diagnostics-row">
                    <span class="diagnostics-label">Map Loaded:</span>
                    <span class="diagnostics-value ${d.mapLoaded ? 'success' : 'error'}">${d.mapLoaded ? '✓ Yes' : '✗ No'}</span>
                </div>
                ${d.loadError ? `
                <div class="diagnostics-row">
                    <span class="diagnostics-label">Error:</span>
                    <span class="diagnostics-value error">${d.loadError}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="diagnostics-section">
                <div class="diagnostics-row">
                    <span class="diagnostics-label">SVG Booths:</span>
                    <span class="diagnostics-value">${d.svgBoothCount}</span>
                </div>
                <div class="diagnostics-row">
                    <span class="diagnostics-label">JSON Booths:</span>
                    <span class="diagnostics-value">${d.jsonBoothCount}</span>
                </div>
                <div class="diagnostics-row">
                    <span class="diagnostics-label">Matched:</span>
                    <span class="diagnostics-value ${d.matchedBooths > 0 ? 'success' : 'warning'}">${d.matchedBooths}</span>
                </div>
                ${assignedMissing.length > 0 ? `
                <div class="diagnostics-row">
                    <span class="diagnostics-label">Assigned Missing:</span>
                    <span class="diagnostics-value error">${assignedMissing.length}</span>
                </div>
                ` : ''}
            </div>
            
            ${assignedMissing.length > 0 ? `
            <div class="diagnostics-section error">
                <div class="diagnostics-label" style="margin-bottom: 5px; color: #d32f2f; font-weight: bold;">⚠️ ASSIGNED booths not visible:</div>
                <div class="diagnostics-list">${assignedMissing.join(', ')}</div>
            </div>
            ` : ''}
            
            ${d.unmatchedSvgBooths.length > 0 ? `
            <div class="diagnostics-section">
                <div class="diagnostics-label" style="margin-bottom: 5px;">SVG booths not in JSON:</div>
                <div class="diagnostics-list">${d.unmatchedSvgBooths.join(', ')}</div>
            </div>
            ` : ''}
            
            ${d.unmatchedJsonBooths.length > 0 && assignedMissing.length === 0 ? `
            <div class="diagnostics-section">
                <div class="diagnostics-label" style="margin-bottom: 5px;">JSON booths not in SVG:</div>
                <div class="diagnostics-list">${d.unmatchedJsonBooths.join(', ')}</div>
            </div>
            ` : ''}
            
            ${d.matchedBooths === 0 && d.svgBoothCount > 0 ? `
            <div class="diagnostics-section warning">
                <strong>⚠️ No booths matched!</strong><br>
                Check that booth IDs in your SVG match those in the JSON data.
            </div>
            ` : ''}
        `;
    }

    toggleDiagnostics() {
        const panel = document.getElementById('diagnostics-panel');
        if (panel) {
            panel.classList.toggle('hidden');
        }
    }

    // ===== BOOTH INTERACTIONS =====

    setupBoothInteractions() {
        let booths = document.querySelectorAll('.booth');
        const tooltip = document.getElementById('tooltip');
        const mapContent = document.getElementById('map-content');
        
        // Fallback: if no .booth elements, try to find elements with booth-like IDs
        if (booths.length === 0) {
            console.warn('No booth elements found with class="booth", trying fallback...');
            
            // Try to find elements with booth-like IDs (booth-*, booth_*, etc.)
            const allElements = mapContent.querySelectorAll('[id]');
            const boothLikeElements = [];
            
            allElements.forEach(el => {
                const id = el.id.toLowerCase();
                if (id.match(/^booth[_-]?/) || id.match(/^\d+$/) || id.match(/^[a-z]\d+$/i)) {
                    // Check if it's a visible shape element
                    const tagName = el.tagName.toLowerCase();
                    if (['rect', 'circle', 'ellipse', 'polygon', 'path'].includes(tagName)) {
                        el.classList.add('booth');
                        boothLikeElements.push(el);
                    }
                }
            });
            
            if (boothLikeElements.length > 0) {
                console.log(`Found ${boothLikeElements.length} booth-like elements by ID pattern`);
                booths = boothLikeElements;
            }
        }
        
        if (booths.length === 0) {
            console.warn('No booth elements found with class="booth"');
            
            // Show visible warning in map area
            const svg = mapContent.querySelector('svg');
            if (svg) {
                const warning = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                warning.setAttribute('x', '50%');
                warning.setAttribute('y', '50%');
                warning.setAttribute('text-anchor', 'middle');
                warning.setAttribute('fill', '#d32f2f');
                warning.setAttribute('font-size', '18');
                warning.setAttribute('font-family', 'Arial, sans-serif');
                warning.textContent = '⚠️ No booths found - check class="booth" on SVG elements';
                svg.appendChild(warning);
            }
        }
        
        booths.forEach(booth => {
            // Skip non-booth map features (restrooms, tents, etc.)
            if (booth.classList.contains('map-feature')) return;
            
            // Extract booth ID from element ID
            const boothId = this.extractBoothId(booth.id);
            if (!boothId) {
                console.warn('Booth element has no recognizable ID:', booth.id);
                return;
            }
            
            // Click handler
            booth.addEventListener('click', () => {
                this.selectBooth(boothId);
            });
            
            // Hover handlers
            booth.addEventListener('mouseenter', (e) => {
                this.showTooltip(e, boothId);
            });
            
            booth.addEventListener('mouseleave', () => {
                tooltip.classList.remove('active');
            });
            
            booth.addEventListener('mousemove', (e) => {
                this.moveTooltip(e);
            });
        });
    }

    selectBooth(boothId) {
        const eventData = this.eventsData[this.currentEvent];
        const booth = eventData.booths[boothId];

        if (!booth) {
            console.warn(`Booth ${boothId} not found in event data`);
            // Show a message in the detail panel
            document.getElementById('detail-content').innerHTML = `
                <div class="detail-field">
                    <label>Booth Number</label>
                    <div class="value" style="font-size: 24px; font-weight: 700; color: var(--primary-color);">${boothId}</div>
                </div>
                <div class="detail-field">
                    <div class="value empty">This booth exists in the map but has no data in the JSON file.</div>
                </div>
                <div class="button-group" style="margin-top: 20px;">
                    <button class="btn btn-primary" onclick="boothMap.createBoothData('${boothId}')">Create Booth Data</button>
                </div>
            `;
            return;
        }

        this.currentBooth = boothId;

        // Highlight selected booth
        document.querySelectorAll('.booth').forEach(b => b.classList.remove('selected'));
        const boothEl = document.getElementById(`booth-${boothId}`) || 
                        document.getElementById(boothId) ||
                        document.querySelector(`[id*="${boothId}"]`);
        if (boothEl) boothEl.classList.add('selected');

        // Show details
        this.showBoothDetails(booth);

        // If in edit mode, open edit modal
        if (this.editMode) {
            this.openEditModal(booth);
        }
    }

    createBoothData(boothId) {
        // Create a new booth entry
        const eventData = this.eventsData[this.currentEvent];
        eventData.booths[boothId] = {
            boothId: boothId,
            vendorName: '',
            businessName: '',
            vendorCategory: 'Open',
            boothStatus: 'open',
            boothSize: '10x10',
            notes: '',
            contactName: '',
            phone: '',
            email: '',
            missingItems: [],
            mapLabel: boothId
        };
        
        this.saveToLocalStorage(this.currentEvent);
        this.selectBooth(boothId);
        this.updateStats();
        this.showNotification('Booth data created');
    }

    showBoothDetails(booth) {
        const panel = document.getElementById('detail-content');
        const category = this.categories[booth.vendorCategory] || this.categories['Open'];

        panel.innerHTML = `
            <div class="detail-field">
                <label>Booth Number</label>
                <div class="value" style="font-size: 24px; font-weight: 700; color: var(--primary-color);">
                    ${booth.mapLabel || booth.boothId}
                </div>
            </div>

            <div class="detail-field">
                <label>Status</label>
                <div class="value">
                    <span class="booth-status-badge status-${booth.boothStatus}">${booth.boothStatus}</span>
                </div>
            </div>

            <div class="detail-field">
                <label>Category</label>
                <div class="value">
                    <span style="display: inline-flex; align-items: center; gap: 8px;">
                        <span style="width: 16px; height: 16px; background: ${category.bgColor}; border: 2px solid ${category.borderColor}; border-radius: 3px;"></span>
                        ${booth.vendorCategory}
                    </span>
                </div>
            </div>

            <div class="detail-field">
                <label>Vendor Name</label>
                <div class="value ${!booth.vendorName ? 'empty' : ''}">${booth.vendorName || 'Not assigned'}</div>
            </div>

            <div class="detail-field">
                <label>Business Name</label>
                <div class="value ${!booth.businessName ? 'empty' : ''}">${booth.businessName || 'Not assigned'}</div>
            </div>

            <div class="detail-field">
                <label>Booth Size</label>
                <div class="value">${booth.boothSize || '10x10'}</div>
            </div>

            ${booth.phone ? `
            <div class="detail-field">
                <label>Phone</label>
                <div class="value">${booth.phone}</div>
            </div>
            ` : ''}

            ${booth.email ? `
            <div class="detail-field">
                <label>Email</label>
                <div class="value">${booth.email}</div>
            </div>
            ` : ''}

            ${booth.notes ? `
            <div class="detail-field">
                <label>Notes</label>
                <div class="value">${booth.notes}</div>
            </div>
            ` : ''}

            <div class="button-group" style="margin-top: 20px;">
                <button class="btn btn-primary" onclick="boothMap.openEditModal(boothMap.eventsData['${this.currentEvent}'].booths['${booth.boothId}'])">
                    Edit Booth
                </button>
                ${booth.boothStatus === 'assigned' ? `
                <button class="btn btn-secondary" style="margin-top: 8px;" onclick="boothMap.openMoveModal('${booth.boothId}')">
                    Move Assignment
                </button>
                ` : ''}
            </div>
        `;
    }

    showTooltip(e, boothId) {
        const eventData = this.eventsData[this.currentEvent];
        const booth = eventData.booths[boothId];
        
        const tooltip = document.getElementById('tooltip');
        
        if (!booth) {
            tooltip.innerHTML = `
                <div class="tooltip-title">Booth ${boothId}</div>
                <div class="tooltip-info">No data available</div>
            `;
        } else {
            tooltip.innerHTML = `
                <div class="tooltip-title">Booth ${booth.mapLabel || boothId}</div>
                <div class="tooltip-info">
                    ${booth.vendorName ? `<strong>${booth.vendorName}</strong><br>` : ''}
                    ${booth.businessName ? `${booth.businessName}<br>` : ''}
                    ${booth.vendorCategory} • ${booth.boothStatus}
                </div>
            `;
        }
        
        tooltip.classList.add('active');
        this.moveTooltip(e);
    }

    moveTooltip(e) {
        const tooltip = document.getElementById('tooltip');
        const x = e.clientX + 15;
        const y = e.clientY + 15;

        // Keep tooltip on screen
        const rect = tooltip.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 10;
        const maxY = window.innerHeight - rect.height - 10;

        tooltip.style.left = Math.min(x, maxX) + 'px';
        tooltip.style.top = Math.min(y, maxY) + 'px';
    }

    closeDetailPanel() {
        this.currentBooth = null;
        document.querySelectorAll('.booth').forEach(b => b.classList.remove('selected'));
        document.getElementById('detail-content').innerHTML = '<p class="no-selection">Click a booth to view details</p>';
    }

    // ===== STYLING & FILTERS =====

    applyBoothColors() {
        const eventData = this.eventsData[this.currentEvent];
        if (!eventData || !eventData.booths) {
            console.warn('applyBoothColors: No event data or booths');
            return;
        }

        let foundCount = 0;
        let missingCount = 0;
        const missingBooths = [];

        Object.entries(eventData.booths).forEach(([boothId, booth]) => {
            // Try multiple ways to find the booth element
            let boothEl = document.getElementById(`booth-${boothId}`);
            if (!boothEl) boothEl = document.getElementById(boothId);
            if (!boothEl) {
                // Try finding by partial match - escape special regex chars
                const safeId = boothId.replace(/[\/\[\]()]/g, '\\$&');
                boothEl = document.querySelector(`[id*="${safeId}"].booth`);
            }
            
            if (!boothEl) {
                missingCount++;
                if (booth.boothStatus === 'assigned') {
                    missingBooths.push(boothId);
                }
                return;
            }
            
            foundCount++;
            const category = this.categories[booth.vendorCategory] || this.categories['Open'];

            // Use semi-transparent fills so the background map image shows through
            if (booth.boothStatus === 'open') {
                // Open booths: fully transparent, just interactive
                boothEl.style.fill = 'transparent';
                boothEl.style.stroke = 'transparent';
                boothEl.style.strokeWidth = '1';
            } else if (booth.boothStatus === 'unavailable') {
                boothEl.style.fill = 'rgba(100,100,100,0.35)';
                boothEl.style.stroke = '#555';
                boothEl.style.strokeWidth = '2';
            } else {
                // Assigned/hold — semi-transparent category color overlay
                const bgColor = category.bgColor || '#FCE4EC';
                // Convert hex to rgba with transparency
                const rgb = this.hexToRgb(bgColor);
                if (rgb) {
                    boothEl.style.fill = `rgba(${rgb.r},${rgb.g},${rgb.b},0.55)`;
                } else {
                    boothEl.style.fill = bgColor;
                }
                boothEl.style.stroke = category.borderColor || '#333';
                boothEl.style.strokeWidth = '2';
            }
        });
        
        console.log(`applyBoothColors: ${foundCount} found, ${missingCount} missing`);
        if (missingBooths.length > 0) {
            console.warn('Missing assigned booths:', missingBooths);
        }
    }

    hexToRgb(hex) {
        // Handle hex colors like #FCE4EC
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    applyFilters() {
        const eventData = this.eventsData[this.currentEvent];
        if (!eventData || !eventData.booths) return;

        Object.entries(eventData.booths).forEach(([boothId, booth]) => {
            let boothEl = document.getElementById(`booth-${boothId}`);
            if (!boothEl) boothEl = document.getElementById(boothId);
            if (!boothEl) boothEl = document.querySelector(`[id*="${boothId}"].booth`);
            
            if (!boothEl) return;

            let visible = true;

            // Search filter
            if (this.searchTerm) {
                const searchFields = [
                    booth.boothId,
                    booth.mapLabel,
                    booth.vendorName,
                    booth.businessName,
                    booth.vendorCategory
                ].join(' ').toLowerCase();

                if (!searchFields.includes(this.searchTerm)) {
                    visible = false;
                }
            }

            // Category filter
            if (this.categoryFilter !== 'all' && booth.vendorCategory !== this.categoryFilter) {
                visible = false;
            }

            // Status filter
            if (this.statusFilter !== 'all' && booth.boothStatus !== this.statusFilter) {
                visible = false;
            }

            boothEl.style.opacity = visible ? '1' : '0.2';
            boothEl.classList.toggle('filtered-out', !visible);
        });
    }

    renderCategoryFilter() {
        const select = document.getElementById('category-filter');
        select.innerHTML = '<option value="all">All Categories</option>';

        Object.keys(this.categories).forEach(category => {
            if (category === 'Open' || category === 'Unavailable') return;
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
    }

    renderLegend() {
        const container = document.getElementById('legend-container');
        container.innerHTML = '';

        Object.entries(this.categories).forEach(([name, colors]) => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <span class="legend-color" style="background: ${colors.bgColor}; border-color: ${colors.borderColor};"></span>
                <span>${name}</span>
            `;
            container.appendChild(item);
        });
    }

    updateStats() {
        const eventData = this.eventsData[this.currentEvent];
        if (!eventData || !eventData.booths) return;
        
        const booths = Object.values(eventData.booths);

        const stats = {
            total: booths.length,
            assigned: booths.filter(b => b.boothStatus === 'assigned').length,
            open: booths.filter(b => b.boothStatus === 'open').length,
            unavailable: booths.filter(b => b.boothStatus === 'unavailable').length
        };

        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-assigned').textContent = stats.assigned;
        document.getElementById('stat-open').textContent = stats.open;
        document.getElementById('stat-unavailable').textContent = stats.unavailable;
    }

    // ===== EDIT MODE =====

    toggleEditMode() {
        this.editMode = !this.editMode;
        const btn = document.getElementById('btn-edit-mode');
        btn.textContent = this.editMode ? 'Exit Edit Mode' : 'Edit Mode';
        btn.classList.toggle('btn-primary', this.editMode);
        btn.classList.toggle('btn-secondary', !this.editMode);

        if (this.editMode) {
            this.showNotification('Edit mode enabled. Click any booth to edit.');
        }
    }

    openEditModal(booth) {
        const modal = document.getElementById('edit-modal');

        // Populate form
        document.getElementById('edit-booth-id').value = booth.boothId;
        document.getElementById('edit-vendor-name').value = booth.vendorName || '';
        document.getElementById('edit-business-name').value = booth.businessName || '';
        document.getElementById('edit-phone').value = booth.phone || '';
        document.getElementById('edit-email').value = booth.email || '';
        document.getElementById('edit-notes').value = booth.notes || '';

        // Populate category select
        const catSelect = document.getElementById('edit-category');
        catSelect.innerHTML = '';
        Object.keys(this.categories).forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            if (category === booth.vendorCategory) option.selected = true;
            catSelect.appendChild(option);
        });

        // Set status
        document.getElementById('edit-status').value = booth.boothStatus;

        modal.classList.add('active');
    }

    closeModal() {
        document.getElementById('edit-modal').classList.remove('active');
    }

    saveBoothEdit() {
        const boothId = document.getElementById('edit-booth-id').value;
        const eventData = this.eventsData[this.currentEvent];
        const booth = eventData.booths[boothId];

        if (!booth) return;

        // Update booth data
        booth.vendorName = document.getElementById('edit-vendor-name').value.trim();
        booth.businessName = document.getElementById('edit-business-name').value.trim();
        booth.vendorCategory = document.getElementById('edit-category').value;
        booth.boothStatus = document.getElementById('edit-status').value;
        booth.phone = document.getElementById('edit-phone').value.trim();
        booth.email = document.getElementById('edit-email').value.trim();
        booth.notes = document.getElementById('edit-notes').value.trim();

        // Save to localStorage
        this.saveToLocalStorage(this.currentEvent);

        // Update UI
        this.applyBoothColors();
        this.updateStats();
        this.showBoothDetails(booth);
        this.closeModal();

        this.showNotification('Booth updated successfully!');
    }

    // ===== MOVE / SWAP ASSIGNMENT =====

    openMoveModal(sourceBoothId) {
        const eventData = this.eventsData[this.currentEvent];
        const sourceBooth = eventData.booths[sourceBoothId];
        if (!sourceBooth || sourceBooth.boothStatus !== 'assigned') {
            this.showNotification('Only assigned booths can be moved.');
            return;
        }

        // Build list of all other booths
        const otherBooths = Object.entries(eventData.booths)
            .filter(([id]) => id !== sourceBoothId)
            .sort((a, b) => {
                const na = parseInt(a[0]) || 0;
                const nb = parseInt(b[0]) || 0;
                return na - nb;
            });

        const optionsHtml = otherBooths.map(([id, b]) => {
            const status = b.boothStatus;
            const label = b.vendorName ? `${id} — ${b.vendorName} (${status})` : `${id} — (${status})`;
            return `<option value="${id}" data-status="${status}">${label}</option>`;
        }).join('');

        // Create move modal
        let moveModal = document.getElementById('move-modal');
        if (!moveModal) {
            moveModal = document.createElement('div');
            moveModal.id = 'move-modal';
            moveModal.className = 'modal';
            document.body.appendChild(moveModal);
        }

        moveModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Move Assignment — Booth ${sourceBoothId}</h3>
                    <button class="btn-close" onclick="document.getElementById('move-modal').classList.remove('active')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="move-source-info">
                        <strong>Moving:</strong> ${sourceBooth.vendorName || 'Unknown'}<br>
                        <strong>Business:</strong> ${sourceBooth.businessName || 'N/A'}<br>
                        <strong>Category:</strong> ${sourceBooth.vendorCategory}
                    </div>
                    <div class="form-group" style="margin-top: 16px;">
                        <label for="move-destination">Destination Booth:</label>
                        <select id="move-destination" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                            <option value="">— Select destination —</option>
                            ${optionsHtml}
                        </select>
                    </div>
                    <div id="move-warning" style="margin-top: 12px; display: none;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('move-modal').classList.remove('active')">Cancel</button>
                    <button id="btn-execute-move" class="btn btn-primary" disabled>Move Assignment</button>
                </div>
            </div>
        `;

        // Destination change handler
        const destSelect = moveModal.querySelector('#move-destination');
        const moveBtn = moveModal.querySelector('#btn-execute-move');
        const warningDiv = moveModal.querySelector('#move-warning');

        destSelect.addEventListener('change', () => {
            const destId = destSelect.value;
            if (!destId) {
                moveBtn.disabled = true;
                warningDiv.style.display = 'none';
                return;
            }
            const destBooth = eventData.booths[destId];
            if (destBooth && destBooth.boothStatus === 'assigned') {
                warningDiv.style.display = 'block';
                warningDiv.innerHTML = `
                    <div style="background: #FFF3E0; border: 1px solid #FF9800; border-radius: 4px; padding: 10px; font-size: 13px;">
                        <strong>⚠️ Booth ${destId} is occupied</strong><br>
                        Vendor: ${destBooth.vendorName || 'Unknown'}<br>
                        Business: ${destBooth.businessName || 'N/A'}<br><br>
                        <strong>This will SWAP both assignments.</strong>
                    </div>
                `;
                moveBtn.textContent = 'Swap Booths';
                moveBtn.disabled = false;
            } else if (destBooth && destBooth.boothStatus === 'unavailable') {
                warningDiv.style.display = 'block';
                warningDiv.innerHTML = `
                    <div style="background: #FFEBEE; border: 1px solid #F44336; border-radius: 4px; padding: 10px; font-size: 13px;">
                        <strong>❌ Booth ${destId} is unavailable.</strong><br>
                        You cannot move to an unavailable booth.
                    </div>
                `;
                moveBtn.disabled = true;
            } else {
                warningDiv.style.display = 'none';
                moveBtn.textContent = 'Move Assignment';
                moveBtn.disabled = false;
            }
        });

        moveBtn.addEventListener('click', () => {
            const destId = destSelect.value;
            if (!destId) return;
            this.executeMove(sourceBoothId, destId);
            moveModal.classList.remove('active');
        });

        // Close on backdrop click
        moveModal.addEventListener('click', (e) => {
            if (e.target === moveModal) moveModal.classList.remove('active');
        });

        moveModal.classList.add('active');
    }

    executeMove(sourceId, destId) {
        const eventData = this.eventsData[this.currentEvent];
        const source = eventData.booths[sourceId];
        const dest = eventData.booths[destId];

        if (!source || !dest) {
            this.showNotification('Error: booth data not found');
            return;
        }

        // Fields to transfer
        const fields = ['vendorName', 'businessName', 'vendorCategory', 'boothStatus', 'phone', 'email', 'notes', 'missingItems'];

        if (dest.boothStatus === 'assigned') {
            // SWAP — save dest data, move source→dest, move saved→source
            const destBackup = {};
            fields.forEach(f => destBackup[f] = dest[f]);

            fields.forEach(f => dest[f] = source[f]);
            fields.forEach(f => source[f] = destBackup[f]);

            this.showNotification(`Swapped: Booth ${sourceId} ↔ Booth ${destId}`);
        } else {
            // MOVE — transfer source→dest, clear source
            fields.forEach(f => dest[f] = source[f]);

            // Clear source
            source.vendorName = '';
            source.businessName = '';
            source.vendorCategory = 'Open';
            source.boothStatus = 'open';
            source.phone = '';
            source.email = '';
            source.notes = '';
            source.missingItems = [];

            this.showNotification(`Moved assignment from Booth ${sourceId} → Booth ${destId}`);
        }

        // Save and refresh
        this.saveToLocalStorage(this.currentEvent);
        this.applyBoothColors();
        this.updateStats();

        // Select the destination booth to show result
        this.selectBooth(destId);
    }

    // ===== IMPORT/EXPORT =====

    exportData() {
        const eventData = this.eventsData[this.currentEvent];
        const dataStr = JSON.stringify(eventData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `event-${this.currentEvent}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification('Data exported successfully!');
    }

    // ===== UTILITIES =====

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #323232;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    showError(message) {
        // Also show in map area if it's blank
        const mapContent = document.getElementById('map-content');
        if (mapContent && mapContent.children.length === 0) {
            mapContent.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; min-height: 400px; color: #d32f2f; padding: 20px;">
                    <div style="text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
                        <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">Error</div>
                        <div style="font-size: 14px;">${message}</div>
                    </div>
                </div>
            `;
        }
        console.error(message);
    }

    setupEventListeners() {
        // Event selector
        document.getElementById('event-select').addEventListener('change', (e) => {
            this.loadEvent(e.target.value);
        });

        // Search
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.applyFilters();
        });

        // Filters
        document.getElementById('category-filter').addEventListener('change', (e) => {
            this.categoryFilter = e.target.value;
            this.applyFilters();
        });

        document.getElementById('status-filter').addEventListener('change', (e) => {
            this.statusFilter = e.target.value;
            this.applyFilters();
        });

        // Buttons
        document.getElementById('btn-edit-mode').addEventListener('click', () => {
            this.toggleEditMode();
        });

        document.getElementById('btn-export').addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('btn-import').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });

        document.getElementById('import-file').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.importEventData(e.target.files[0]);
                e.target.value = ''; // Reset input
            }
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.resetEventToOriginal(this.currentEvent);
        });

        document.getElementById('btn-print').addEventListener('click', () => {
            window.print();
        });

        document.getElementById('btn-diagnostics').addEventListener('click', () => {
            this.toggleDiagnostics();
        });

        // V2: Custom map upload
        const btnUploadMap = document.getElementById('btn-upload-map');
        if (btnUploadMap) btnUploadMap.addEventListener('click', () => this._showUploadMapDialog());

        // V2: Delete custom event
        const btnDeleteEvent = document.getElementById('btn-delete-event');
        if (btnDeleteEvent) btnDeleteEvent.addEventListener('click', () => this._deleteCustomEvent(this.currentEvent));

        // V2: New booth dialog
        const confirmNew = document.getElementById('confirm-new-booth');
        if (confirmNew) confirmNew.addEventListener('click', () => this._confirmNewBooth());
        const cancelNew = document.getElementById('cancel-new-booth');
        if (cancelNew) cancelNew.addEventListener('click', () => this._closeNewBoothDialog());

        // V2: Rename dialog
        const confirmRename = document.getElementById('confirm-rename-booth');
        if (confirmRename) confirmRename.addEventListener('click', () => this._confirmRenameBooth());
        const cancelRename = document.getElementById('cancel-rename-booth');
        if (cancelRename) cancelRename.addEventListener('click', () => document.getElementById('rename-booth-modal').classList.remove('active'));

        // V2: Upload map dialog
        const confirmUpload = document.getElementById('confirm-upload-map');
        if (confirmUpload) confirmUpload.addEventListener('click', () => this._confirmUploadMap());
        const cancelUpload = document.getElementById('cancel-upload-map');
        if (cancelUpload) cancelUpload.addEventListener('click', () => document.getElementById('upload-map-modal').classList.remove('active'));

        // V2: Show/hide delete-event button for custom events
        document.getElementById('event-select').addEventListener('change', () => {
            this._updateCustomEventUI();
        });

        document.getElementById('btn-fit-map').addEventListener('click', () => {
            this.fitMapToViewport();
        });

        document.getElementById('btn-position-mode').addEventListener('click', () => {
            this.togglePositionMode();
        });

        // Detail panel
        document.getElementById('close-detail').addEventListener('click', () => {
            this.closeDetailPanel();
        });

        // Modal
        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('btn-cancel').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('btn-save').addEventListener('click', () => {
            this.saveBoothEdit();
        });

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
            return pt.matrixTransform(svg.getScreenCTM().inverse());
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
