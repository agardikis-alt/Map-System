
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

        // Clear any lingering edit-mode styles from all booth elements
        const _svg = document.querySelector('#map-content svg');
        if (_svg) {
            _svg.querySelectorAll('.booth').forEach(b => {
                b.style.strokeDasharray = '';
                b.style.cursor = '';
                b.style.opacity = '';
            });
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
