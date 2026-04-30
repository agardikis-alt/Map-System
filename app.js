// ===== Vendor Booth Map System v5 =====
// Fixes: feature shapes drag/resize, text scaling, booth vs feature separation, 
// bluegrass image, map reset safeguard, template copy, feature labeling

export class BoothMapSystem {
    constructor() {
        this.currentEvent = 'offstreet';
        this.eventsData = {};
        this.originalEventsData = {};
        this.categories = {};
        this.eventsConfig = {};
        this.currentBooth = null;
        this.positionMode = false;
        this.searchTerm = '';
        this.categoryFilter = 'all';
        this.statusFilter = 'all';

        this.drawMode = false;
        this.drawType = 'booth';
        this._drawStart = null;
        this._drawPreview = null;
        this._selectedEl = null;
        this._pending = null;

        this._dragging = null;
        this._resizing = null;
        this._rotating = null;
        this._dragState = null;

        this._zoom = 1;
        this._panX = 0;
        this._panY = 0;
        this._panning = false;
        this._panOn = false;

        this.boothOpacity = 0.8;
        this.github = { token:'', gistId:'', autoSync:false, lastSync:null };

        this.init();
    }

    async init() {
        this._loadGh();
        try { await this.loadData(); } catch(e) { console.error('loadData:', e); }
        try { this.loadCustomEvents(); } catch(e) { console.error('loadCustomEvents:', e); }
        try { this.setupListeners(); } catch(e) { console.error('setupListeners:', e); }
        try { this.setupViewport(); } catch(e) { console.error('setupViewport:', e); }
        this.renderCategoryFilter();
        this.renderLegend();
        this.loadEvent(this.currentEvent);
        this.renderGhUI();
    }

    // ===== HELPERS =====
    _parseRot(el) {
        const t = el.getAttribute('transform') || '';
        const m = t.match(/rotate\(\s*([-\d.]+)\s*,?\s*([-\d.]+)?\s*,?\s*([-\d.]+)?\s*\)/);
        return m ? { a:parseFloat(m[1])||0, cx:parseFloat(m[2])||null, cy:parseFloat(m[3])||null, raw:m[0] } : { a:0, cx:null, cy:null, raw:null };
    }
    _setRot(el, a, cx, cy) { el.setAttribute('transform', `rotate(${a.toFixed(1)},${cx.toFixed(1)},${cy.toFixed(1)})`); }

    _lsGet(k) { try { const d=localStorage.getItem(k); return d?JSON.parse(d):null; }catch(e){return null;} }
    _lsSet(k,v) { try { localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
    _lsRem(k) { try { localStorage.removeItem(k); }catch(e){} }

    // ===== DATA =====
    async loadData() {
        try {
            this.categories = await (await fetch('./data/categories.json')).json();
            this.eventsConfig = await (await fetch('./data/events.json')).json();
            for (const [k, cfg] of Object.entries(this.eventsConfig)) {
                const saved = this._lsGet(`boothmap_${k}`);
                if (saved) { this.eventsData[k] = saved; this.originalEventsData[k] = JSON.parse(JSON.stringify(saved)); }
                else {
                    const path = cfg.dataFile.startsWith('./') ? cfg.dataFile : './'+cfg.dataFile;
                    const d = await (await fetch(path)).json();
                    this.eventsData[k] = d; this.originalEventsData[k] = JSON.parse(JSON.stringify(d));
                }
            }
        } catch(e) { this.notify('Data load failed: '+e.message, 'error'); }
    }

    saveEvent(id) { this._lsSet(`boothmap_${id}`, this.eventsData[id]); this.notify('Saved'); if(this.github.autoSync&&this.github.token) this._ghSave(); }
    saveSvg(id, svgStr) { try { localStorage.setItem(`boothmap_svg_${id}`, svgStr); }catch(e){} }

    // ===== EVENT & MAP =====
    loadEvent(id) {
        this.currentEvent = id;
        const cfg = this.eventsConfig[id];
        if(!cfg){this.notify('Event not found','error');return;}
        document.getElementById('event-title').textContent = cfg.name;
        document.getElementById('event-select').value = id;
        this._zoom=1; this._panX=0; this._panY=0; this._applyView();
        this._loadMap(cfg.mapFile, cfg.name);
        this.updateStats(); this.closeDetail();
        this._updateCustomUI();
    }

    async _loadMap(mapFile, eventName) {
        const mc = document.getElementById('map-content');
        const stripText = (svg) => svg.replace(/<text\b[^>]*>.*?<\/text>/gis, '');

        // Special case: bluegrass uses PNG image - generate SVG wrapper
        if (this.currentEvent === 'bluegrass') {
            mc.innerHTML = '<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><image href="maps/bluegrass-2026.png" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid meet"/></svg>';
            this.setupBoothInteractions(); this._applyView();
            setTimeout(() => this.fitView(), 50); return;
        }

        if(!mapFile){
            const saved=this._svgGet(this.currentEvent);
            if(saved){mc.innerHTML=stripText(saved);this._post();}
            else{mc.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:400px;flex-direction:column;gap:16px;color:#6b7280;"><div style="font-size:48px;">🗺️</div><div style="font-size:16px;font-weight:600;">No map</div><div style="font-size:13px;">Upload an SVG map to get started.</div></div>';}
            return;
        }

        // Try saved SVG first
        const saved = this._svgGet(this.currentEvent);
        if(saved){
            try { mc.innerHTML=stripText(saved); this._post(); return; }
            catch(e){ this._lsRem(`boothmap_svg_${this.currentEvent}`); }
        }

        // Load from source file
        const path = mapFile.startsWith('./')?mapFile:'./'+mapFile;
        try {
            let svg = await (await fetch(path)).text();
            if(!svg.includes('<svg')) throw new Error('Invalid SVG');
            // Fix relative image paths
            const folder = path.substring(0, path.lastIndexOf('/')+1);
            svg = svg.replace(/href="(?!http|data:|\/)(.*?\.(png|jpg|jpeg|gif|webp))"/gi, (m,fn) => `href="${folder}${fn}"`);
            // Also handle xlink:href
            svg = svg.replace(/xlink:href="(?!http|data:|\/)(.*?\.(png|jpg|jpeg|gif|webp))"/gi, (m,fn) => `xlink:href="${folder}${fn}"`);
            mc.innerHTML = stripText(svg); this._post();
        } catch(e) {
            mc.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:400px;color:#d32f2f;padding:20px;"><div style="text-align:center;max-width:400px;"><div style="font-size:48px;margin-bottom:15px;">⚠️</div><div style="font-size:18px;font-weight:700;">Map failed</div><div style="font-size:14px;color:#666;margin-top:10px;">${e.message}</div><div style="font-size:13px;color:#999;margin-top:10px;">Path: ${path}</div><button class="btn btn-primary" style="margin-top:15px;" onclick="boothMap._resetMap()">Reset Map from Source</button></div></div>`;
        }
    }

    _svgGet(id){try{return localStorage.getItem(`boothmap_svg_${id}`);}catch(e){return null;}}

    _post() {
        const svg=document.querySelector('#map-content svg'); if(!svg)return;
        if(!svg.getAttribute('viewBox')){
            const b=svg.getBBox?svg.getBBox():null;
            if(b&&b.width>0) svg.setAttribute('viewBox',`${b.x} ${b.y} ${b.width} ${b.height}`);
        }
        svg.style.display='block';
        svg.style.width='100%';
        svg.style.height='100%';
        this.setupBoothInteractions(); this.applyColors(); this.updateStats();
        setTimeout(() => this.fitView(), 50);
    }

    normId(raw){return raw?String(raw).trim().replace(/^booth[_-]/i,''):null;}
    extractId(elId){return elId?this.normId(elId):null;}

    // ===== MAP RESET SAFEGUARD =====
    _resetMap() {
        this._lsRem(`boothmap_svg_${this.currentEvent}`);
        this._lsRem(`boothmap_${this.currentEvent}`);
        // Restore original data
        if(this.originalEventsData[this.currentEvent]){
            this.eventsData[this.currentEvent] = JSON.parse(JSON.stringify(this.originalEventsData[this.currentEvent]));
        }
        this.loadEvent(this.currentEvent);
        this.notify('Map reset to original source');
    }

    // ===== TEMPLATE COPY =====
    // ===== TEMPLATES =====
    _getTemplates() { try { return JSON.parse(localStorage.getItem('boothmap_templates') || '[]'); } catch(e) { return []; } }
    _saveTemplates(t) { localStorage.setItem('boothmap_templates', JSON.stringify(t)); }

    _showCopyTemplateDlg() {
        const m = document.getElementById('copy-template-modal');
        document.getElementById('copy-template-name').value = '';
        this._renderTemplateList();
        m.classList.add('active');
    }
    _renderTemplateList() {
        const c = document.getElementById('templates-list-content');
        const templates = this._getTemplates();
        if (!templates.length) { c.innerHTML = '<div style="font-size:12px;color:var(--text-sec);padding:8px 0;">No templates saved yet</div>'; return; }
        c.innerHTML = templates.map(t => {
            const date = new Date(t.date).toLocaleDateString();
            return `<div class="template-item"><div class="template-info"><div class="template-name">${this._esc(t.name)}</div><div class="template-meta">${t.boothCount} booths · ${t.featureCount} features · ${date}</div></div><div class="template-actions"><button class="btn btn-danger btn-sm" data-tid="${t.id}">Delete</button></div></div>`;
        }).join('');
        c.querySelectorAll('button[data-tid]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tid = btn.dataset.tid;
                const templates = this._getTemplates().filter(t => t.id !== tid);
                this._saveTemplates(templates);
                this._renderTemplateList();
                this.notify('Template deleted');
            });
        });
    }
    _confirmCopyTemplate() {
        const name = document.getElementById('copy-template-name').value.trim();
        if (!name) { this.notify('Template name required'); return; }
        const filter = document.getElementById('copy-template-filter').value;
        const svg = document.querySelector('#map-content svg');
        if (!svg) { this.notify('No map to copy'); return; }

        // Extract booth elements with their geometry
        const booths = [];
        svg.querySelectorAll('.booth').forEach(el => {
            const data = this.eventsData[this.currentEvent]?.booths?.[el.id];
            if (filter === 'assigned' && data?.boothStatus !== 'assigned') return;
            if (filter === 'open' && data?.boothStatus !== 'open') return;
            const r = this._getRect(el);
            const rot = this._parseRot(el);
            booths.push({ id: el.id, x: r.x, y: r.y, width: r.width, height: r.height, rx: el.rx?.baseVal?.value||0, ry: el.ry?.baseVal?.value||0, rotation: rot.a || 0 });
        });

        // Extract features (shapes)
        const features = [];
        svg.querySelectorAll('.feature-el').forEach(el => {
            if (!el.id) return;
            const r = this._getRect(el);
            const rot = this._parseRot(el);
            const tag = el.tagName.toLowerCase();
            const feat = { id: el.id, type: tag, tag, attrs: {} };
            if (tag === 'circle') { feat.attrs.cx=el.getAttribute('cx');feat.attrs.cy=el.getAttribute('cy');feat.attrs.r=el.getAttribute('r'); }
            else if (tag === 'ellipse') { feat.attrs.cx=el.getAttribute('cx');feat.attrs.cy=el.getAttribute('cy');feat.attrs.rx=el.getAttribute('rx');feat.attrs.ry=el.getAttribute('ry'); }
            else if (tag === 'line') { feat.attrs.x1=el.getAttribute('x1');feat.attrs.y1=el.getAttribute('y1');feat.attrs.x2=el.getAttribute('x2');feat.attrs.y2=el.getAttribute('y2');feat.attrs.stroke=el.getAttribute('stroke');feat.attrs.strokeWidth=el.getAttribute('stroke-width');feat.attrs.markerEnd=el.getAttribute('marker-end'); }
            else if (tag === 'polygon') { feat.attrs.points=el.getAttribute('points'); }
            else { feat.attrs.x=r.x;feat.attrs.y=r.y;feat.attrs.width=r.width;feat.attrs.height=r.height; }
            feat.attrs.fill = el.getAttribute('fill');
            feat.attrs.fillOpacity = el.getAttribute('fill-opacity') || '0.5';
            feat.attrs.stroke = el.getAttribute('stroke');
            feat.attrs.strokeWidth = el.getAttribute('stroke-width') || '2';
            feat.attrs.rotation = rot.a || 0;
            feat.label = el.dataset.label || '';
            features.push(feat);
        });

        // Extract text elements
        const texts = [];
        svg.querySelectorAll('.feature-text').forEach(el => {
            if (!el.id) return;
            texts.push({ id: el.id, x: el.getAttribute('x'), y: el.getAttribute('y'), text: el.textContent, fontSize: el.getAttribute('font-size'), fill: el.getAttribute('fill') });
        });

        const template = { id: 'tpl_' + Date.now().toString(36), name, date: Date.now(), booths, features, texts, boothCount: booths.length, featureCount: features.length };
        const templates = this._getTemplates(); templates.unshift(template); this._saveTemplates(templates);
        document.getElementById('copy-template-modal').classList.remove('active');
        this.notify(`Template "${name}" saved — ${booths.length} booths, ${features.length} features`);
    }

    _showPasteTemplateDlg() {
        const templates = this._getTemplates();
        const c = document.getElementById('paste-templates-list');
        const cfg = this.eventsConfig[this.currentEvent];
        document.getElementById('paste-target-name').textContent = cfg?.name || 'this map';
        if (!templates.length) { c.innerHTML = '<div style="font-size:12px;color:var(--text-sec);padding:20px;text-align:center;">No templates available. Copy a template first.</div>'; }
        else {
            c.innerHTML = templates.map(t => {
                const date = new Date(t.date).toLocaleDateString();
                return `<button class="paste-option" data-tid="${t.id}"><div class="paste-option-icon">◫</div><div class="paste-option-info"><div class="paste-option-name">${this._esc(t.name)}</div><div class="paste-option-meta">${t.boothCount} booths · ${t.featureCount} features · ${date}</div></div></button>`;
            }).join('');
            c.querySelectorAll('.paste-option').forEach(btn => {
                btn.addEventListener('click', () => { document.getElementById('paste-template-modal').classList.remove('active'); this._applyTemplate(btn.dataset.tid); });
            });
        }
        document.getElementById('paste-template-modal').classList.add('active');
    }

    _applyTemplate(tid) {
        const templates = this._getTemplates(); const tpl = templates.find(t => t.id === tid);
        if (!tpl) { this.notify('Template not found'); return; }
        this._pasteTemplate(tpl);
    }

    _pasteTemplate(tpl) {
        const svg = document.querySelector('#map-content svg'); if (!svg) { this.notify('No map loaded'); return; }
        const ns = 'http://www.w3.org/2000/svg';

        // Create a group to hold all template elements
        const g = document.createElementNS(ns, 'g');
        g.id = '__template_group__';
        g.style.cursor = 'move';

        // Add booths
        const data = this.eventsData[this.currentEvent];
        tpl.booths.forEach(b => {
            const rect = document.createElementNS(ns, 'rect');
            rect.id = b.id; rect.setAttribute('x', b.x); rect.setAttribute('y', b.y);
            rect.setAttribute('width', b.width); rect.setAttribute('height', b.height);
            if (b.rx) rect.setAttribute('rx', b.rx); if (b.ry) rect.setAttribute('ry', b.ry);
            rect.setAttribute('fill', 'rgba(21,101,192,0.05)'); rect.setAttribute('stroke', 'rgba(21,101,192,0.6)');
            rect.setAttribute('stroke-width', '1.5'); rect.setAttribute('stroke-dasharray', '4,2');
            rect.classList.add('booth');
            if (b.rotation) rect.setAttribute('transform', `rotate(${b.rotation},${b.x+b.width/2},${b.y+b.height/2})`);
            g.appendChild(rect);
            // Add empty booth data
            if (!data.booths[b.id]) {
                data.booths[b.id] = { vendorName:'',businessName:'',vendorCategory:'Open',boothStatus:'open',phone:'',email:'',notes:'',missingItems:[] };
            }
        });

        // Add features
        tpl.features.forEach(f => {
            let el;
            if (f.tag === 'circle') { el = document.createElementNS(ns, 'circle'); el.setAttribute('cx',f.attrs.cx);el.setAttribute('cy',f.attrs.cy);el.setAttribute('r',f.attrs.r); }
            else if (f.tag === 'ellipse') { el = document.createElementNS(ns, 'ellipse'); el.setAttribute('cx',f.attrs.cx);el.setAttribute('cy',f.attrs.cy);el.setAttribute('rx',f.attrs.rx);el.setAttribute('ry',f.attrs.ry); }
            else if (f.tag === 'line') { el = document.createElementNS(ns, 'line'); el.setAttribute('x1',f.attrs.x1);el.setAttribute('y1',f.attrs.y1);el.setAttribute('x2',f.attrs.x2);el.setAttribute('y2',f.attrs.y2); }
            else if (f.tag === 'polygon') { el = document.createElementNS(ns, 'polygon'); el.setAttribute('points',f.attrs.points); }
            else { el = document.createElementNS(ns, 'rect'); el.setAttribute('x',f.attrs.x);el.setAttribute('y',f.attrs.y);el.setAttribute('width',f.attrs.width);el.setAttribute('height',f.attrs.height); }
            el.id = f.id || ('feat_' + Math.random().toString(36).slice(2,8));
            el.setAttribute('fill', f.attrs.fill); el.setAttribute('fill-opacity', f.attrs.fillOpacity);
            el.setAttribute('stroke', f.attrs.stroke); el.setAttribute('stroke-width', f.attrs.strokeWidth);
            if (f.attrs.markerEnd) el.setAttribute('marker-end', f.attrs.markerEnd);
            if (f.attrs.rotation && f.attrs.rotation !== 0) {
                const cx = f.attrs.cx || (f.attrs.x + f.attrs.width/2) || 0;
                const cy = f.attrs.cy || (f.attrs.y + f.attrs.height/2) || 0;
                el.setAttribute('transform', `rotate(${f.attrs.rotation},${cx},${cy})`);
            }
            if (f.label) el.dataset.label = f.label;
            el.classList.add('feature-el');
            g.appendChild(el);
        });

        // Add text elements
        tpl.texts.forEach(t => {
            const te = document.createElementNS(ns, 'text');
            te.id = t.id || ('txt_' + Math.random().toString(36).slice(2,8));
            te.setAttribute('x', t.x); te.setAttribute('y', t.y);
            te.setAttribute('font-size', t.fontSize || '14');
            te.setAttribute('font-family', 'Arial, sans-serif');
            te.setAttribute('fill', t.fill || '#333');
            te.setAttribute('text-anchor', 'middle'); te.setAttribute('pointer-events', 'none');
            te.classList.add('feature-text'); te.textContent = t.text;
            g.appendChild(te);
        });

        svg.appendChild(g);
        this._persistSvg(); this.saveEvent(this.currentEvent); this.updateStats();

        // Start alignment mode
        this._startTemplateAlignMode(g);
    }

    _startTemplateAlignMode(group) {
        this._templateGroup = group;
        this._templateAligning = true;
        this._tplX = 0; this._tplY = 0; this._tplScale = 1;
        this._tplDragging = false;
        this._tplClickOk = true; // starts true, set false on drag
        const container = document.querySelector('.map-container');
        container.classList.add('template-align-mode');

        // Show alignment banner
        let banner = document.getElementById('template-align-banner');
        if (!banner) { banner = document.createElement('div'); banner.id = 'template-align-banner'; banner.className = 'template-align-banner'; document.body.appendChild(banner); }
        banner.innerHTML = `<span>↕ Drag to position · Scroll to scale · Click to place</span><button id="tpl-cancel">Cancel</button><button id="tpl-place">Place</button>`;
        banner.style.display = 'flex';

        // SVG coordinate helper
        const svg = document.querySelector('#map-content svg');
        const toSvg = (cx, cy) => {
            const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
            return pt.matrixTransform(svg.getScreenCTM().inverse());
        };

        // mousedown: start potential drag
        this._tplOnMd = (e) => {
            if (e.button !== 0) return;
            this._tplDragging = true;
            this._tplClickOk = true; // assume click until proven otherwise
            this._tplDownPos = { x: e.clientX, y: e.clientY };
            const p = toSvg(e.clientX, e.clientY);
            this._tplDragStart = { svgX: p.x, svgY: p.y, tplX: this._tplX, tplY: this._tplY };
        };
        // mousemove: if moved >3px, it's a drag (not a click)
        this._tplOnMm = (e) => {
            if (!this._tplDragging) return;
            const dx = e.clientX - this._tplDownPos.x;
            const dy = e.clientY - this._tplDownPos.y;
            if (Math.hypot(dx, dy) > 3) this._tplClickOk = false; // moved too much = drag
            if (!this._tplClickOk) {
                e.preventDefault();
                const p = toSvg(e.clientX, e.clientY);
                this._tplX = this._tplDragStart.tplX + (p.x - this._tplDragStart.svgX);
                this._tplY = this._tplDragStart.tplY + (p.y - this._tplDragStart.svgY);
                this._updateTplTransform();
            }
        };
        // mouseup: end drag
        this._tplOnMu = () => { this._tplDragging = false; };
        // wheel: scale
        this._tplOnWheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.95 : 1.05;
            this._tplScale = Math.max(0.2, Math.min(4, this._tplScale * delta));
            this._updateTplTransform();
        };
        // click: place if we didn't drag
        this._tplOnClick = (e) => {
            if (!this._tplClickOk) return; // was a drag
            e.stopPropagation();
            this._finishTemplateAlign();
        };
        // escape to cancel
        this._tplOnKey = (e) => { if (e.key === 'Escape') this._cancelTemplateAlign(); };

        container.addEventListener('mousedown', this._tplOnMd);
        window.addEventListener('mousemove', this._tplOnMm);
        window.addEventListener('mouseup', this._tplOnMu);
        container.addEventListener('wheel', this._tplOnWheel, { passive: false });
        setTimeout(() => container.addEventListener('click', this._tplOnClick), 400);
        document.addEventListener('keydown', this._tplOnKey);

        banner.querySelector('#tpl-cancel').addEventListener('click', () => this._cancelTemplateAlign());
        banner.querySelector('#tpl-place').addEventListener('click', () => this._finishTemplateAlign());
    }

    _updateTplTransform() {
        if (!this._templateGroup) return;
        this._templateGroup.setAttribute('transform', `translate(${this._tplX.toFixed(2)},${this._tplY.toFixed(2)}) scale(${this._tplScale.toFixed(4)})`);
    }

    _finishTemplateAlign() {
        const group = this._templateGroup; if (!group) return;
        const children = Array.from(group.children);
        const svg = group.parentNode; if (!svg) return;
        const s = this._tplScale, tx = this._tplX, ty = this._tplY;

        children.forEach(el => {
            const tag = el.tagName.toLowerCase();
            // Bake group transform into each element's geometry:
            // newCoord = oldCoord * scale + translate
            if (tag === 'rect') {
                const x = parseFloat(el.getAttribute('x')) || 0;
                const y = parseFloat(el.getAttribute('y')) || 0;
                const w = parseFloat(el.getAttribute('width')) || 0;
                const h = parseFloat(el.getAttribute('height')) || 0;
                el.setAttribute('x', x * s + tx);
                el.setAttribute('y', y * s + ty);
                el.setAttribute('width', w * s);
                el.setAttribute('height', h * s);
                // Update rotation center
                const rot = this._parseRot(el);
                if (rot.a !== null) {
                    const cx = (x * s + tx) + (w * s) / 2;
                    const cy = (y * s + ty) + (h * s) / 2;
                    this._setRot(el, rot.a, cx, cy);
                }
            } else if (tag === 'circle') {
                const cx = parseFloat(el.getAttribute('cx')) || 0;
                const cy = parseFloat(el.getAttribute('cy')) || 0;
                const r = parseFloat(el.getAttribute('r')) || 0;
                el.setAttribute('cx', cx * s + tx);
                el.setAttribute('cy', cy * s + ty);
                el.setAttribute('r', r * s);
            } else if (tag === 'ellipse') {
                const cx = parseFloat(el.getAttribute('cx')) || 0;
                const cy = parseFloat(el.getAttribute('cy')) || 0;
                el.setAttribute('cx', cx * s + tx);
                el.setAttribute('cy', cy * s + ty);
                el.setAttribute('rx', (parseFloat(el.getAttribute('rx'))||0) * s);
                el.setAttribute('ry', (parseFloat(el.getAttribute('ry'))||0) * s);
            } else if (tag === 'polygon') {
                const pts = el.getAttribute('points').trim().split(/\s+/);
                const newPts = pts.map(p => {
                    const [x, y] = p.split(',').map(parseFloat);
                    return `${(x * s + tx).toFixed(1)},${(y * s + ty).toFixed(1)}`;
                });
                el.setAttribute('points', newPts.join(' '));
            } else if (tag === 'line') {
                ['x1','y1','x2','y2'].forEach(attr => {
                    const v = parseFloat(el.getAttribute(attr)) || 0;
                    const isY = attr[0] === 'y';
                    el.setAttribute(attr, isY ? (v * s + ty).toFixed(1) : (v * s + tx).toFixed(1));
                });
            } else if (tag === 'text') {
                const x = parseFloat(el.getAttribute('x')) || 0;
                const y = parseFloat(el.getAttribute('y')) || 0;
                el.setAttribute('x', x * s + tx);
                el.setAttribute('y', y * s + ty);
            }
            svg.appendChild(el);
        });
        group.remove();
        this._cleanupTemplateAlign();
        this._persistSvg(); this.saveEvent(this.currentEvent);
        this.applyColors(); this.setupBoothInteractions();
        this.notify('Template placed! Booths are now individually editable');
    }

    _cancelTemplateAlign() {
        if (this._templateGroup) { this._templateGroup.remove(); this._templateGroup = null; }
        this._cleanupTemplateAlign();
        this.notify('Template cancelled');
    }

    _cleanupTemplateAlign() {
        this._templateAligning = false; this._tplDragging = false; this._tplClickOk = true; this._templateGroup = null;
        const container = document.querySelector('.map-container');
        container.classList.remove('template-align-mode');
        if (this._tplOnMd) container.removeEventListener('mousedown', this._tplOnMd);
        if (this._tplOnMm) window.removeEventListener('mousemove', this._tplOnMm);
        if (this._tplOnMu) window.removeEventListener('mouseup', this._tplOnMu);
        if (this._tplOnWheel) container.removeEventListener('wheel', this._tplOnWheel);
        if (this._tplOnClick) container.removeEventListener('click', this._tplOnClick);
        if (this._tplOnKey) document.removeEventListener('keydown', this._tplOnKey);
        const banner = document.getElementById('template-align-banner');
        if (banner) banner.style.display = 'none';
    }

    // ===== VIEWPORT =====
    setupViewport() {
        const c=document.querySelector('.map-container'); if(!c)return;
        const ctrl=document.createElement('div'); ctrl.id='vp-ctrl';
        ctrl.innerHTML=`<button id="vp-in" title="Zoom in">+</button><button id="vp-fit" title="Fit view">FIT</button><button id="vp-out" title="Zoom out">−</button><button id="vp-hand" title="Pan mode">✋</button>`;
        c.appendChild(ctrl);
        ctrl.querySelector('#vp-in').onclick=()=>this._zoomRel(0.2);
        ctrl.querySelector('#vp-out').onclick=()=>this._zoomRel(-0.2);
        ctrl.querySelector('#vp-fit').onclick=()=>this.fitView();
        ctrl.querySelector('#vp-hand').onclick=()=>this._togglePan();

        c.addEventListener('wheel',(e)=>{
            if(e.ctrlKey||e.metaKey){e.preventDefault();const r=c.getBoundingClientRect();this._zoomAt(e.deltaY>0?-0.1:0.1,e.clientX-r.left,e.clientY-r.top);}
            else{this._panX-=e.deltaX*0.5;this._panY-=e.deltaY*0.5;this._applyView();}
        },{passive:false});

        c.addEventListener('mousedown',(e)=>{
            if(e.button!==0)return;
            const t=e.target;
            if(t.closest('.booth')||t.closest('.resize-handle')||t.closest('.rotate-handle')||t.closest('.feature-el')||t.closest('.feature-text'))return;
            if(this._panOn){this._panning=true;this._panStart={x:e.clientX,y:e.clientY};this._viewStart={x:this._panX,y:this._panY};c.style.cursor='grabbing';e.preventDefault();}
            // Also allow panning by dragging on empty space at any zoom level
            else if(!t.closest('svg')){this._panning=true;this._panStart={x:e.clientX,y:e.clientY};this._viewStart={x:this._panX,y:this._panY};c.style.cursor='grabbing';e.preventDefault();}
        });
        document.addEventListener('mousemove',(e)=>{if(!this._panning)return;this._panX=this._viewStart.x+(e.clientX-this._panStart.x);this._panY=this._viewStart.y+(e.clientY-this._panStart.y);this._applyView();});
        document.addEventListener('mouseup',()=>{if(this._panning){this._panning=false;c.style.cursor=this._panOn?'grab':'';}});
    }

    _zoomRel(d){const c=document.querySelector('.map-container');const r=c.getBoundingClientRect();this._zoomAt(d,r.width/2,r.height/2);}
    _zoomAt(d,vx,vy){
        const oz=this._zoom, nz=Math.max(0.2,Math.min(5,oz+d));
        if(nz===oz)return;
        const slx=(vx-this._panX)/oz, sly=(vy-this._panY)/oz;
        this._panX=vx-slx*nz; this._panY=vy-sly*nz; this._zoom=nz; this._applyView();
    }
    _applyView(){
        const svg=document.querySelector('#map-content svg'); if(!svg)return;
        svg.style.transform=`translate(${this._panX}px,${this._panY}px) scale(${this._zoom})`;
        svg.style.transformOrigin='0 0';
        const b=document.getElementById('vp-fit'); if(b)b.textContent=`${Math.round(this._zoom*100)}%`;
    }
    fitView(){
        const svg=document.querySelector('#map-content svg'); if(!svg)return;
        this._zoom=1; this._panX=0; this._panY=0;
        svg.setAttribute('preserveAspectRatio','xMidYMin meet');
        this._applyView();
    }
    _togglePan(){this._panOn=!this._panOn;document.querySelector('.map-container').style.cursor=this._panOn?'grab':'';const b=document.getElementById('vp-hand');if(b){b.style.background=this._panOn?'#1565C0':'transparent';b.style.color=this._panOn?'white':'';}}

    // ===== BOOTH INTERACTIONS =====
    setupBoothInteractions() {
        const tt=document.getElementById('tooltip');

        // Feature elements hover/click
        document.querySelectorAll('.feature-el, .feature-text').forEach(fe => {
            if(fe._hasFeatureListeners)return;fe._hasFeatureListeners=true;
            fe.addEventListener('mouseenter',e=>this._showFeatureTooltip(e,fe));
            fe.addEventListener('mouseleave',()=>tt.classList.remove('active'));
            fe.addEventListener('mousemove',e=>this.moveTooltip(e));
            fe.addEventListener('click',()=>this._showFeatureDetail(fe));
        });

        let booths=document.querySelectorAll('.booth');
        if(!booths.length){
            const found=[];
            document.querySelectorAll('#map-content svg [id]').forEach(el=>{
                const id=el.id.toLowerCase();
                if(id.match(/^booth[_-]?/)||id.match(/^\d+$/)){
                    if(['rect','circle','ellipse','polygon','path'].includes(el.tagName.toLowerCase())){el.classList.add('booth');found.push(el);}
                }
            });
            booths=found;
        }
        booths.forEach(b=>{
            if(b.classList.contains('map-feature'))return;
            const bid=this.extractId(b.id); if(!bid)return;
            b.addEventListener('click',()=>this.selectBooth(bid));
            b.addEventListener('mouseenter',e=>this.showTooltip(e,bid));
            b.addEventListener('mouseleave',()=>tt.classList.remove('active'));
            b.addEventListener('mousemove',e=>this.moveTooltip(e));
        });
    }

    selectBooth(bid){
        const d=this.eventsData[this.currentEvent], b=d?.booths?.[bid];
        this.currentBooth=bid;
        document.querySelectorAll('.booth').forEach(x=>x.classList.remove('selected'));
        const el=document.getElementById(`booth-${bid}`)||document.getElementById(bid)||document.querySelector(`[id*="${bid}"].booth`);
        if(el)el.classList.add('selected');
        if(!b){
            document.getElementById('detail-content').innerHTML=`<div class="detail-field"><label>Booth</label><div class="value" style="font-size:22px;font-weight:700;color:var(--primary);">${bid}</div></div><div class="detail-field"><div class="value empty">No data.</div></div><div class="button-group" style="margin-top:16px;"><button class="btn btn-primary" onclick="boothMap.createBoothData('${bid}')">Create Data</button></div>`;
            return;
        }
        this.showDetails(b);
    }

    createBoothData(bid){
        const d=this.eventsData[this.currentEvent];
        d.booths[bid]={boothId:bid,vendorName:'',businessName:'',vendorCategory:'Open',boothStatus:'open',boothSize:'10x10',notes:'',phone:'',email:'',missingItems:[],mapLabel:bid};
        this.saveEvent(this.currentEvent); this.selectBooth(bid); this.updateStats();
        this.notify('Booth data created');
    }

    showDetails(b){
        const p=document.getElementById('detail-content');
        const cat=this.categories[b.vendorCategory]||this.categories['Open'];
        p.innerHTML=`<div class="detail-field"><label>Booth</label><div class="value" style="font-size:22px;font-weight:700;color:var(--primary);">${b.mapLabel||b.boothId}</div></div><div class="detail-field"><label>Status</label><div class="value"><span class="booth-status-badge status-${b.boothStatus}">${b.boothStatus}</span></div></div><div class="detail-field"><label>Category</label><div class="value"><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:14px;height:14px;background:${cat.bgColor};border:2px solid ${cat.borderColor};border-radius:3px;"></span>${b.vendorCategory}</span></div></div><div class="detail-field"><label>Vendor</label><div class="value ${!b.vendorName?'empty':''}">${b.vendorName||'Not assigned'}</div></div><div class="detail-field"><label>Business</label><div class="value ${!b.businessName?'empty':''}">${b.businessName||'Not assigned'}</div></div><div class="detail-field"><label>Size</label><div class="value">${b.boothSize||'10x10'}</div></div>${b.phone?`<div class="detail-field"><label>Phone</label><div class="value">${b.phone}</div></div>`:''}${b.email?`<div class="detail-field"><label>Email</label><div class="value">${b.email}</div></div>`:''}${b.notes?`<div class="detail-field"><label>Notes</label><div class="value">${b.notes}</div></div>`:''}<div class="button-group" style="margin-top:16px;"><button class="btn btn-primary" onclick="boothMap.openEditModal(boothMap.eventsData['${this.currentEvent}'].booths['${b.boothId}'])">Edit</button>${b.boothStatus==='assigned'?`<button class="btn btn-secondary" onclick="boothMap.openMoveModal('${b.boothId}')">Move</button>`:''}</div>`;
    }

    showTooltip(e,bid){
        const d=this.eventsData[this.currentEvent], b=d?.booths?.[bid], tt=document.getElementById('tooltip');
        if(!b) tt.innerHTML=`<div class="tooltip-title">Booth ${bid}</div><div class="tooltip-info">No data</div>`;
        else tt.innerHTML=`<div class="tooltip-title">Booth ${b.mapLabel||bid}</div><div class="tooltip-info">${b.vendorName?`<strong>${b.vendorName}</strong><br>`:''}${b.businessName?`${b.businessName}<br>`:''}${b.vendorCategory} • ${b.boothStatus}</div>`;
        tt.classList.add('active'); this.moveTooltip(e);
    }
    moveTooltip(e){const t=document.getElementById('tooltip'),r=t.getBoundingClientRect();let x=e.clientX+12,y=e.clientY+12;x=Math.min(x,window.innerWidth-r.width-8);y=Math.min(y,window.innerHeight-r.height-8);t.style.left=x+'px';t.style.top=y+'px';}
    closeDetail(){this.currentBooth=null;document.querySelectorAll('.booth').forEach(b=>b.classList.remove('selected'));document.getElementById('detail-content').innerHTML='<p class="no-selection">Click a booth or feature to view details</p>';}

    // ===== FEATURE TOOLTIP & SIDEBAR =====
    _showFeatureTooltip(e, el) {
        const label = el.dataset.label || '';
        const desc = el.dataset.description || '';
        const type = el.tagName.toLowerCase();
        const typeNames = { rect:'Rectangle', circle:'Circle', ellipse:'Ellipse', polygon:el.getAttribute('points')?.split(' ').length <= 4 ? 'Triangle' : 'Polygon', line:'Line', path:'Path', text:'Text' };
        const typeName = typeNames[type] || 'Shape';
        const displayName = label || typeName;
        const tt = document.getElementById('tooltip');
        tt.innerHTML = `<div class="tooltip-title">${displayName}</div><div class="tooltip-info">${typeName}${desc ? '<br>' + desc : ''}</div>`;
        tt.classList.add('active'); this.moveTooltip(e);
    }
    _showFeatureDetail(el) {
        this._selectedEl = el;
        const label = el.dataset.label || '';
        const desc = el.dataset.description || '';
        const type = el.tagName.toLowerCase();
        const opacity = parseFloat(el.getAttribute('fill-opacity')) || 1;
        const fill = el.getAttribute('fill') || 'transparent';
        const typeNames = { rect:'Rectangle', circle:'Circle', ellipse:'Ellipse', polygon:'Polygon', line:'Line', path:'Path', text:'Text Label' };
        const typeName = typeNames[type] || 'Shape';
        document.querySelectorAll('.booth, .feature-el, .feature-text').forEach(b => b.classList.remove('selected'));
        el.classList.add('selected');

        document.getElementById('detail-content').innerHTML = `
            <div class="detail-field"><label>Shape Type</label><div class="value" style="font-size:18px;font-weight:700;color:var(--primary);">${typeName}</div></div>
            <div class="detail-field"><label>Label</label><div class="value">${label || '<span style="color:#999;font-style:italic;">No label</span>'}</div></div>
            <div class="detail-field"><label>Description</label><div class="value">${desc || '<span style="color:#999;font-style:italic;">No description</span>'}</div></div>
            <div class="detail-field"><label>Opacity</label><div class="value">${Math.round(opacity * 100)}%</div></div>
            <div class="button-group" style="margin-top:16px;">
                <button class="btn btn-primary" onclick="boothMap._editFeature('${el.id}')">Edit Shape</button>
                <button class="btn btn-danger" onclick="boothMap._deleteFeatureById('${el.id}')">Delete</button>
            </div>
        `;
        this._updateStatus();
    }
    _editFeature(id) {
        const el = document.getElementById(id); if (!el) return;
        const label = el.dataset.label || '';
        const desc = el.dataset.description || '';
        const currentFill = el.getAttribute('fill') || 'transparent';
        const currentOpacity = el.getAttribute('fill-opacity') || '1';

        let m = document.getElementById('feature-edit-dlg');
        if (!m) {
            m = document.createElement('div'); m.id = 'feature-edit-dlg'; m.className = 'modal';
            m.innerHTML = `<div class="modal-content" style="max-width:400px;"><div class="modal-header"><h3>Edit Feature</h3><button class="btn-close" onclick="document.getElementById('feature-edit-dlg').classList.remove('active')">&times;</button></div><div class="modal-body"><div class="form-group"><label>Label</label><input type="text" id="fe-label" placeholder="e.g., Restroom"></div><div class="form-group"><label>Description</label><textarea id="fe-desc" placeholder="Optional details..."></textarea></div><div class="form-group"><label>Fill Opacity</label><input type="range" id="fe-opacity" min="0" max="100" value="100" style="width:100%;"><div id="fe-opacity-val" style="font-size:12px;color:#666;margin-top:4px;">100%</div></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('feature-edit-dlg').classList.remove('active')">Cancel</button><button id="fe-ok" class="btn btn-primary">Save</button></div></div>`;
            document.body.appendChild(m);
            // Update range display
            document.getElementById('fe-opacity').addEventListener('input', e => {
                document.getElementById('fe-opacity-val').textContent = e.target.value + '%';
            });
        }
        document.getElementById('fe-label').value = label;
        document.getElementById('fe-desc').value = desc;
        document.getElementById('fe-opacity').value = Math.round((parseFloat(currentOpacity) || 1) * 100);
        document.getElementById('fe-opacity-val').textContent = Math.round((parseFloat(currentOpacity) || 1) * 100) + '%';
        m.classList.add('active');
        setTimeout(() => document.getElementById('fe-label').focus(), 50);

        const btn = document.getElementById('fe-ok');
        const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
            const newLabel = document.getElementById('fe-label').value.trim();
            const newDesc = document.getElementById('fe-desc').value.trim();
            const newOpacity = parseInt(document.getElementById('fe-opacity').value) / 100;

            el.dataset.label = newLabel;
            el.dataset.description = newDesc;
            el.setAttribute('fill-opacity', newOpacity);

            // Update or create label text
            const svg = document.querySelector('#map-content svg');
            // Remove old label
            const oldLabel = svg.querySelector(`.feature-label-text[data-for="${id}"]`);
            if (oldLabel) oldLabel.remove();

            if (newLabel) {
                const center = this._elCenter(el);
                const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                t.setAttribute('x', center.x); t.setAttribute('y', center.y);
                t.setAttribute('font-size', '10'); t.setAttribute('font-family', 'Arial, sans-serif');
                t.setAttribute('fill', '#555'); t.setAttribute('text-anchor', 'middle');
                t.setAttribute('pointer-events', 'none');
                t.setAttribute('class', 'feature-label-text');
                t.setAttribute('data-for', id);
                t.textContent = newLabel;
                svg.appendChild(t);
            }

            this._persistSvg(); m.classList.remove('active');
            this._showFeatureDetail(el);
            this.notify('Feature updated');
        });
    }
    _deleteFeatureById(id) {
        this._selectedEl = document.getElementById(id);
        if (this._selectedEl) this._deleteSelected();
    }

    // ===== MORE VISIBLE COLORS =====
    applyColors() {
        const d=this.eventsData[this.currentEvent]; if(!d?.booths)return;
        const opacity = this.boothOpacity !== undefined ? this.boothOpacity : 0.8;
        Object.entries(d.booths).forEach(([bid,b])=>{
            let el=document.getElementById(`booth-${bid}`)||document.getElementById(bid)||document.querySelector(`[id*="${bid}"].booth`);
            if(!el)return;
            const cat=this.categories[b.vendorCategory]||this.categories['Open'];
            if(b.boothStatus==='open'){el.style.fill=`rgba(255,255,255,${Math.max(0.08,opacity*0.25)})`;el.style.stroke='rgba(130,130,130,0.5)';el.style.strokeWidth='1';}
            else if(b.boothStatus==='unavailable'){el.style.fill='rgba(100,100,100,0.55)';el.style.stroke='#555';el.style.strokeWidth='2';}
            else{const rgb=this.hexToRgb(cat.bgColor||'#FCE4EC');el.style.fill=rgb?`rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`:cat.bgColor;el.style.stroke=cat.borderColor||'#333';el.style.strokeWidth='2.5';}
        });
    }
    hexToRgb(h){const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);return r?{r:parseInt(r[1],16),g:parseInt(r[2],16),b:parseInt(r[3],16)}:null;}

    applyFilters(){
        const d=this.eventsData[this.currentEvent]; if(!d?.booths)return;
        Object.entries(d.booths).forEach(([bid,b])=>{
            let el=document.getElementById(`booth-${bid}`)||document.getElementById(bid)||document.querySelector(`[id*="${bid}"].booth`);
            if(!el)return; let v=true;
            if(this.searchTerm){const f=[b.boothId,b.mapLabel,b.vendorName,b.businessName,b.vendorCategory].join(' ').toLowerCase();if(!f.includes(this.searchTerm))v=false;}
            if(this.categoryFilter!=='all'&&b.vendorCategory!==this.categoryFilter)v=false;
            if(this.statusFilter!=='all'&&b.boothStatus!==this.statusFilter)v=false;
            el.style.opacity=v?'1':'0.15';el.classList.toggle('filtered-out',!v);
        });
    }

    renderCategoryFilter(){const s=document.getElementById('category-filter');s.innerHTML='<option value="all">All Categories</option>';Object.keys(this.categories).forEach(c=>{if(c==='Open'||c==='Unavailable')return;const o=document.createElement('option');o.value=c;o.textContent=c;s.appendChild(o);});}
    renderLegend(){const c=document.getElementById('legend-container');c.innerHTML='';Object.entries(this.categories).forEach(([n,colors])=>{const i=document.createElement('div');i.className='legend-item';i.innerHTML=`<span class="legend-color" style="background:${colors.bgColor};border-color:${colors.borderColor};"></span><span>${n}</span>`;c.appendChild(i);});}
    updateStats(){
        const domBooths = document.querySelectorAll('.booth');
        const total = domBooths.length;
        const d = this.eventsData[this.currentEvent];
        const dataBooths = d?.booths ? Object.values(d.booths) : [];
        const domIds = new Set(Array.from(domBooths).map(b => this.extractId(b.id) || b.id));
        const assigned = dataBooths.filter(x => domIds.has(x.boothId) && x.boothStatus === 'assigned').length;
        const unavailable = dataBooths.filter(x => domIds.has(x.boothId) && x.boothStatus === 'unavailable').length;
        const open = Math.max(0, total - assigned - unavailable);
        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-assigned').textContent = assigned;
        document.getElementById('stat-open').textContent = open;
        document.getElementById('stat-unavailable').textContent = unavailable;
    }

    // ===== EDIT MODAL =====
    openEditModal(b) {
        const m=document.getElementById('edit-modal');
        document.getElementById('edit-booth-id').value=b.boothId;
        document.getElementById('edit-vendor-name').value=b.vendorName||'';
        document.getElementById('edit-business-name').value=b.businessName||'';
        document.getElementById('edit-phone').value=b.phone||'';
        document.getElementById('edit-email').value=b.email||'';
        document.getElementById('edit-notes').value=b.notes||'';
        const cat=document.getElementById('edit-category');cat.innerHTML='';
        Object.keys(this.categories).forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;if(c===b.vendorCategory)o.selected=true;cat.appendChild(o);});
        document.getElementById('edit-status').value=b.boothStatus;
        m.classList.add('active');
    }
    closeModal(){document.getElementById('edit-modal').classList.remove('active');}
    saveBoothEdit(){
        const id=document.getElementById('edit-booth-id').value;
        const d=this.eventsData[this.currentEvent];
        const b=d.booths[id];if(!b)return;
        b.vendorName=document.getElementById('edit-vendor-name').value.trim();
        b.businessName=document.getElementById('edit-business-name').value.trim();
        b.vendorCategory=document.getElementById('edit-category').value;
        b.boothStatus=document.getElementById('edit-status').value;
        b.phone=document.getElementById('edit-phone').value.trim();
        b.email=document.getElementById('edit-email').value.trim();
        b.notes=document.getElementById('edit-notes').value.trim();
        this.saveEvent(this.currentEvent);this.applyColors();this.updateStats();this.showDetails(b);this.closeModal();this.notify('Saved');
    }

    // ===== MOVE / SWAP =====
    openMoveModal(srcId){
        const d=this.eventsData[this.currentEvent];
        const src=d.booths[srcId];
        if(!src||src.boothStatus!=='assigned'){this.notify('Only assigned booths can be moved');return;}
        const opts=Object.entries(d.booths).filter(([id])=>id!==srcId).sort((a,b)=>(parseInt(a[0])||0)-(parseInt(b[0])||0));
        const html=opts.map(([id,b])=>`<option value="${id}">${b.vendorName?`${id} — ${b.vendorName} (${b.boothStatus})`:`${id} (${b.boothStatus})`}</option>`).join('');
        let m=document.getElementById('move-modal');
        if(!m){m=document.createElement('div');m.id='move-modal';m.className='modal';document.body.appendChild(m);}
        m.innerHTML=`<div class="modal-content" style="max-width:480px;"><div class="modal-header"><h3>Move — Booth ${srcId}</h3><button class="btn-close" onclick="document.getElementById('move-modal').classList.remove('active')">&times;</button></div><div class="modal-body"><div class="move-source-info"><strong>Moving:</strong> ${src.vendorName||'Unknown'}<br><strong>Business:</strong> ${src.businessName||'N/A'}</div><div class="form-group" style="margin-top:14px;"><label>Destination:</label><select id="mv-dest" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:14px;"><option value="">— Select —</option>${html}</select></div><div id="mv-warn" style="margin-top:10px;display:none;"></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('move-modal').classList.remove('active')">Cancel</button><button id="mv-btn" class="btn btn-primary" disabled>Move</button></div></div>`;
        const dest=m.querySelector('#mv-dest'),btn=m.querySelector('#mv-btn'),warn=m.querySelector('#mv-warn');
        dest.addEventListener('change',()=>{
            const did=dest.value;if(!did){btn.disabled=true;warn.style.display='none';return;}
            const db=d.booths[did];
            if(db?.boothStatus==='assigned'){warn.style.display='block';warn.innerHTML=`<div style="background:#FFF3E0;border:1px solid #FF9800;border-radius:4px;padding:10px;font-size:13px;"><strong>⚠️ Booth ${did} occupied</strong><br>This will <strong>SWAP</strong> both assignments.</div>`;btn.textContent='Swap';btn.disabled=false;}
            else if(db?.boothStatus==='unavailable'){warn.style.display='block';warn.innerHTML=`<div style="background:#FFEBEE;border:1px solid #F44336;border-radius:4px;padding:10px;font-size:13px;"><strong>❌ Booth ${did} unavailable</strong></div>`;btn.disabled=true;}
            else{warn.style.display='none';btn.textContent='Move';btn.disabled=false;}
        });
        btn.addEventListener('click',()=>{const did=dest.value;if(did){this.doMove(srcId,did);m.classList.remove('active');}});
        m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('active');});
        m.classList.add('active');
    }
    doMove(srcId,dstId){
        const d=this.eventsData[this.currentEvent];
        const src=d.booths[srcId],dst=d.booths[dstId];
        if(!src||!dst)return;
        const fields=['vendorName','businessName','vendorCategory','boothStatus','phone','email','notes','missingItems'];
        if(dst.boothStatus==='assigned'){const bk={};fields.forEach(f=>bk[f]=dst[f]);fields.forEach(f=>dst[f]=src[f]);fields.forEach(f=>src[f]=bk[f]);this.notify(`Swapped ${srcId} ↔ ${dstId}`);}
        else{fields.forEach(f=>dst[f]=src[f]);fields.forEach(f=>src[f]=f==='vendorCategory'?'Open':f==='boothStatus'?'open':f==='missingItems'?[]:'');this.notify(`Moved ${srcId} → ${dstId}`);}
        this.saveEvent(this.currentEvent);this.applyColors();this.updateStats();this.selectBooth(dstId);
    }

    // ===== EXPORT =====
    exportData(){
        const blob=new Blob([JSON.stringify(this.eventsData[this.currentEvent],null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;
        a.download=`event-${this.currentEvent}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);a.click();document.body.removeChild(a);
        URL.revokeObjectURL(url);this.notify('Data exported');
    }
    exportSVG(){
        const svg=document.querySelector('#map-content svg');if(!svg){this.notify('No SVG');return;}
        const clone=svg.cloneNode(true);
        clone.querySelectorAll('.resize-handle,.rotate-handle,.draw-preview').forEach(el=>el.remove());
        clone.querySelectorAll('.booth').forEach(b=>{b.style.cursor='';b.style.strokeDasharray='';});
        let str='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(clone);
        const blob=new Blob([str],{type:'image/svg+xml'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;
        const cfg=this.eventsConfig[this.currentEvent];
        const name=cfg?.mapFile?cfg.mapFile.split('/').pop().split('?')[0]:'map.svg';
        a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);
        URL.revokeObjectURL(url);this.notify(`Exported ${name}`);
    }
    async exportMapImage(format){
        const svgEl=document.querySelector('#map-content svg');if(!svgEl){this.notify('No map to export');return;}
        this.notify(`Rendering ${format.toUpperCase()}...`);
        // Clone and clean SVG
        const clone=svgEl.cloneNode(true);
        clone.querySelectorAll('.resize-handle,.rotate-handle,.draw-preview').forEach(el=>el.remove());
        clone.querySelectorAll('.booth').forEach(b=>{b.style.cursor='';b.style.strokeDasharray='';});
        // Serialize
        let svgStr='<?xml version="1.0" encoding="UTF-8"?>'+new XMLSerializer().serializeToString(clone);
        // Embed fonts and ensure proper rendering
        svgStr=svgStr.replace(/<svg/,'<svg xmlns="http://www.w3.org/2000/svg"');
        // Get dimensions
        const bbox=svgEl.getBBox?svgEl.getBBox():{x:0,y:0,width:800,height:600};
        const vb=svgEl.getAttribute('viewBox');
        let w=bbox.width||800,h=bbox.height||600;
        if(vb){const v=vb.split(/\s+/).map(parseFloat);w=v[2]||w;h=v[3]||h;}
        w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
        // Scale up for high-res output (max 4096px)
        const scale=Math.min(2,4096/Math.max(w,h));
        const cw=w*scale,ch=h*scale;
        // Convert to blob URL
        const blob=new Blob([svgStr],{type:'image/svg+xml;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        // Draw to canvas
        const img=new Image();
        const canvas=document.createElement('canvas');
        canvas.width=cw;canvas.height=ch;
        const ctx=canvas.getContext('2d');
        // White background for non-transparent formats
        if(format!=='png'){ctx.fillStyle='white';ctx.fillRect(0,0,cw,ch);}
        await new Promise((res,rej)=>{
            img.onload=()=>{ctx.drawImage(img,0,0,cw,ch);res();};
            img.onerror=rej;img.src=url;
        });
        URL.revokeObjectURL(url);
        // Export
        const mime=format==='jpeg'?'image/jpeg':'image/png';
        const quality=format==='jpeg'?0.92:undefined;
        const dataUrl=canvas.toDataURL(mime,quality);
        const a=document.createElement('a');
        a.href=dataUrl;
        const cfg=this.eventsConfig[this.currentEvent];
        const base=cfg?.name?.replace(/[^a-z0-9]/gi,'_')||this.currentEvent;
        a.download=`${base}_map.${format}`;
        document.body.appendChild(a);a.click();document.body.removeChild(a);
        this.notify(`Exported ${format.toUpperCase()}`);
    }
    showExportMapDlg(){
        let m=document.getElementById('export-map-dlg');
        if(!m){
            m=document.createElement('div');m.id='export-map-dlg';m.className='modal';
            m.innerHTML=`<div class="modal-content" style="max-width:420px;"><div class="modal-header"><h3>Export Map</h3><button class="btn-close" onclick="document.getElementById('export-map-dlg').classList.remove('active')">&times;</button></div><div class="modal-body"><div class="form-group"><label>Format</label><div class="export-options"><button class="export-opt" data-fmt="png"><div class="export-icon">PNG</div><div class="export-label">High quality, transparent</div></button><button class="export-opt" data-fmt="jpeg"><div class="export-icon">JPEG</div><div class="export-label">Small file, white bg</div></button><button class="export-opt" data-fmt="svg"><div class="export-icon">SVG</div><div class="export-label">Editable vector</div></button></div></div><div class="form-group"><label>Scale</label><select id="export-scale"><option value="1">1x (Original)</option><option value="2" selected>2x (Retina / Print)</option><option value="3">3x (Poster)</option></select></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('export-map-dlg').classList.remove('active')">Cancel</button></div></div>`;
            document.body.appendChild(m);
            // Add click handlers
            m.querySelectorAll('.export-opt').forEach(btn=>{
                btn.addEventListener('click',()=>{
                    const fmt=btn.dataset.fmt;
                    document.getElementById('export-map-dlg').classList.remove('active');
                    if(fmt==='svg')boothMap.exportSVG();else boothMap.exportMapImage(fmt);
                });
            });
        }
        m.classList.add('active');
    }

    // ===== POSITION EDITOR =====
    togglePositionMode(){
        this.positionMode=!this.positionMode;
        const btn=document.getElementById('btn-position-mode');
        const container=document.querySelector('.map-container');
        if(this.positionMode){
            btn.textContent='Exit Editor';btn.classList.add('btn-primary');btn.classList.remove('btn-secondary');
            container.classList.add('position-mode');this.enablePosEdit();this.showPosToolbar();
            this.notify('Position Editor ON — Drag=move | Orange=resize | Green=rotate | Ctrl+scroll=zoom | Space+drag=pan');
        }else{
            btn.textContent='Edit Positions';btn.classList.remove('btn-primary');btn.classList.add('btn-secondary');
            container.classList.remove('position-mode');this.disablePosEdit();this.hidePosToolbar();
            this.notify('Position Editor OFF');
        }
    }

    showPosToolbar(){
        let t=document.getElementById('position-toolbar');
        if(!t){t=document.createElement('div');t.id='position-toolbar';document.body.appendChild(t);}
        t.innerHTML=`<div class="toolbar-section"><strong>EDITOR</strong><span id="pos-status" style="margin-left:12px;opacity:0.8;font-size:12px;"></span></div><div class="toolbar-section"><button id="btn-booth" style="background:#4CAF50;color:white;">+ Booth</button><button id="btn-dbl" style="background:#66BB6A;color:white;">++ Dbl</button><button id="btn-rect" style="background:#7E57C2;color:white;">▭ Rect</button><button id="btn-circ" style="background:#42A5F5;color:white;">○ Circ</button><button id="btn-ellipse" style="background:#5C6BC0;color:white;">⬭ Ellip</button><button id="btn-tri" style="background:#FFA726;color:white;">△ Tri</button><button id="btn-hex" style="background:#8D6E63;color:white;">⬡ Hex</button><button id="btn-star" style="background:#EC407A;color:white;">★ Star</button><button id="btn-line" style="background:#78909C;color:white;">/ Line</button><button id="btn-arrow" style="background:#26A69A;color:white;">→ Arrow</button><button id="btn-text" style="background:#AB47BC;color:white;">T Text</button><button id="btn-rename" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.4);">Rename</button><button id="btn-delete" style="background:#F44336;color:white;">Delete</button></div><div class="toolbar-section"><button id="btn-export" style="background:#FFD54F;color:#333;">Export SVG</button><button id="btn-done" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.4);">Done</button></div>`;
        t.querySelector('#btn-export').onclick=()=>this.exportSVG();
        t.querySelector('#btn-done').onclick=()=>this.togglePositionMode();
        t.querySelector('#btn-booth').onclick=()=>this._enterDraw('booth');
        t.querySelector('#btn-dbl').onclick=()=>this._enterDraw('double');
        t.querySelector('#btn-rect').onclick=()=>this._enterDraw('rect');
        t.querySelector('#btn-circ').onclick=()=>this._enterDraw('circle');
        t.querySelector('#btn-ellipse').onclick=()=>this._enterDraw('ellipse');
        t.querySelector('#btn-tri').onclick=()=>this._enterDraw('triangle');
        t.querySelector('#btn-hex').onclick=()=>this._enterDraw('hexagon');
        t.querySelector('#btn-star').onclick=()=>this._enterDraw('star');
        t.querySelector('#btn-line').onclick=()=>this._enterDraw('line');
        t.querySelector('#btn-arrow').onclick=()=>this._enterDraw('arrow');
        t.querySelector('#btn-text').onclick=()=>this._enterDraw('text');
        t.querySelector('#btn-rename').onclick=()=>this._promptRename();
        t.querySelector('#btn-delete').onclick=()=>this._deleteSelected();
        t.style.display='flex';
    }
    hidePosToolbar(){const t=document.getElementById('position-toolbar');if(t)t.style.display='none';}

    // ===== ENABLE POSITION EDITING (THE FIX) =====
    enablePosEdit(){
        const svg=document.querySelector('#map-content svg');if(!svg)return;
        this._dragging=null;this._resizing=null;this._rotating=null;

        // Style and add handles to booths
        svg.querySelectorAll('.booth').forEach(booth=>{
            if(!booth.id)return;
            booth.style.stroke='rgba(21,101,192,0.6)';booth.style.strokeWidth='1.5';
            booth.style.strokeDasharray='4,2';booth.style.fill='rgba(21,101,192,0.05)';
            booth.style.cursor='move';
            this._addHandles(booth,svg);
        });

        // Style and add handles to features
        svg.querySelectorAll('.feature-el').forEach(feat=>{
            if(!feat.id)return;
            feat.style.cursor='move';
            this._addFeatureHandles(feat,svg);
        });

        // Style and add handles to text
        svg.querySelectorAll('.feature-text').forEach(txt=>{
            if(!txt.id)return;
            txt.style.cursor='move';
            this._addTextHandles(txt,svg);
        });

        this._svgPt=svg.createSVGPoint();
        this._toSvg=(e)=>{const ctm=svg.getScreenCTM();if(!ctm)return{x:0,y:0};this._svgPt.x=e.clientX;this._svgPt.y=e.clientY;return this._svgPt.matrixTransform(ctm.inverse());};

        // MOUSE DOWN
        this._onMd=(e)=>{
            const t=e.target,pt=this._toSvg(e);
            if(t.classList.contains('rotate-handle')){
                const el=document.getElementById(t.dataset.id);if(!el)return;
                e.preventDefault();e.stopPropagation();
                const center=this._elCenter(el);const rot=this._parseRot(el);
                this._rotating=el;this._rotHandle=t;this._rotCenter=center;
                this._rotStartAngle=Math.atan2(pt.y-center.y,pt.x-center.x)*180/Math.PI;
                this._rotBaseAngle=rot.a||0;
                this._dragState={startX:pt.x,startY:pt.y,el:el,center:center};
                return;
            }
            if(t.classList.contains('resize-handle')){
                const el=document.getElementById(t.dataset.id);if(!el)return;
                e.preventDefault();e.stopPropagation();
                this._resizing=el;this._resizeHandle=t;
                this._dragState={startX:pt.x,startY:pt.y,el:el,rect:this._getRect(el),angle:this._parseRot(el).a||0};
                return;
            }
            if((t.classList.contains('booth')||t.classList.contains('feature-el')||t.classList.contains('feature-text'))&&t.id){
                e.preventDefault();e.stopPropagation();
                this._selectedEl=t;this._updateStatus();
                const rot=this._parseRot(t);
                this._dragging=t;
                this._dragState={startX:pt.x,startY:pt.y,el:t,rect:this._getRect(t),angle:rot.a||0,origTransform:t.getAttribute('transform')||''};
                t.style.opacity='0.7';return;
            }
        };

        // MOUSE MOVE
        this._onMm=(e)=>{
            if(this._panning)return;
            if(!this._dragging&&!this._resizing&&!this._rotating)return;
            const pt=this._toSvg(e),ds=this._dragState;

            if(this._rotating){
                const cx=ds.center.x,cy=ds.center.y;
                const cur=Math.atan2(pt.y-cy,pt.x-cx)*180/Math.PI;
                let na=this._rotBaseAngle+(cur-this._rotStartAngle);
                if(e.shiftKey)na=Math.round(na/5)*5;
                const el=this._rotating,center=this._elCenter(el);
                this._setRot(el,na,center.x,center.y);
                const rh=document.querySelector(`.resize-handle[data-id="${el.id}"]`);
                if(rh)this._setRot(rh,na,center.x,center.y);
                const roth=document.querySelector(`.rotate-handle[data-id="${el.id}"]`);
                if(roth)this._setRot(roth,na,center.x,center.y);
                return;
            }

            if(this._dragging){
                const el=this._dragging,dx=pt.x-ds.startX,dy=pt.y-ds.startY;
                const tag=el.tagName.toLowerCase();
                if(tag==='text'){
                    // Text drag: just move x/y
                    el.setAttribute('x',ds.rect.x+dx);el.setAttribute('y',ds.rect.y+dy);
                }else if(tag==='circle'){
                    el.setAttribute('cx',ds.rect.cx+dx);el.setAttribute('cy',ds.rect.cy+dy);
                }else if(tag==='ellipse'){
                    el.setAttribute('cx',ds.rect.cx+dx);el.setAttribute('cy',ds.rect.cy+dy);
                }else if(tag==='line'){
                    el.setAttribute('x1',ds.rect.x1+dx);el.setAttribute('y1',ds.rect.y1+dy);
                    el.setAttribute('x2',ds.rect.x2+dx);el.setAttribute('y2',ds.rect.y2+dy);
                }else if(tag==='polygon'){
                    // For polygons, use transform translate
                    el.setAttribute('transform',`translate(${dx},${dy})`);
                }else{
                    el.setAttribute('x',ds.rect.x+dx);el.setAttribute('y',ds.rect.y+dy);
                }
                // Update rotation center if rotated
                const rot=this._parseRot(el);
                if(rot.raw!==null&&tag!=='polygon'){
                    const c=this._elCenter(el);
                    this._setRot(el,rot.a,c.x,c.y);
                }
                this._syncHandles(el);return;
            }

            if(this._resizing){
                const el=this._resizing,tag=el.tagName.toLowerCase(),r=ds.rect;
                const dx=pt.x-ds.startX,dy=pt.y-ds.startY;
                if(tag==='circle'){
                    const nr=Math.max(5,r.r+Math.hypot(dx,dy)/2);
                    el.setAttribute('r',nr);
                }else if(tag==='ellipse'){
                    const nrx=Math.max(5,r.rx+dx/2),nry=Math.max(5,r.ry+dy/2);
                    el.setAttribute('rx',nrx);el.setAttribute('ry',nry);
                }else if(tag==='line'||tag==='path'||tag==='polygon'){
                    // Scale polygon/line by transforming
                    const scaleX=Math.max(0.1,1+dx/(r.w||100)),scaleY=Math.max(0.1,1+dy/(r.h||100));
                    if(tag==='line'){
                        el.setAttribute('x2',r.x2+dx);el.setAttribute('y2',r.y2+dy);
                    }else{
                        el.setAttribute('transform',`scale(${scaleX},${scaleY})`);
                    }
                }else if(tag==='text'){
                    // Scale font size
                    const ns=Math.max(8,Math.round(r.fontSize*(1+Math.hypot(dx,dy)/100)));
                    el.setAttribute('font-size',ns);
                }else{
                    const nw=Math.max(10,r.w+dx),nh=Math.max(10,r.h+dy);
                    el.setAttribute('width',nw);el.setAttribute('height',nh);
                }
                this._syncHandles(el);return;
            }
        };

        // MOUSE UP
        this._onMu=()=>{
            let changed=false;
            if(this._dragging){
                // Commit polygon transform to points
                const el=this._dragging,tag=el.tagName.toLowerCase();
                if(tag==='polygon'){
                    const t=el.getAttribute('transform')||'';
                    const m=t.match(/translate\(([-\d.]+),([-\d.]+)\)/);
                    if(m){
                        const dx=parseFloat(m[1]),dy=parseFloat(m[2]);
                        const pts=el.getAttribute('points').split(/\s+/).filter(p=>p).map(pair=>{
                            const [x,y]=pair.split(',').map(parseFloat);
                            return `${x+dx},${y+dy}`;
                        });
                        el.setAttribute('points',pts.join(' '));
                        el.removeAttribute('transform');
                    }
                }
                this._dragging.style.opacity='';this._dragging=null;changed=true;
            }
            if(this._resizing){this._resizing=null;this._resizeHandle=null;changed=true;}
            if(this._rotating){this._rotating=null;this._rotHandle=null;changed=true;}
            if(changed)this._persistSvg();
        };

        svg.addEventListener('mousedown',this._onMd);
        document.addEventListener('mousemove',this._onMm);
        document.addEventListener('mouseup',this._onMu);
    }

    // Element geometry
    _getRect(el){
        const tag=el.tagName.toLowerCase();
        if(tag==='circle')return{cx:parseFloat(el.getAttribute('cx'))||0,cy:parseFloat(el.getAttribute('cy'))||0,r:parseFloat(el.getAttribute('r'))||20};
        if(tag==='ellipse')return{cx:parseFloat(el.getAttribute('cx'))||0,cy:parseFloat(el.getAttribute('cy'))||0,rx:parseFloat(el.getAttribute('rx'))||20,ry:parseFloat(el.getAttribute('ry'))||15};
        if(tag==='line')return{x1:parseFloat(el.getAttribute('x1'))||0,y1:parseFloat(el.getAttribute('y1'))||0,x2:parseFloat(el.getAttribute('x2'))||0,y2:parseFloat(el.getAttribute('y2'))||0};
        if(tag==='text')return{x:parseFloat(el.getAttribute('x'))||0,y:parseFloat(el.getAttribute('y'))||0,fontSize:parseFloat(el.getAttribute('font-size'))||14};
        if(tag==='polygon'){
            const pts=el.getAttribute('points')||'0,0';
            const coords=pts.split(/\s+/).filter(p=>p).map(p=>p.split(',').map(parseFloat));
            const xs=coords.map(c=>c[0]),ys=coords.map(c=>c[1]);
            return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
        }
        return{x:parseFloat(el.getAttribute('x'))||0,y:parseFloat(el.getAttribute('y'))||0,w:parseFloat(el.getAttribute('width'))||30,h:parseFloat(el.getAttribute('height'))||30};
    }
    _elCenter(el){
        const tag=el.tagName.toLowerCase(),r=this._getRect(el);
        if(tag==='circle')return{x:r.cx,y:r.cy};
        if(tag==='ellipse')return{x:r.cx,y:r.cy};
        if(tag==='line')return{x:(r.x1+r.x2)/2,y:(r.y1+r.y2)/2};
        if(tag==='text')return{x:r.x,y:r.y};
        if(tag==='polygon')return{x:r.x+r.w/2,y:r.y+r.h/2};
        return{x:r.x+r.w/2,y:r.y+r.h/2};
    }

    _syncHandles(el){
        const id=el.id,tag=el.tagName.toLowerCase(),center=this._elCenter(el);
        const rot=this._parseRot(el);
        const tStr=rot.raw!==null?`rotate(${rot.a.toFixed(1)},${center.x.toFixed(1)},${center.y.toFixed(1)})`:'';

        if(tag==='circle'){
            const r=parseFloat(el.getAttribute('r'))||20;
            const rh=document.querySelector(`.resize-handle[data-id="${id}"]`);
            if(rh){rh.setAttribute('cx',center.x+r*0.7);rh.setAttribute('cy',center.y-r*0.7);if(tStr)rh.setAttribute('transform',tStr);}
            const roth=document.querySelector(`.rotate-handle[data-id="${id}"]`);
            if(roth){roth.setAttribute('cx',center.x);roth.setAttribute('cy',center.y-r-10);if(tStr)roth.setAttribute('transform',tStr);}
        }else if(tag==='ellipse'){
            const rx=parseFloat(el.getAttribute('rx'))||20,ry=parseFloat(el.getAttribute('ry'))||15;
            const rh=document.querySelector(`.resize-handle[data-id="${id}"]`);
            if(rh){rh.setAttribute('cx',center.x+rx*0.7);rh.setAttribute('cy',center.y-ry*0.7);if(tStr)rh.setAttribute('transform',tStr);}
            const roth=document.querySelector(`.rotate-handle[data-id="${id}"]`);
            if(roth){roth.setAttribute('cx',center.x);roth.setAttribute('cy',center.y-ry-10);if(tStr)roth.setAttribute('transform',tStr);}
        }else if(tag==='line'){
            const x2=parseFloat(el.getAttribute('x2')),y2=parseFloat(el.getAttribute('y2'));
            const rh=document.querySelector(`.resize-handle[data-id="${id}"]`);
            if(rh){rh.setAttribute('cx',x2);rh.setAttribute('cy',y2);}
        }else if(tag==='text'){
            const x=parseFloat(el.getAttribute('x'))||0,y=parseFloat(el.getAttribute('y'))||0;
            const roth=document.querySelector(`.rotate-handle[data-id="${id}"]`);
            if(roth){roth.setAttribute('cx',x);roth.setAttribute('cy',y-10);if(tStr)roth.setAttribute('transform',tStr);}
            // Also update text resize handle
            const rh=document.querySelector(`.resize-handle[data-id="${id}"]`);
            if(rh){rh.setAttribute('cx',x+20);rh.setAttribute('cy',y);if(tStr)rh.setAttribute('transform',tStr);}
        }else if(tag==='polygon'){
            const rh=document.querySelector(`.resize-handle[data-id="${id}"]`);
            if(rh){rh.setAttribute('cx',center.x+r.w*0.5);rh.setAttribute('cy',center.y-r.h*0.5);}
            const roth=document.querySelector(`.rotate-handle[data-id="${id}"]`);
            if(roth){roth.setAttribute('cx',center.x);roth.setAttribute('cy',center.y-r.h*0.7);}
        }else{
            const x=parseFloat(el.getAttribute('x'))||0,y=parseFloat(el.getAttribute('y'))||0;
            const w=parseFloat(el.getAttribute('width'))||30,h=parseFloat(el.getAttribute('height'))||30;
            const rh=document.querySelector(`.resize-handle[data-id="${id}"]`);
            if(rh){rh.setAttribute('x',x+w-6);rh.setAttribute('y',y+h-6);if(tStr)rh.setAttribute('transform',tStr);}
            const roth=document.querySelector(`.rotate-handle[data-id="${id}"]`);
            if(roth){roth.setAttribute('cx',center.x);roth.setAttribute('cy',y-12);if(tStr)roth.setAttribute('transform',tStr);}
        }
    }

    _addHandles(el,svg){
        const id=el.id;
        const x=parseFloat(el.getAttribute('x'))||0,y=parseFloat(el.getAttribute('y'))||0;
        const w=parseFloat(el.getAttribute('width'))||30,h=parseFloat(el.getAttribute('height'))||30;
        const rot=this._parseRot(el);
        const tStr=rot.raw!==null?`rotate(${rot.a.toFixed(1)},${(x+w/2).toFixed(1)},${(y+h/2).toFixed(1)})`:'';
        const rh=document.createElementNS('http://www.w3.org/2000/svg','rect');
        rh.setAttribute('x',x+w-6);rh.setAttribute('y',y+h-6);rh.setAttribute('width',8);rh.setAttribute('height',8);
        rh.setAttribute('fill','#FF5722');rh.setAttribute('stroke','white');rh.setAttribute('stroke-width','1');
        rh.style.cursor='nwse-resize';rh.classList.add('resize-handle');rh.dataset.id=id;
        if(tStr)rh.setAttribute('transform',tStr);svg.appendChild(rh);
        const roth=document.createElementNS('http://www.w3.org/2000/svg','circle');
        roth.setAttribute('cx',x+w/2);roth.setAttribute('cy',y-12);roth.setAttribute('r',5);
        roth.setAttribute('fill','#4CAF50');roth.setAttribute('stroke','white');roth.setAttribute('stroke-width','1.5');
        roth.style.cursor='grab';roth.classList.add('rotate-handle');roth.dataset.id=id;
        if(tStr)roth.setAttribute('transform',tStr);svg.appendChild(roth);
    }

    _addFeatureHandles(el,svg){
        const id=el.id,tag=el.tagName.toLowerCase();
        const ns='http://www.w3.org/2000/svg';
        if(tag==='circle'){
            const cx=parseFloat(el.getAttribute('cx'))||0,cy=parseFloat(el.getAttribute('cy'))||0,r=parseFloat(el.getAttribute('r'))||20;
            const rh=document.createElementNS(ns,'circle');
            rh.setAttribute('cx',cx+r*0.7);rh.setAttribute('cy',cy-r*0.7);rh.setAttribute('r',5);
            rh.setAttribute('fill','#FF9800');rh.setAttribute('stroke','white');rh.setAttribute('stroke-width','1');
            rh.style.cursor='nwse-resize';rh.classList.add('resize-handle');rh.dataset.id=id;svg.appendChild(rh);
            const roth=document.createElementNS(ns,'circle');
            roth.setAttribute('cx',cx);roth.setAttribute('cy',cy-r-10);roth.setAttribute('r',5);
            roth.setAttribute('fill','#4CAF50');roth.setAttribute('stroke','white');roth.setAttribute('stroke-width','1.5');
            roth.style.cursor='grab';roth.classList.add('rotate-handle');roth.dataset.id=id;svg.appendChild(roth);
        }else if(tag==='ellipse'){
            const cx=parseFloat(el.getAttribute('cx'))||0,cy=parseFloat(el.getAttribute('cy'))||0;
            const rx=parseFloat(el.getAttribute('rx'))||20,ry=parseFloat(el.getAttribute('ry'))||15;
            const rh=document.createElementNS(ns,'circle');
            rh.setAttribute('cx',cx+rx*0.7);rh.setAttribute('cy',cy-ry*0.7);rh.setAttribute('r',5);
            rh.setAttribute('fill','#FF9800');rh.setAttribute('stroke','white');rh.setAttribute('stroke-width','1');
            rh.style.cursor='nwse-resize';rh.classList.add('resize-handle');rh.dataset.id=id;svg.appendChild(rh);
            const roth=document.createElementNS(ns,'circle');
            roth.setAttribute('cx',cx);roth.setAttribute('cy',cy-ry-10);roth.setAttribute('r',5);
            roth.setAttribute('fill','#4CAF50');roth.setAttribute('stroke','white');roth.setAttribute('stroke-width','1.5');
            roth.style.cursor='grab';roth.classList.add('rotate-handle');roth.dataset.id=id;svg.appendChild(roth);
        }else if(tag==='line'){
            const x2=parseFloat(el.getAttribute('x2'))||0,y2=parseFloat(el.getAttribute('y2'))||0;
            const rh=document.createElementNS(ns,'circle');
            rh.setAttribute('cx',x2);rh.setAttribute('cy',y2);rh.setAttribute('r',5);
            rh.setAttribute('fill','#FF9800');rh.setAttribute('stroke','white');rh.setAttribute('stroke-width','1');
            rh.style.cursor='nwse-resize';rh.classList.add('resize-handle');rh.dataset.id=id;svg.appendChild(rh);
        }else if(tag==='polygon'){
            const bbox=el.getBBox?el.getBBox():{x:0,y:0,width:30,height:30};
            const rh=document.createElementNS(ns,'circle');
            rh.setAttribute('cx',bbox.x+bbox.width);rh.setAttribute('cy',bbox.y);rh.setAttribute('r',5);
            rh.setAttribute('fill','#FF9800');rh.setAttribute('stroke','white');rh.setAttribute('stroke-width','1');
            rh.style.cursor='nwse-resize';rh.classList.add('resize-handle');rh.dataset.id=id;svg.appendChild(rh);
            const roth=document.createElementNS(ns,'circle');
            roth.setAttribute('cx',bbox.x+bbox.width/2);roth.setAttribute('cy',bbox.y-10);roth.setAttribute('r',5);
            roth.setAttribute('fill','#4CAF50');roth.setAttribute('stroke','white');roth.setAttribute('stroke-width','1.5');
            roth.style.cursor='grab';roth.classList.add('rotate-handle');roth.dataset.id=id;svg.appendChild(roth);
        }else{
            const x=parseFloat(el.getAttribute('x'))||0,y=parseFloat(el.getAttribute('y'))||0;
            const w=parseFloat(el.getAttribute('width'))||30,h=parseFloat(el.getAttribute('height'))||30;
            const rh=document.createElementNS(ns,'rect');
            rh.setAttribute('x',x+w-6);rh.setAttribute('y',y+h-6);rh.setAttribute('width',8);rh.setAttribute('height',8);
            rh.setAttribute('fill','#FF9800');rh.setAttribute('stroke','white');rh.setAttribute('stroke-width','1');
            rh.style.cursor='nwse-resize';rh.classList.add('resize-handle');rh.dataset.id=id;svg.appendChild(rh);
            const roth=document.createElementNS(ns,'circle');
            roth.setAttribute('cx',x+w/2);roth.setAttribute('cy',y-12);roth.setAttribute('r',5);
            roth.setAttribute('fill','#4CAF50');roth.setAttribute('stroke','white');roth.setAttribute('stroke-width','1.5');
            roth.style.cursor='grab';roth.classList.add('rotate-handle');roth.dataset.id=id;svg.appendChild(roth);
        }
    }

    _addTextHandles(el,svg){
        const id=el.id;
        const x=parseFloat(el.getAttribute('x'))||0,y=parseFloat(el.getAttribute('y'))||0;
        const ns='http://www.w3.org/2000/svg';
        // Rotate handle
        const roth=document.createElementNS(ns,'circle');
        roth.setAttribute('cx',x);roth.setAttribute('cy',y-10);roth.setAttribute('r',5);
        roth.setAttribute('fill','#4CAF50');roth.setAttribute('stroke','white');roth.setAttribute('stroke-width','1.5');
        roth.style.cursor='grab';roth.classList.add('rotate-handle');roth.dataset.id=id;svg.appendChild(roth);
        // Scale/resize handle (scales font size)
        const rh=document.createElementNS(ns,'circle');
        rh.setAttribute('cx',x+25);rh.setAttribute('cy',y);rh.setAttribute('r',5);
        rh.setAttribute('fill','#FF9800');rh.setAttribute('stroke','white');rh.setAttribute('stroke-width','1');
        rh.style.cursor='ew-resize';rh.classList.add('resize-handle');rh.dataset.id=id;svg.appendChild(rh);
    }

    _persistSvg(){
        const svg=document.querySelector('#map-content svg');if(!svg)return;
        const clone=svg.cloneNode(true);
        clone.querySelectorAll('.resize-handle,.rotate-handle,.draw-preview').forEach(el=>el.remove());
        clone.querySelectorAll('.booth,.feature-el,.feature-text').forEach(b=>{b.style.cursor='';b.style.opacity='';b.style.strokeDasharray='';});
        this.saveSvg(this.currentEvent,clone.outerHTML);
    }

    disablePosEdit(){
        const svg=document.querySelector('#map-content svg');if(!svg)return;
        if(this._onMd)svg.removeEventListener('mousedown',this._onMd);
        if(this._onMm)document.removeEventListener('mousemove',this._onMm);
        if(this._onMu)document.removeEventListener('mouseup',this._onMu);
        svg.querySelectorAll('.resize-handle,.rotate-handle,.draw-preview').forEach(h=>h.remove());
        svg.querySelectorAll('.booth,.feature-el,.feature-text').forEach(b=>{b.style.cursor='';b.style.opacity='';b.style.strokeDasharray='';});
        this._persistSvg();this.applyColors();this.positionMode=false;
        if(this.drawMode)this._exitDraw();
    }

    _updateStatus(){
        const s=document.getElementById('pos-status');
        if(s){const id=this._selectedEl?(this._selectedEl.id||''):'';s.textContent=id?`Selected: ${id.replace('booth-','')}`:'';}
    }

    // ===== DRAW SHAPES =====
    _enterDraw(type) {
        if (this.drawMode) { this._exitDraw(); if (this.drawType === type) return; }
        this.drawMode = true; this.drawType = type;
        const svg = document.querySelector('#map-content svg'); if (!svg) return;
        document.querySelector('.draw-mode-indicator')?.remove();
        const ind = document.createElement('div'); ind.className = 'draw-mode-indicator';
        const labels = { booth: 'Draw Booth — click & drag', double: 'Draw Double Booth — click & drag', rect: 'Draw Rectangle — click & drag', circle: 'Draw Circle — click & drag', ellipse: 'Draw Ellipse — click & drag', triangle: 'Draw Triangle — click & drag', hexagon: 'Draw Hexagon — click & drag', star: 'Draw Star — click & drag', line: 'Draw Line — click & drag', arrow: 'Draw Arrow — click & drag', text: 'Place Text — click on map' };
        ind.textContent = labels[type] || 'Draw — click & drag'; document.body.appendChild(ind);

        if (type === 'text') {
            this._drawClick = (e) => { if (!this.drawMode) return; const pt = this._toSvgCoords(svg, e); this._exitDraw(); this._showTextDlg(pt.x, pt.y); e.stopPropagation(); };
            svg.addEventListener('click', this._drawClick); return;
        }

        this._drawMD = (e) => {
            if (!this.drawMode) return;
            if (e.target.classList.contains('resize-handle') || e.target.classList.contains('rotate-handle')) return;
            const pt = this._toSvgCoords(svg, e); this._drawStart = pt;
            if (this._drawPreview) this._drawPreview.remove();
            const preview = this._createPreview(type, pt.x, pt.y);
            svg.appendChild(preview); this._drawPreview = preview;
            e.preventDefault(); e.stopPropagation();
        };
        this._drawMM = (e) => {
            if (!this.drawMode || !this._drawStart || !this._drawPreview) return;
            const pt = this._toSvgCoords(svg, e);
            this._updatePreview(this._drawPreview, type, this._drawStart, pt);
        };
        this._drawMU = (e) => {
            if (!this.drawMode || !this._drawStart || !this._drawPreview) return;
            const pt = this._toSvgCoords(svg, e);
            const shape = this._finalizeShape(type, this._drawStart, pt);
            this._drawPreview.remove(); this._drawPreview = null; this._drawStart = null;
            if (!shape) return;
            e.stopPropagation();
        };
        svg.addEventListener('mousedown', this._drawMD);
        document.addEventListener('mousemove', this._drawMM);
        document.addEventListener('mouseup', this._drawMU);
    }

    _exitDraw() {
        this.drawMode = false;
        const svg = document.querySelector('#map-content svg');
        if (svg) {
            if (this._drawMD) svg.removeEventListener('mousedown', this._drawMD);
            if (this._drawMM) document.removeEventListener('mousemove', this._drawMM);
            if (this._drawMU) document.removeEventListener('mouseup', this._drawMU);
            if (this._drawClick) svg.removeEventListener('click', this._drawClick);
            if (this._drawPreview) { this._drawPreview.remove(); this._drawPreview = null; }
        }
        this._drawStart = null; document.querySelector('.draw-mode-indicator')?.remove();
    }

    _toSvgCoords(svg, e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const ctm = svg.getScreenCTM(); return ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 }; }

    _createPreview(type, x, y) {
        const ns = 'http://www.w3.org/2000/svg';
        switch (type) {
            case 'circle': { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 1); c.setAttribute('fill', 'rgba(66,165,245,0.25)'); c.setAttribute('stroke', '#42A5F5'); c.setAttribute('stroke-width', '2'); c.setAttribute('stroke-dasharray', '5,3'); c.classList.add('draw-preview'); c.style.pointerEvents = 'none'; return c; }
            case 'ellipse': { const el = document.createElementNS(ns, 'ellipse'); el.setAttribute('cx', x); el.setAttribute('cy', y); el.setAttribute('rx', 1); el.setAttribute('ry', 0.5); el.setAttribute('fill', 'rgba(92,107,192,0.25)'); el.setAttribute('stroke', '#5C6BC0'); el.setAttribute('stroke-width', '2'); el.setAttribute('stroke-dasharray', '5,3'); el.classList.add('draw-preview'); el.style.pointerEvents = 'none'; return el; }
            case 'triangle': { const pol = document.createElementNS(ns, 'polygon'); pol.setAttribute('points', `${x},${y}`); pol.setAttribute('fill', 'rgba(255,167,38,0.25)'); pol.setAttribute('stroke', '#FFA726'); pol.setAttribute('stroke-width', '2'); pol.setAttribute('stroke-dasharray', '5,3'); pol.classList.add('draw-preview'); pol.style.pointerEvents = 'none'; return pol; }
            case 'hexagon': { const pol = document.createElementNS(ns, 'polygon'); pol.setAttribute('points', `${x},${y}`); pol.setAttribute('fill', 'rgba(141,110,99,0.25)'); pol.setAttribute('stroke', '#8D6E63'); pol.setAttribute('stroke-width', '2'); pol.setAttribute('stroke-dasharray', '5,3'); pol.classList.add('draw-preview'); pol.style.pointerEvents = 'none'; return pol; }
            case 'star': { const pol = document.createElementNS(ns, 'polygon'); pol.setAttribute('points', `${x},${y}`); pol.setAttribute('fill', 'rgba(236,64,122,0.25)'); pol.setAttribute('stroke', '#EC407A'); pol.setAttribute('stroke-width', '2'); pol.setAttribute('stroke-dasharray', '5,3'); pol.classList.add('draw-preview'); pol.style.pointerEvents = 'none'; return pol; }
            case 'line': { const ln = document.createElementNS(ns, 'line'); ln.setAttribute('x1', x); ln.setAttribute('y1', y); ln.setAttribute('x2', x); ln.setAttribute('y2', y); ln.setAttribute('stroke', '#78909C'); ln.setAttribute('stroke-width', '3'); ln.setAttribute('stroke-dasharray', '5,3'); ln.classList.add('draw-preview'); ln.style.pointerEvents = 'none'; return ln; }
            case 'arrow': { const ln = document.createElementNS(ns, 'line'); ln.setAttribute('x1', x); ln.setAttribute('y1', y); ln.setAttribute('x2', x); ln.setAttribute('y2', y); ln.setAttribute('stroke', '#26A69A'); ln.setAttribute('stroke-width', '3'); ln.setAttribute('marker-end', 'url(#arrowhead)'); ln.setAttribute('stroke-dasharray', '5,3'); ln.classList.add('draw-preview'); ln.style.pointerEvents = 'none'; return ln; }
            default: { const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 1); r.setAttribute('height', 1); r.setAttribute('fill', type === 'double' ? 'rgba(102,187,106,0.25)' : 'rgba(76,175,80,0.25)'); r.setAttribute('stroke', type === 'double' ? '#66BB6A' : '#4CAF50'); r.setAttribute('stroke-width', '2'); r.setAttribute('stroke-dasharray', '5,3'); r.classList.add('draw-preview'); r.style.pointerEvents = 'none'; return r; }
        }
    }

    _updatePreview(el, type, start, pt) {
        switch (type) {
            case 'circle': { const r = Math.max(1, Math.hypot(pt.x - start.x, pt.y - start.y)); el.setAttribute('r', r); break; }
            case 'ellipse': { const rx = Math.max(1, Math.abs(pt.x - start.x)); const ry = Math.max(1, Math.abs(pt.y - start.y)); el.setAttribute('rx', rx); el.setAttribute('ry', ry); break; }
            case 'triangle': {
                const h = Math.abs(pt.y - start.y); const w = Math.abs(pt.x - start.x);
                const x1 = start.x, y1 = start.y - h;
                const x2 = start.x - w * 0.866, y2 = start.y + h * 0.5;
                const x3 = start.x + w * 0.866, y3 = start.y + h * 0.5;
                el.setAttribute('points', `${x1},${y1} ${x2},${y2} ${x3},${y3}`); break;
            }
            case 'hexagon': {
                const r = Math.max(1, Math.hypot(pt.x - start.x, pt.y - start.y));
                const pts = []; for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; pts.push(`${start.x + r * Math.cos(a)},${start.y + r * Math.sin(a)}`); }
                el.setAttribute('points', pts.join(' ')); break;
            }
            case 'star': {
                const r1 = Math.max(1, Math.hypot(pt.x - start.x, pt.y - start.y));
                const r2 = r1 * 0.4; const pts = [];
                for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2; const r = i % 2 === 0 ? r1 : r2; pts.push(`${start.x + r * Math.cos(a)},${start.y + r * Math.sin(a)}`); }
                el.setAttribute('points', pts.join(' ')); break;
            }
            case 'line':
            case 'arrow': { el.setAttribute('x2', pt.x); el.setAttribute('y2', pt.y); break; }
            default: { const x = Math.min(pt.x, start.x), y = Math.min(pt.y, start.y); const w = Math.max(1, Math.abs(pt.x - start.x)), h = Math.max(1, Math.abs(pt.y - start.y)); el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('width', w); el.setAttribute('height', h); break; }
        }
    }

    _finalizeShape(type, start, pt) {
        const svg = document.querySelector('#map-content svg'); if (!svg) return null;
        const ns = 'http://www.w3.org/2000/svg';
        const id = 'feature_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);

        switch (type) {
            case 'circle': {
                const r = Math.round(Math.max(5, Math.hypot(pt.x - start.x, pt.y - start.y)));
                if (r < 5) return null;
                const c = document.createElementNS(ns, 'circle');
                c.id = id; c.setAttribute('cx', start.x); c.setAttribute('cy', start.y); c.setAttribute('r', r);
                c.setAttribute('fill', '#42A5F5'); c.setAttribute('fill-opacity', '0.5');
                c.setAttribute('stroke', '#42A5F5'); c.setAttribute('stroke-width', '2');
                c.classList.add('feature-el'); svg.appendChild(c); break;
            }
            case 'ellipse': {
                const rx = Math.round(Math.max(5, Math.abs(pt.x - start.x)));
                const ry = Math.round(Math.max(5, Math.abs(pt.y - start.y)));
                if (rx < 5 || ry < 5) return null;
                const el = document.createElementNS(ns, 'ellipse');
                el.id = id; el.setAttribute('cx', start.x); el.setAttribute('cy', start.y);
                el.setAttribute('rx', rx); el.setAttribute('ry', ry);
                el.setAttribute('fill', '#5C6BC0'); el.setAttribute('fill-opacity', '0.5');
                el.setAttribute('stroke', '#5C6BC0'); el.setAttribute('stroke-width', '2');
                el.classList.add('feature-el'); svg.appendChild(el); break;
            }
            case 'triangle': {
                const h = Math.abs(pt.y - start.y); const w = Math.abs(pt.x - start.x);
                if (w < 6 || h < 6) return null;
                const x1 = start.x, y1 = start.y - h;
                const x2 = start.x - w * 0.866, y2 = start.y + h * 0.5;
                const x3 = start.x + w * 0.866, y3 = start.y + h * 0.5;
                const pol = document.createElementNS(ns, 'polygon');
                pol.id = id; pol.setAttribute('points', `${x1},${y1} ${x2},${y2} ${x3},${y3}`);
                pol.setAttribute('fill', '#FFA726'); pol.setAttribute('fill-opacity', '0.5');
                pol.setAttribute('stroke', '#FFA726'); pol.setAttribute('stroke-width', '2');
                pol.classList.add('feature-el'); svg.appendChild(pol); break;
            }
            case 'hexagon': {
                const r = Math.max(5, Math.hypot(pt.x - start.x, pt.y - start.y));
                if (r < 5) return null;
                const pts = []; for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; pts.push(`${start.x + r * Math.cos(a)},${start.y + r * Math.sin(a)}`); }
                const pol = document.createElementNS(ns, 'polygon');
                pol.id = id; pol.setAttribute('points', pts.join(' '));
                pol.setAttribute('fill', '#8D6E63'); pol.setAttribute('fill-opacity', '0.5');
                pol.setAttribute('stroke', '#8D6E63'); pol.setAttribute('stroke-width', '2');
                pol.classList.add('feature-el'); svg.appendChild(pol); break;
            }
            case 'star': {
                const r1 = Math.max(5, Math.hypot(pt.x - start.x, pt.y - start.y));
                if (r1 < 5) return null;
                const r2 = r1 * 0.4; const pts = [];
                for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2; const r = i % 2 === 0 ? r1 : r2; pts.push(`${start.x + r * Math.cos(a)},${start.y + r * Math.sin(a)}`); }
                const pol = document.createElementNS(ns, 'polygon');
                pol.id = id; pol.setAttribute('points', pts.join(' '));
                pol.setAttribute('fill', '#EC407A'); pol.setAttribute('fill-opacity', '0.5');
                pol.setAttribute('stroke', '#EC407A'); pol.setAttribute('stroke-width', '2');
                pol.classList.add('feature-el'); svg.appendChild(pol); break;
            }
            case 'line': {
                if (Math.hypot(pt.x - start.x, pt.y - start.y) < 5) return null;
                const ln = document.createElementNS(ns, 'line');
                ln.id = id; ln.setAttribute('x1', start.x); ln.setAttribute('y1', start.y); ln.setAttribute('x2', pt.x); ln.setAttribute('y2', pt.y);
                ln.setAttribute('stroke', '#78909C'); ln.setAttribute('stroke-width', '3'); ln.setAttribute('stroke-linecap', 'round');
                ln.classList.add('feature-el'); svg.appendChild(ln); break;
            }
            case 'arrow': {
                if (Math.hypot(pt.x - start.x, pt.y - start.y) < 5) return null;
                if (!svg.querySelector('#arrowhead')) {
                    const defs = document.createElementNS(ns, 'defs');
                    const marker = document.createElementNS(ns, 'marker');
                    marker.id = 'arrowhead'; marker.setAttribute('markerWidth', '10'); marker.setAttribute('markerHeight', '7');
                    marker.setAttribute('refX', '9'); marker.setAttribute('refY', '3.5'); marker.setAttribute('orient', 'auto');
                    const pol = document.createElementNS(ns, 'polygon');
                    pol.setAttribute('points', '0 0, 10 3.5, 0 7'); pol.setAttribute('fill', '#26A69A');
                    marker.appendChild(pol); defs.appendChild(marker); svg.prepend(defs);
                }
                const ln = document.createElementNS(ns, 'line');
                ln.id = id; ln.setAttribute('x1', start.x); ln.setAttribute('y1', start.y); ln.setAttribute('x2', pt.x); ln.setAttribute('y2', pt.y);
                ln.setAttribute('stroke', '#26A69A'); ln.setAttribute('stroke-width', '3'); ln.setAttribute('stroke-linecap', 'round');
                ln.setAttribute('marker-end', 'url(#arrowhead)');
                ln.classList.add('feature-el'); svg.appendChild(ln); break;
            }
            case 'rect': {
                const x = Math.round(Math.min(pt.x, start.x)), y = Math.round(Math.min(pt.y, start.y));
                let w = Math.round(Math.abs(pt.x - start.x)), h = Math.round(Math.abs(pt.y - start.y));
                if (w < 6 || h < 6) return null;
                const rect = document.createElementNS(ns, 'rect');
                rect.id = id; rect.setAttribute('x', x); rect.setAttribute('y', y); rect.setAttribute('width', w); rect.setAttribute('height', h);
                rect.setAttribute('fill', '#7E57C2'); rect.setAttribute('fill-opacity', '0.5');
                rect.setAttribute('stroke', '#7E57C2'); rect.setAttribute('stroke-width', '2');
                rect.classList.add('feature-el'); svg.appendChild(rect);
                // Show feature label dialog - will add handles after dialog closes
                this._showFeatureLabelDlg(id, 'Rectangle'); break;
            }
            default: {
                const x = Math.round(Math.min(pt.x, start.x)), y = Math.round(Math.min(pt.y, start.y));
                let w = Math.round(Math.abs(pt.x - start.x)), h = Math.round(Math.abs(pt.y - start.y));
                if (w < 6 || h < 6) return null;
                if (type === 'double' && w < h * 1.3) w = Math.round(h * 1.8);
                this._showBoothDlg(x, y, w, h, type === 'double'); return null;
            }
        }

        this._persistSvg(); this.notify('Feature created');
        // Immediately make the new shape editable without full refresh
        if (this.positionMode) {
            const svg = document.querySelector('#map-content svg');
            const newEl = svg.querySelector(`[id="${id}"]`);
            if (newEl) {
                // Select it so user can immediately drag/resize/rotate
                this._selectedEl = newEl;
                this._updateStatus();
                newEl.style.cursor = 'move';
                this._addFeatureHandles(newEl, svg);
                // Set up tooltip and click for features
                if (!newEl._featureListeners) {
                    newEl.addEventListener('mouseenter', e => this._showFeatureTooltip(e, newEl));
                    newEl.addEventListener('mouseleave', () => document.getElementById('tooltip').classList.remove('active'));
                    newEl.addEventListener('mousemove', e => this.moveTooltip(e));
                    newEl.addEventListener('click', () => this._showFeatureDetail(newEl));
                    newEl._featureListeners = true;
                }
            }
        }
        // Exit draw mode so the shape can be immediately dragged without interference
        this._exitDraw();
        return id;
    }

    // ===== FEATURE LABEL DIALOG =====
    _showFeatureLabelDlg(id, defaultLabel) {
        let m = document.getElementById('feature-label-dlg');
        if (!m) {
            m = document.createElement('div'); m.id = 'feature-label-dlg'; m.className = 'modal';
            m.innerHTML = `<div class="modal-content" style="max-width:360px;"><div class="modal-header"><h3>Label Feature</h3><button class="btn-close" onclick="document.getElementById('feature-label-dlg').classList.remove('active')">&times;</button></div><div class="modal-body"><div class="form-group"><label>Label</label><input type="text" id="fl-text" placeholder="e.g., Restroom, Pillar, Stage"></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('feature-label-dlg').classList.remove('active')">Skip</button><button id="fl-ok" class="btn btn-primary">Label</button></div></div>`;
            document.body.appendChild(m);
        }
        m.classList.add('active');
        document.getElementById('fl-text').value = defaultLabel || '';
        setTimeout(() => document.getElementById('fl-text').focus(), 50);

        const btn = document.getElementById('fl-ok');
        const skipBtn = m.querySelector('.btn-secondary');
        const finishDlg = (labeled) => {
            m.classList.remove('active');
            // Ensure the shape has handles after dialog closes
            if (this.positionMode) {
                const svg = document.querySelector('#map-content svg');
                const el = svg.querySelector(`[id="${id}"]`);
                if (el) {
                    this._selectedEl = el;
                    this._updateStatus();
                    // Remove any existing handles first to avoid duplicates
                    svg.querySelectorAll(`.resize-handle[data-id="${id}"], .rotate-handle[data-id="${id}"]`).forEach(h => h.remove());
                    el.style.cursor = 'move';
                    this._addFeatureHandles(el, svg);
                    if (!el._featureListeners) {
                        el.addEventListener('mouseenter', e => this._showFeatureTooltip(e, el));
                        el.addEventListener('mouseleave', () => document.getElementById('tooltip').classList.remove('active'));
                        el.addEventListener('mousemove', e => this.moveTooltip(e));
                        el.addEventListener('click', () => this._showFeatureDetail(el));
                        el._featureListeners = true;
                    }
                }
            }
        };
        const newSkip = skipBtn.cloneNode(true); skipBtn.parentNode.replaceChild(newSkip, skipBtn);
        newSkip.addEventListener('click', () => finishDlg(false));
        const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
            const text = document.getElementById('fl-text').value.trim();
            if (text) {
                const svg = document.querySelector('#map-content svg');
                const el = svg.querySelector(`[id="${id}"]`);
                if (el) {
                    el.dataset.label = text;
                    const center = this._elCenter(el);
                    // Remove old label if any
                    const oldLabel = svg.querySelector(`.feature-label-text[data-for="${id}"]`);
                    if (oldLabel) oldLabel.remove();
                    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    t.setAttribute('x', center.x); t.setAttribute('y', center.y);
                    t.setAttribute('font-size', '10'); t.setAttribute('font-family', 'Arial, sans-serif');
                    t.setAttribute('fill', '#555'); t.setAttribute('text-anchor', 'middle');
                    t.setAttribute('pointer-events', 'none'); t.setAttribute('class', 'feature-label-text');
                    t.setAttribute('data-for', id);
                    t.textContent = text; svg.appendChild(t);
                }
                this._persistSvg();
                this.notify(`Feature labeled: ${text}`);
            }
            finishDlg(true);
        });
    }

    // ===== TEXT TOOL =====
    _showTextDlg(x, y) {
        let m = document.getElementById('text-dlg');
        if (!m) {
            m = document.createElement('div'); m.id = 'text-dlg'; m.className = 'modal';
            m.innerHTML = `<div class="modal-content" style="max-width:420px;"><div class="modal-header"><h3>Text Label</h3><button class="btn-close" onclick="document.getElementById('text-dlg').classList.remove('active')">&times;</button></div><div class="modal-body"><div class="form-group"><label>Text</label><input type="text" id="txt-content" placeholder="e.g., Main Stage"></div><div class="form-group"><label>Font Size</label><select id="txt-size"><option value="10">10px</option><option value="12">12px</option><option value="14" selected>14px</option><option value="16">16px</option><option value="20">20px</option><option value="24">24px</option><option value="32">32px</option><option value="48">48px</option></select></div><div class="form-group"><label>Color</label><input type="color" id="txt-color" value="#333333" style="width:60px;height:36px;padding:0;border:none;cursor:pointer;"></div><div class="form-group"><label>Font Family</label><select id="txt-font"><option value="Arial, sans-serif" selected>Arial</option><option value="Georgia, serif">Georgia</option><option value="'Courier New', monospace">Courier</option><option value="'Times New Roman', serif">Times</option><option value="Verdana, sans-serif">Verdana</option><option value="Impact, sans-serif">Impact</option><option value="'Comic Sans MS', cursive">Comic Sans</option></select></div><div class="form-group"><label><input type="checkbox" id="txt-bold" style="margin-right:6px;"> Bold</label><label style="margin-left:16px;"><input type="checkbox" id="txt-italic" style="margin-right:6px;"> Italic</label></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('text-dlg').classList.remove('active')">Cancel</button><button id="txt-ok" class="btn btn-primary">Place</button></div></div>`;
            document.body.appendChild(m);
        }
        m.classList.add('active');
        document.getElementById('txt-content').value = '';
        setTimeout(() => document.getElementById('txt-content').focus(), 50);

        const btn = document.getElementById('txt-ok');
        const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
            const text = document.getElementById('txt-content').value.trim(); if (!text) return;
            const size = document.getElementById('txt-size').value;
            const color = document.getElementById('txt-color').value;
            const font = document.getElementById('txt-font').value;
            const bold = document.getElementById('txt-bold').checked ? '700' : '400';
            const italic = document.getElementById('txt-italic').checked ? 'italic' : 'normal';
            const svg = document.querySelector('#map-content svg');
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const tid = 'text_' + Date.now().toString(36);
            t.id = tid; t.setAttribute('x', x); t.setAttribute('y', y);
            t.setAttribute('font-size', size); t.setAttribute('font-family', font);
            t.setAttribute('fill', color); t.setAttribute('font-weight', bold);
            t.setAttribute('font-style', italic); t.setAttribute('text-anchor', 'middle');
            t.classList.add('feature-text'); t.style.cursor = 'move';
            t.textContent = text; svg.appendChild(t);
            this._persistSvg(); m.classList.remove('active');
            this.notify('Text placed');
            if (this.positionMode) { this.disablePosEdit(); this.enablePosEdit(); }
        });
    }

    // ===== BOOTH DIALOG =====
    _showBoothDlg(x, y, w, h, double) {
        // Exit draw mode so the new booth can be immediately edited after creation
        this._exitDraw();
        const m = document.getElementById('new-booth-modal');
        document.getElementById('new-booth-id').value = '';
        document.getElementById('new-booth-label').value = '';
        m.classList.add('active');
        setTimeout(() => document.getElementById('new-booth-id').focus(), 50);
        this._pending = { x, y, w, h, double };
    }

    _confirmBooth() {
        const id = document.getElementById('new-booth-id').value.trim();
        const label = document.getElementById('new-booth-label').value.trim() || id;
        if (!id) { this.notify('Booth ID required'); return; }
        const data = this.eventsData[this.currentEvent];
        if (data?.booths?.[id]) { this.notify(`⚠️ "${id}" already exists!`); return; }
        const { x, y, w, h, double } = this._pending;
        const svg = document.querySelector('#map-content svg'); if (!svg) return;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.id = `booth-${id}`; rect.setAttribute('x', x); rect.setAttribute('y', y);
        rect.setAttribute('width', w); rect.setAttribute('height', h);
        rect.classList.add('booth');
        rect.style.fill = 'rgba(21,101,192,0.05)'; rect.style.stroke = 'rgba(21,101,192,0.6)';
        rect.style.strokeWidth = '1.5'; svg.appendChild(rect);
        if (data) {
            data.booths[id] = { boothId: id, vendorName: '', businessName: '', vendorCategory: 'Open', boothStatus: 'open', boothSize: double ? '10x20' : '10x10', notes: '', phone: '', email: '', missingItems: [], mapLabel: label };
            this.saveEvent(this.currentEvent); this.updateStats();
        }
        rect.addEventListener('click', () => { if (!this.positionMode) this.selectBooth(id); });
        rect.addEventListener('mouseenter', e => this.showTooltip(e, id));
        rect.addEventListener('mouseleave', () => document.getElementById('tooltip').classList.remove('active'));
        this._persistSvg();
        document.getElementById('new-booth-modal').classList.remove('active');
        this._pending = null; this._selectedEl = rect; this._updateStatus();
        this.notify(`Booth ${id} created${double ? ' (double)' : ''}`);
        if (this.positionMode) {
            const svg = document.querySelector('#map-content svg');
            // Select the new booth so it's immediately draggable
            this._selectedEl = rect;
            this._updateStatus();
            this._addHandles(rect, svg);
            rect.style.stroke = 'rgba(21,101,192,0.6)';
            rect.style.strokeWidth = '1.5';
            rect.style.strokeDasharray = '4,2';
            rect.style.fill = 'rgba(21,101,192,0.05)';
            rect.style.cursor = 'move';
        }
    }

    // ===== RENAME =====
    _promptRename() {
        if (!this._selectedEl) { this.notify('Select an element first'); return; }
        const oldId = this.extractId(this._selectedEl.id) || this._selectedEl.id;
        const data = this.eventsData[this.currentEvent];
        const booth = data?.booths?.[oldId];
        const m = document.getElementById('rename-booth-modal');
        document.getElementById('rename-old-id').textContent = oldId;
        document.getElementById('rename-new-id').value = oldId;
        document.getElementById('rename-new-label').value = booth?.mapLabel || oldId;
        m.classList.add('active');
        setTimeout(() => document.getElementById('rename-new-id').focus(), 50);
    }

    _confirmRename() {
        if (!this._selectedEl) return;
        const oldId = this.extractId(this._selectedEl.id) || this._selectedEl.id;
        const newId = document.getElementById('rename-new-id').value.trim();
        const newLabel = document.getElementById('rename-new-label').value.trim() || newId;
        if (!newId || newId === oldId) { document.getElementById('rename-booth-modal').classList.remove('active'); return; }
        const data = this.eventsData[this.currentEvent];
        if (data?.booths?.[newId] && newId !== oldId) { this.notify(`⚠️ "${newId}" already exists!`); return; }
        this._selectedEl.id = `booth-${newId}`;
        const svg = document.querySelector('#map-content svg');
        if (svg) {
            svg.querySelector(`.resize-handle[data-id="booth-${oldId}"]`)?.setAttribute('data-id', `booth-${newId}`);
            svg.querySelector(`.rotate-handle[data-id="booth-${oldId}"]`)?.setAttribute('data-id', `booth-${newId}`);
        }
        if (data?.booths?.[oldId]) { data.booths[newId] = { ...data.booths[oldId], boothId: newId, mapLabel: newLabel }; delete data.booths[oldId]; this.saveEvent(this.currentEvent); }
        this._persistSvg();
        document.getElementById('rename-booth-modal').classList.remove('active');
        this.notify(`Renamed: ${oldId} → ${newId}`); this._updateStatus();
        if (!this.positionMode) this.loadEvent(this.currentEvent);
    }

    // ===== DELETE =====
    _deleteSelected() {
        if (!this._selectedEl) { this.notify('Select an element first'); return; }
        const id = this._selectedEl.id;
        const boothId = this.extractId(id);
        const data = this.eventsData[this.currentEvent];
        const booth = data?.booths?.[boothId];
        const name = booth?.vendorName || boothId || id;
        if (!confirm(`Delete "${name}"?`)) return;
        document.querySelector(`#map-content svg .resize-handle[data-id="${id}"]`)?.remove();
        document.querySelector(`#map-content svg .rotate-handle[data-id="${id}"]`)?.remove();
        this._selectedEl.remove(); this._selectedEl = null;
        if (data?.booths?.[boothId]) { delete data.booths[boothId]; this.saveEvent(this.currentEvent); this.updateStats(); }
        this._persistSvg();
        this.notify(`Deleted ${name}`); this._updateStatus();
        if (!this.positionMode && boothId) this.loadEvent(this.currentEvent);
    }

    // ===== CUSTOM EVENTS =====
    loadCustomEvents() {
        try {
            const raw = localStorage.getItem('boothmap_custom_events');
            if (!raw) return;
            const c = JSON.parse(raw);
            Object.entries(c).forEach(([id, cfg]) => {
                this.eventsConfig[id] = cfg;
                const s = this._lsGet(`boothmap_${id}`);
                this.eventsData[id] = s || { eventId: id, eventName: cfg.name, booths: {} };
                this.originalEventsData[id] = JSON.parse(JSON.stringify(this.eventsData[id]));
                this._addOpt(id, cfg.name);
            });
        } catch (e) { }
    }
    _getCustom() { try { return JSON.parse(localStorage.getItem('boothmap_custom_events') || '{}'); } catch (e) { return {}; } }
    _saveCustom(o) { try { localStorage.setItem('boothmap_custom_events', JSON.stringify(o)); } catch (e) { } }
    _addOpt(id, name) {
        const s = document.getElementById('event-select');
        if (!s || s.querySelector(`option[value="${CSS.escape(id)}"]`)) return;
        const o = document.createElement('option'); o.value = id; o.textContent = name; o.dataset.custom = '1'; s.appendChild(o);
    }

    _showUploadDlg() {
        const m = document.getElementById('upload-map-modal');
        if (!m) return;
        document.getElementById('upload-event-name').value = '';
        document.getElementById('upload-map-file').value = '';
        document.getElementById('upload-map-width').value = '';
        document.getElementById('upload-map-height').value = '';
        document.getElementById('upload-preview').classList.add('hidden');
        document.getElementById('upload-preview').innerHTML = '';
        m.classList.add('active');

        // Setup drop zone
        const zone = document.getElementById('upload-drop-zone');
        const fileInput = document.getElementById('upload-map-file');

        zone.onclick = () => fileInput.click();
        fileInput.onchange = () => { if (fileInput.files?.length) this._handleUploadFile(fileInput.files[0]); };

        // Drag and drop
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
        zone.ondragleave = () => zone.classList.remove('drag-over');
        zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) { this._handleUploadFile(f); fileInput.files = e.dataTransfer.files; } };
    }

    _handleUploadFile(file) {
        this._uploadFileData = file;
        const preview = document.getElementById('upload-preview');
        preview.classList.remove('hidden');

        if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
            const reader = new FileReader();
            reader.onload = (e) => { preview.innerHTML = e.target.result; };
            reader.readAsText(file);
        } else {
            const url = URL.createObjectURL(file);
            preview.innerHTML = `<img src="${url}" style="max-width:100%;max-height:180px;" />`;
        }
    }

    _confirmUpload() {
        const name = document.getElementById('upload-event-name').value.trim();
        const file = this._uploadFileData;
        if (!name) { this.notify('Event name required'); return; }
        if (!file) { this.notify('Select a map image'); return; }

        const eventId = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20) + '_' + Date.now().toString(36).slice(-4);
        const isSvg = file.type === 'image/svg+xml' || file.name.endsWith('.svg');

        if (isSvg) {
            // Direct SVG upload
            const reader = new FileReader();
            reader.onload = (e) => {
                const svgContent = e.target.result;
                if (!svgContent.includes('<svg') && !svgContent.includes('<SVG')) { this.notify('Invalid SVG file'); return; }
                this.saveSvg(eventId, svgContent);
                this._finalizeUpload(eventId, name);
            };
            reader.readAsText(file);
        } else {
            // PNG/JPEG — wrap in SVG with image element
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const userW = parseInt(document.getElementById('upload-map-width').value);
                const userH = parseInt(document.getElementById('upload-map-height').value);
                const w = userW || img.naturalWidth || 1280;
                const h = userH || img.naturalHeight || 720;

                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64 = e.target.result;
                    const svgWrapper = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">
  <image href="${base64}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
                    this.saveSvg(eventId, svgWrapper);
                    this._finalizeUpload(eventId, name, w, h);
                };
                reader.readAsDataURL(file);
            };
            img.onerror = () => { URL.revokeObjectURL(url); this.notify('Failed to load image'); };
            img.src = url;
        }
    }
    _finalizeUpload(eventId, name, width, height) {
        const customs = this._getCustom();
        customs[eventId] = { id: eventId, name, mapFile: null, dataFile: null, width, height };
        this._saveCustom(customs);
        this.eventsConfig[eventId] = customs[eventId];
        this.eventsData[eventId] = { eventId, eventName: name, booths: {} };
        this.originalEventsData[eventId] = { eventId, eventName: name, booths: {} };
        this._addOpt(eventId, name);
        document.getElementById('upload-map-modal').classList.remove('active');
        this._uploadFileData = null;
        document.getElementById('event-select').value = eventId;
        this.loadEvent(eventId);
        this.notify(`"${name}" created — Use Edit Positions to add booths`);
    }
    _deleteCustom(id) {
        if (!id?.startsWith('custom_')) { this.notify('Built-in events cannot be deleted'); return; }
        const name = this.eventsConfig[id]?.name || id;
        if (!confirm(`Delete "${name}"?`)) return;
        this._lsRem(`boothmap_svg_${id}`); this._lsRem(`boothmap_${id}`);
        const c = this._getCustom(); delete c[id]; this._saveCustom(c);
        delete this.eventsData[id]; delete this.originalEventsData[id]; delete this.eventsConfig[id];
        document.querySelector(`#event-select option[value="${id}"]`)?.remove();
        const s = document.getElementById('event-select'); if (s.options.length > 0) { s.selectedIndex = 0; this.loadEvent(s.value); }
    }
    _updateCustomUI() { const btn = document.getElementById('btn-delete-event'); if (btn) btn.style.display = this.currentEvent?.startsWith('custom_') ? 'inline-flex' : 'none'; }

    // ===== GITHUB SYNC =====
    _loadGh() { try { const s = localStorage.getItem('boothmap_github'); if (s) this.github = { ...this.github, ...JSON.parse(s) }; } catch (e) { } }
    _saveGh() { localStorage.setItem('boothmap_github', JSON.stringify({ token: this.github.token, gistId: this.github.gistId, autoSync: this.github.autoSync })); }
    renderGhUI() {
        const c = document.getElementById('github-sync-container'); if (!c) return;
        const connected = this.github.token && this.github.gistId;
        c.innerHTML = `
            <div class="github-sync">
                <div class="sync-status ${connected ? 'connected' : ''}" id="gh-status">${connected ? `✓ Synced${this.github.lastSync ? ` (${new Date(this.github.lastSync).toLocaleDateString()})` : ''}` : 'Not connected'}</div>
                <div class="button-group">
                    <button id="btn-gh-set" class="btn btn-sm btn-secondary">⚙️ Token</button>
                    ${connected ? `<button id="btn-gh-sv" class="btn btn-sm btn-success">☁️ Save</button><button id="btn-gh-ld" class="btn btn-sm btn-primary">↓ Load</button>` : ''}
                </div>
            </div>
        `;
        c.querySelector('#btn-gh-set')?.addEventListener('click', () => this._showGhDlg());
        c.querySelector('#btn-gh-sv')?.addEventListener('click', () => this._ghSave());
        c.querySelector('#btn-gh-ld')?.addEventListener('click', () => this._ghLoad());
    }
    _showGhDlg() {
        let m = document.getElementById('gh-dlg');
        if (!m) {
            m = document.createElement('div'); m.id = 'gh-dlg'; m.className = 'modal';
            m.innerHTML = `<div class="modal-content" style="max-width:460px;"><div class="modal-header"><h3>GitHub Sync</h3><button class="btn-close" onclick="document.getElementById('gh-dlg').classList.remove('active')">&times;</button></div><div class="modal-body"><div class="form-group"><label>Personal Access Token</label><input type="password" id="gh-tok" placeholder="ghp_xxxxxxxxxxxx"><div class="hint">github.com → Settings → Developer settings → Tokens (classic) → Enable "gist" scope</div></div><div class="form-group"><label>Gist ID (optional)</label><input type="text" id="gh-gid" placeholder="Leave blank to auto-create"><div class="hint">Paste existing Gist ID or leave blank</div></div><div class="form-group"><label><input type="checkbox" id="gh-auto" style="margin-right:6px;"> Auto-sync on save</label></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('gh-dlg').classList.remove('active')">Cancel</button><button id="gh-ok" class="btn btn-primary">Save</button></div></div>`;
            document.body.appendChild(m);
        }
        document.getElementById('gh-tok').value = this.github.token || '';
        document.getElementById('gh-gid').value = this.github.gistId || '';
        document.getElementById('gh-auto').checked = this.github.autoSync || false;
        m.classList.add('active');
        const btn = document.getElementById('gh-ok');
        const nb = btn.cloneNode(true); btn.parentNode.replaceChild(nb, btn);
        nb.addEventListener('click', () => {
            this.github.token = document.getElementById('gh-tok').value.trim();
            this.github.gistId = document.getElementById('gh-gid').value.trim();
            this.github.autoSync = document.getElementById('gh-auto').checked;
            this._saveGh(); this.renderGhUI(); m.classList.remove('active');
            this.notify(this.github.token ? 'GitHub connected' : 'GitHub disabled');
        });
    }
    async _ghSave() {
        if (!this.github.token) { this.notify('Set GitHub token first'); return; }
        this.notify('Saving to cloud...');
        const payload = { eventsData: this.eventsData, eventsConfig: this.eventsConfig, categories: this.categories, customEvents: this._getCustom(), svgs: {} };
        Object.keys(this.eventsConfig).forEach(k => { const s = localStorage.getItem(`boothmap_svg_${k}`); if (s) payload.svgs[k] = s; });
        const body = { description: 'Vendor Booth Map System', public: false, files: { 'boothmap-data.json': { content: JSON.stringify(payload) } } };
        try {
            let url = 'https://api.github.com/gists'; let method = 'POST';
            if (this.github.gistId) { url = `https://api.github.com/gists/${this.github.gistId}`; method = 'PATCH'; }
            const res = await fetch(url, { method, headers: { 'Authorization': `token ${this.github.token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) { const err = await res.json(); throw new Error(err.message || `HTTP ${res.status}`); }
            const r = await res.json(); this.github.gistId = r.id; this.github.lastSync = new Date().toISOString();
            this._saveGh(); this.renderGhUI();
            this.notify(`✓ Saved! Gist: ${r.id}`, 'success');
            try { await navigator.clipboard.writeText(r.id); this.notify('ID copied!', 'success'); } catch (e) { }
        } catch (err) { this.notify('Save failed: ' + err.message, 'error'); }
    }
    async _ghLoad() {
        if (!this.github.token) { this.notify('Set token first'); return; }
        if (!this.github.gistId) { this.notify('No Gist ID — save first or enter one'); return; }
        this.notify('Loading from cloud...');
        try {
            const res = await fetch(`https://api.github.com/gists/${this.github.gistId}`, { headers: { 'Authorization': `token ${this.github.token}`, 'Accept': 'application/vnd.github.v3+json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const gist = await res.json(); const f = gist.files['boothmap-data.json']; if (!f) throw new Error('No data file');
            const payload = JSON.parse(f.content);
            if (!payload.eventsData || !payload.eventsConfig) throw new Error('Invalid format');
            this.eventsData = payload.eventsData; this.eventsConfig = payload.eventsConfig; this.categories = payload.categories || this.categories;
            if (payload.customEvents) this._saveCustom(payload.customEvents);
            if (payload.svgs) Object.entries(payload.svgs).forEach(([k, v]) => localStorage.setItem(`boothmap_svg_${k}`, v));
            Object.keys(this.eventsData).forEach(k => this._lsSet(`boothmap_${k}`, this.eventsData[k]));
            const s = document.getElementById('event-select'); s.innerHTML = '';
            Object.entries(this.eventsConfig).forEach(([id, cfg]) => { const o = document.createElement('option'); o.value = id; o.textContent = cfg.name; if (id.startsWith('custom_')) o.dataset.custom = '1'; s.appendChild(o); });
            this.github.lastSync = new Date().toISOString(); this._saveGh(); this.renderGhUI();
            this.loadEvent(this.currentEvent); this.notify('✓ Loaded from cloud!', 'success');
        } catch (err) { this.notify('Load failed: ' + err.message, 'error'); }
    }

    // ===== EVENT LISTENERS =====
    // Safe event listener helper — never throws if element missing
    _on(id, event, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    }

    setupListeners() {
        this._on('event-select', 'change', (e) => this.loadEvent(e.target.value));
        this._on('search-input', 'input', (e) => { this.searchTerm = e.target.value.toLowerCase(); this.applyFilters(); });
        this._on('category-filter', 'change', (e) => { this.categoryFilter = e.target.value; this.applyFilters(); });
        this._on('status-filter', 'change', (e) => { this.statusFilter = e.target.value; this.applyFilters(); });

        this._on('booth-opacity', 'input', (e) => {
            this.boothOpacity = parseFloat(e.target.value);
            const valEl = document.getElementById('opacity-val');
            if(valEl) valEl.textContent = Math.round(this.boothOpacity * 100) + '%';
            this.applyColors();
        });

        this._on('btn-export', 'click', () => this.exportData());
        this._on('btn-export-map', 'click', () => this.showExportMapDlg());
        this._on('btn-import', 'click', () => document.getElementById('import-file')?.click());
        this._on('import-file', 'change', (e) => { if (e.target.files?.length) { this.importData(e.target.files[0]); e.target.value = ''; } });
        this._on('btn-reset', 'click', () => this._resetMap());
        this._on('btn-copy-template', 'click', () => this._showCopyTemplateDlg());
        this._on('btn-print', 'click', () => window.print());
        this._on('btn-diagnostics', 'click', () => this.toggleDiagnostics());
        this._on('btn-upload-map', 'click', () => this._showUploadDlg());
        this._on('btn-paste-template', 'click', () => this._showPasteTemplateDlg());
        this._on('btn-delete-event', 'click', () => this._deleteCustom(this.currentEvent));
        this._on('btn-fit-map', 'click', () => this.fitView());
        this._on('btn-position-mode', 'click', () => this.togglePositionMode());

        this._on('confirm-new-booth', 'click', () => this._confirmBooth());
        this._on('cancel-new-booth', 'click', () => document.getElementById('new-booth-modal')?.classList.remove('active'));
        this._on('confirm-rename-booth', 'click', () => this._confirmRename());
        this._on('cancel-rename-booth', 'click', () => document.getElementById('rename-booth-modal')?.classList.remove('active'));
        this._on('confirm-upload-map', 'click', () => this._confirmUpload());
        this._on('cancel-upload-map', 'click', () => document.getElementById('upload-map-modal')?.classList.remove('active'));
        this._on('confirm-copy-template', 'click', () => this._confirmCopyTemplate());
        this._on('cancel-copy-template', 'click', () => document.getElementById('copy-template-modal')?.classList.remove('active'));
        this._on('cancel-paste-template', 'click', () => document.getElementById('paste-template-modal')?.classList.remove('active'));

        this._on('close-detail', 'click', () => this.closeDetail());
        this._on('close-modal', 'click', () => this.closeModal());
        this._on('btn-cancel', 'click', () => this.closeModal());
        this._on('btn-save', 'click', () => this.saveBoothEdit());

        const editModal = document.getElementById('edit-modal');
        if (editModal) editModal.addEventListener('click', (e) => { if (e.target.id === 'edit-modal') this.closeModal(); });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active')); if (this.drawMode) this._exitDraw(); }
        });
    }

    importData(file) {
        const r = new FileReader();
        r.onload = (e) => {
            try { const d = JSON.parse(e.target.result); if (!d.eventId || !d.booths) throw new Error('Bad format'); this.eventsData[this.currentEvent] = d; this.saveEvent(this.currentEvent); this.loadEvent(this.currentEvent); this.notify('Imported'); }
            catch (err) { this.notify('Import failed: ' + err.message, 'error'); }
        }; r.readAsText(file);
    }

    toggleDiagnostics() { const p = document.getElementById('diagnostics-panel'); if (p) p.classList.toggle('hidden'); }

    // ===== UTILITIES =====
    notify(msg, type = '') {
        const el = document.createElement('div'); el.className = `notification ${type}`; el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => { el.style.animation = 'slideOutRight 0.3s ease'; setTimeout(() => el.remove(), 300); }, 3000);
    }
    showError(msg) { console.error(msg); this.notify(msg, 'error'); }
    _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}
