// ==================== MÓDULO: GESTOR DE DEMANDA ====================

let dataDemand = null;
let currentViewDemand = 'cards';
let editingLoadDemand = null;
let editingKeyDemand = null;
let filterActiveOnlyDemand = true;
let selectedNodesDemand = new Set();
let demandChart = null;

const PROTECTED_PROPERTIES_DEMAND = ['name', 'index', 'load_bus'];
const CARD_DISPLAY_PROPERTIES_DEMAND = ['name', 'status', 'pd', 'qd', 'load_bus', 'zone', 'area', 'owner'];
const MAX_CARD_PROPERTIES_DEMAND = 4;

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', function() {
    initDemand();
});

function initDemand() {
    setupEventListenersDemand();
    loadDataFromFileDemand();
    initTimeControls();
}

function initTimeControls() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    document.getElementById('startDateDemand').value = yesterday.toISOString().slice(0, 16);
    document.getElementById('endDateDemand').value = now.toISOString().slice(0, 16);
}

function loadDataFromFileDemand() {
    const contentDiv = document.getElementById('contentDemand');
    contentDiv.innerHTML = `
        <div class="acrylic-card" style="text-align: center; padding: 60px;">
            <div class="spinner"></div>
            <h3 style="color: var(--text-secondary); margin-top: 20px;">Cargando datos de demanda...</h3>
        </div>
    `;

    fetch('data/base.json')
        .then(response => {
            if (!response.ok) throw new Error('No se pudo cargar el archivo de datos');
            return response.json();
        })
        .then(data => {
            dataDemand = data;
            renderDemand();
            Utils.showNotification('Datos de demanda cargados', 'success');
        })
        .catch(error => {
            console.error('Error al cargar datos de demanda:', error);
            contentDiv.innerHTML = `
                <div class="acrylic-card empty-state">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h3>No se pudieron cargar los datos</h3>
                    <p>${error.message}</p>
                    <button class="btn-fluent btn-primary" onclick="loadDataFromFileDemand()">
                        <i class="bi bi-arrow-clockwise"></i> Reintentar
                    </button>
                </div>
            `;
        });
}

// ==================== EVENT LISTENERS ====================

function setupEventListenersDemand() {
    document.getElementById('addBtnDemand').addEventListener('click', addNewLoadDemand);
    document.getElementById('exportBtnDemand').addEventListener('click', exportDataDemand);
    document.getElementById('importBtnDemand').addEventListener('click', () => document.getElementById('fileInputDemand').click());

    document.getElementById('fileInputDemand').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            Utils.readJSONFile(file).then(data => {
                dataDemand = data;
                renderDemand();
                Utils.showNotification('¡Datos importados!', 'success');
            }).catch(error => Utils.showNotification('Error: ' + error.message, 'error'));
        }
    });

    document.querySelectorAll('#tab-demanda .view-toggle button[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#tab-demanda .view-toggle button[data-view]').forEach(b => b.classList.remove('active'));
            e.target.closest('button').classList.add('active');
            currentViewDemand = e.target.closest('button').dataset.view;
            renderDemand();
        });
    });

    document.getElementById('searchDemand').addEventListener('input', Utils.debounce((e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#contentDemand .item-card, #contentDemand tbody tr').forEach(el => {
            el.style.display = el.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
    }, 200));

    document.getElementById('filterStateDemand')?.addEventListener('change', (e) => {
        filterActiveOnlyDemand = e.target.checked;
        renderDemand();
    });

    // Aplicar filtro de tiempo
    document.getElementById('applyTimeFilterDemand').addEventListener('click', applyTimeFilter);
}

// ==================== ESTADÍSTICAS ====================

function getLoadsSummary() {
    if (!dataDemand?.base?.load) return { count: 0, active: 0, totalPd: 0, totalQd: 0 };
    
    const loads = Object.values(dataDemand.base.load);
    const baseMVA = dataDemand.base.baseMVA || 100;
    let active = 0, totalPd = 0, totalQd = 0;
    
    loads.forEach(l => {
        if (l.status === 1 || l.status === true) {
            active++;
            totalPd += (l.pd || 0) * baseMVA;
            totalQd += (l.qd || 0) * baseMVA;
        }
    });
    
    return { count: loads.length, active, totalPd, totalQd };
}

function updateStatsDemand() {
    const statsDiv = document.getElementById('statsDemand');
    if (!statsDiv || !dataDemand?.base) {
        statsDiv.innerHTML = '';
        return;
    }
    
    const summary = getLoadsSummary();
    const baseMVA = dataDemand.base.baseMVA || 100;
    const sysName = dataDemand.base.name || 'Sistema';
    
    statsDiv.innerHTML = `
        <div class="stat-card" style="grid-column: span 2; background: linear-gradient(135deg, #7b1fa2 0%, #9c27b0 100%); color: white;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="color: rgba(255,255,255,0.8);"><i class="bi bi-graph-up-arrow"></i> Demanda Total</h3>
                    <p style="color: white;">${sysName}</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">Base MVA</div>
                    <div style="font-size: 1.5rem; font-weight: bold;">${baseMVA}</div>
                </div>
            </div>
        </div>
        <div class="stat-card">
            <h3><i class="bi bi-house-fill" style="color: #9c27b0;"></i> Cargas Totales</h3>
            <p>${summary.count}</p>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${summary.active} activas</div>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #e91e63 0%, #f06292 100%); color: white;">
            <h3 style="color: rgba(255,255,255,0.9);"><i class="bi bi-lightning-charge-fill"></i> Potencia Activa</h3>
            <p style="color: white;">${summary.totalPd.toFixed(1)} MW</p>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #00bcd4 0%, #4dd0e1 100%); color: white;">
            <h3 style="color: rgba(255,255,255,0.9);"><i class="bi bi-arrow-repeat"></i> Potencia Reactiva</h3>
            <p style="color: white;">${summary.totalQd.toFixed(1)} MVAr</p>
        </div>
        <div class="stat-card">
            <h3><i class="bi bi-check-circle-fill" style="color: #4caf50;"></i> Seleccionadas</h3>
            <p>${selectedNodesDemand.size}</p>
        </div>
    `;
}

// ==================== FILTRO DE TIEMPO ====================

function applyTimeFilter() {
    const startDate = document.getElementById('startDateDemand').value;
    const endDate = document.getElementById('endDateDemand').value;
    const resolution = document.getElementById('resolutionDemand').value;
    
    Utils.showNotification(`Filtro aplicado: ${resolution} min`, 'info');
    
    if (currentViewDemand === 'chart') {
        renderChartDemand();
    }
}

// ==================== OBTENER ITEMS ====================

function getCurrentItemsDemand() {
    if (!dataDemand?.base?.load) return [];
    let result = Object.entries(dataDemand.base.load).map(([key, value]) => ({ ...value, _key: key }));
    if (filterActiveOnlyDemand) {
        result = result.filter(item => item.status === 1 || item.status === true);
    }
    return result;
}

// ==================== RENDERIZADO ====================

function toggleCardExpandDemand(index) {
    const hiddenDiv = document.getElementById(`hiddenPropsDemand-${index}`);
    const label = document.getElementById(`expandLabelDemand-${index}`);
    if (!hiddenDiv || !label) return;
    const isExpanded = hiddenDiv.style.display !== 'none';
    hiddenDiv.style.display = isExpanded ? 'none' : 'block';
    label.innerHTML = isExpanded 
        ? `<i class="bi bi-chevron-down"></i> +${hiddenDiv.querySelectorAll('.info-item').length} más`
        : `<i class="bi bi-chevron-up"></i> Ver menos`;
}

function renderCardsDemand(items) {
    if (items.length === 0) {
        return `<div class="acrylic-card empty-state">
            <i class="bi bi-house"></i>
            <h3>No hay cargas</h3>
            <p>${filterActiveOnlyDemand ? 'No hay cargas activas.' : 'Agrega cargas para comenzar.'}</p>
        </div>`;
    }
    
    const baseMVA = dataDemand.base.baseMVA || 100;
    
    return `<div class="cards-grid">${items.map((item, index) => {
        const isSelected = selectedNodesDemand.has(item._key);
        const pdMW = ((item.pd || 0) * baseMVA).toFixed(2);
        const qdMVAr = ((item.qd || 0) * baseMVA).toFixed(2);
        
        const excludeKeys = ['_key', 'name', 'status', 'pd', 'qd'];
        const allProps = Object.keys(item).filter(k => !excludeKeys.includes(k) && (typeof item[k] !== 'object' || item[k] === null));
        const priorityProps = CARD_DISPLAY_PROPERTIES_DEMAND.filter(p => allProps.includes(p));
        const otherProps = allProps.filter(p => !CARD_DISPLAY_PROPERTIES_DEMAND.includes(p));
        const orderedProps = [...priorityProps, ...otherProps];
        const propsToShow = orderedProps.slice(0, MAX_CARD_PROPERTIES_DEMAND - 2);
        const hiddenProps = orderedProps.slice(MAX_CARD_PROPERTIES_DEMAND - 2);
        
        return `
        <div class="item-card">
            <div class="card-header">
                <div class="card-header-title">
                    <h3>${item.name || item._key}</h3>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <span class="badge-fluent ${item.status === 1 || item.status === true ? 'badge-success' : 'badge-danger'}">
                            ${item.status === 1 || item.status === true ? '✓ Activo' : '✗ Inactivo'}
                        </span>
                    </div>
                </div>
                <p style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">
                    <i class="bi bi-house-fill" style="color: #9c27b0;"></i> ID: ${item._key}
                    ${item.load_bus ? ` | Bus: ${item.load_bus}` : ''}
                </p>
            </div>
            <div class="card-info">
                <div class="card-props-main">
                    <div class="info-item" style="background: linear-gradient(135deg, rgba(233, 30, 99, 0.1) 0%, rgba(233, 30, 99, 0.05) 100%);">
                        <label><i class="bi bi-lightning-charge"></i> P (MW)</label>
                        <span style="color: #e91e63; font-weight: 700;">${pdMW}</span>
                    </div>
                    <div class="info-item" style="background: linear-gradient(135deg, rgba(0, 188, 212, 0.1) 0%, rgba(0, 188, 212, 0.05) 100%);">
                        <label><i class="bi bi-arrow-repeat"></i> Q (MVAr)</label>
                        <span style="color: #00bcd4; font-weight: 700;">${qdMVAr}</span>
                    </div>
                    ${propsToShow.map(key => `<div class="info-item"><label>${key}</label><span>${Utils.formatValue(item[key])}</span></div>`).join('')}
                </div>
                ${hiddenProps.length > 0 ? `
                    <div class="card-props-hidden" id="hiddenPropsDemand-${index}" style="display: none;">
                        <div class="card-props-main">${hiddenProps.map(key => `<div class="info-item"><label>${key}</label><span>${Utils.formatValue(item[key])}</span></div>`).join('')}</div>
                    </div>
                    <div class="expand-trigger" onclick="event.stopPropagation(); toggleCardExpandDemand(${index})">
                        <span id="expandLabelDemand-${index}"><i class="bi bi-chevron-down"></i> +${hiddenProps.length} más</span>
                    </div>
                ` : ''}
            </div>
            <div class="card-actions">
                <button class="btn-fluent btn-primary" onclick="editLoadDemand('${item._key}')"><i class="bi bi-pencil"></i> Editar</button>
                <button class="btn-fluent btn-danger" onclick="deleteLoadDemand('${item._key}')"><i class="bi bi-trash"></i> Eliminar</button>
            </div>
        </div>`;
    }).join('')}</div>`;
}

function renderTableDemand(items) {
    if (items.length === 0) return `<div class="acrylic-card empty-state"><h3>No hay cargas</h3></div>`;
    
    const baseMVA = dataDemand.base.baseMVA || 100;
    const fields = ['_key', 'name', 'status', 'pd', 'qd', 'load_bus', 'zone', 'area'];
    
    return `<div class="acrylic-card"><div class="table-container"><table class="table-fluent">
        <thead><tr>
            <th style="width: 40px;">Sel</th>
            ${fields.map(f => `<th>${f === '_key' ? 'ID' : f === 'pd' ? 'P (MW)' : f === 'qd' ? 'Q (MVAr)' : f}</th>`).join('')}
            <th>Acciones</th>
        </tr></thead>
        <tbody>${items.map(item => {
            const isSelected = selectedNodesDemand.has(item._key);
            return `
            <tr style="${isSelected ? 'background: rgba(156, 39, 176, 0.08);' : ''}">
                <td>
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleNodeSelection('${item._key}')" 
                        style="width: 18px; height: 18px; accent-color: #9c27b0; cursor: pointer;">
                </td>
                ${fields.map(f => {
                    if (f === '_key') return `<td><strong>${item[f]}</strong></td>`;
                    if (f === 'pd') return `<td style="color: #e91e63; font-weight: 600;">${((item[f] || 0) * baseMVA).toFixed(2)}</td>`;
                    if (f === 'qd') return `<td style="color: #00bcd4; font-weight: 600;">${((item[f] || 0) * baseMVA).toFixed(2)}</td>`;
                    if (f === 'status') return `<td><span class="badge-fluent ${item[f] ? 'badge-success' : 'badge-danger'}">${item[f] ? '✓' : '✗'}</span></td>`;
                    return `<td>${Utils.formatValue(item[f])}</td>`;
                }).join('')}
                <td>
                    <button class="btn-fluent btn-primary" onclick="editLoadDemand('${item._key}')" style="padding: 6px 12px;"><i class="bi bi-pencil"></i></button>
                    <button class="btn-fluent btn-danger" onclick="deleteLoadDemand('${item._key}')" style="padding: 6px 12px;"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('')}
        </tbody></table></div></div>`;
}

function renderChartDemand() {
    const items = getCurrentItemsDemand();
    const baseMVA = dataDemand?.base?.baseMVA || 100;
    
    // Filtrar solo seleccionados si hay selección
    const chartItems = selectedNodesDemand.size > 0 
        ? items.filter(item => selectedNodesDemand.has(item._key))
        : items.slice(0, 10);
    
    if (chartItems.length === 0) {
        return `<div class="acrylic-card empty-state">
            <i class="bi bi-bar-chart"></i>
            <h3>Sin datos para graficar</h3>
            <p>Selecciona cargas para ver el gráfico comparativo.</p>
        </div>`;
    }
    
    const labels = chartItems.map(item => item.name || item._key);
    const pdData = chartItems.map(item => ((item.pd || 0) * baseMVA).toFixed(2));
    const qdData = chartItems.map(item => ((item.qd || 0) * baseMVA).toFixed(2));
    
    setTimeout(() => {
        const ctx = document.getElementById('demandChartCanvas');
        if (!ctx) return;
        
        if (demandChart) demandChart.destroy();
        
        demandChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Potencia Activa (MW)',
                        data: pdData,
                        backgroundColor: 'rgba(233, 30, 99, 0.7)',
                        borderColor: '#e91e63',
                        borderWidth: 2,
                        borderRadius: 6
                    },
                    {
                        label: 'Potencia Reactiva (MVAr)',
                        data: qdData,
                        backgroundColor: 'rgba(0, 188, 212, 0.7)',
                        borderColor: '#00bcd4',
                        borderWidth: 2,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { font: { family: 'Segoe UI', weight: '600' }, padding: 20 }
                    },
                    title: {
                        display: true,
                        text: `Comparativa de Demanda (${chartItems.length} cargas)`,
                        font: { size: 16, family: 'Segoe UI', weight: '700' },
                        padding: { bottom: 20 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { font: { family: 'Segoe UI' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Segoe UI' }, maxRotation: 45 }
                    }
                }
            }
        });
    }, 100);
    
    return `
        <div class="acrylic-card">
            <div class="chart-container" style="height: 450px;">
                <canvas id="demandChartCanvas"></canvas>
            </div>
        </div>
        <div class="acrylic-card" style="margin-top: 16px;">
            <h4 style="margin-bottom: 16px;"><i class="bi bi-table"></i> Resumen de Cargas Seleccionadas</h4>
            <div class="table-container" style="max-height: 300px;">
                <table class="table-fluent">
                    <thead><tr><th>Carga</th><th>Bus</th><th>P (MW)</th><th>Q (MVAr)</th><th>FP</th></tr></thead>
                    <tbody>
                        ${chartItems.map(item => {
                            const p = (item.pd || 0) * baseMVA;
                            const q = (item.qd || 0) * baseMVA;
                            const s = Math.sqrt(p*p + q*q);
                            const fp = s > 0 ? (p / s).toFixed(3) : '1.000';
                            return `<tr>
                                <td><strong>${item.name || item._key}</strong></td>
                                <td>${item.load_bus || '—'}</td>
                                <td style="color: #e91e63; font-weight: 600;">${p.toFixed(2)}</td>
                                <td style="color: #00bcd4; font-weight: 600;">${q.toFixed(2)}</td>
                                <td>${fp}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot style="background: var(--bg-secondary); font-weight: 700;">
                        <tr>
                            <td colspan="2">TOTAL</td>
                            <td style="color: #e91e63;">${chartItems.reduce((sum, i) => sum + (i.pd || 0) * baseMVA, 0).toFixed(2)}</td>
                            <td style="color: #00bcd4;">${chartItems.reduce((sum, i) => sum + (i.qd || 0) * baseMVA, 0).toFixed(2)}</td>
                            <td>—</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

// ==================== CRUD ====================

function generateFormHTMLDemand(item) {
    const protectedProps = PROTECTED_PROPERTIES_DEMAND;
    let html = `<div id="propertiesContainerDemand">`;
    
    const sortedKeys = Object.keys(item).filter(k => k !== '_key').sort((a, b) => {
        if (protectedProps.includes(a) && !protectedProps.includes(b)) return -1;
        if (!protectedProps.includes(a) && protectedProps.includes(b)) return 1;
        return a.localeCompare(b);
    });
    
    for (let key of sortedKeys) {
        const value = item[key];
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) continue;
        
        const isProtected = protectedProps.includes(key);
        const isNull = value === null;
        const inputType = typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text';
        
        if (inputType === 'checkbox' && !isNull) {
            html += `
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="fieldDemand_${key}" data-type="boolean" class="form-checkbox" ${value ? 'checked' : ''}>
                        <span class="form-label" style="margin: 0;">${key}</span>
                    </label>
                </div>
            `;
        } else {
            html += `
                <div class="form-group">
                    <label class="form-label" style="display: flex; align-items: center; gap: 6px;">
                        ${key} ${isProtected ? '<i class="bi bi-lock-fill" style="color: var(--text-muted);"></i>' : ''}
                        ${isNull ? '<span class="badge-warning">NULL</span>' : ''}
                    </label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="${inputType}" id="fieldDemand_${key}" class="form-input" 
                            data-type="${Utils.getValueType(value)}" value="${isNull ? '' : (value ?? '')}" 
                            ${isNull ? 'disabled' : ''} step="any">
                        ${!isProtected ? `
                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.8rem;">
                                <input type="checkbox" id="nullDemand_${key}" ${isNull ? 'checked' : ''} onchange="toggleNullFieldDemand('${key}', this.checked)">
                                <span style="color: var(--text-muted);">null</span>
                            </label>
                        ` : ''}
                    </div>
                </div>
            `;
        }
    }
    return html + `</div>`;
}

function toggleNullFieldDemand(key, isNull) {
    const input = document.getElementById(`fieldDemand_${key}`);
    if (!input) return;
    if (isNull) { input.dataset.previousValue = input.value; input.value = ''; input.disabled = true; }
    else { input.disabled = false; input.value = input.dataset.previousValue || ''; }
}

function editLoadDemand(key) {
    const item = dataDemand.base.load[key];
    editingLoadDemand = { ...item };
    editingKeyDemand = key;

    document.getElementById('modalTitleDemand').innerHTML = `<i class="bi bi-pencil" style="color: #9c27b0;"></i> Editar Carga: ${item.name || key}`;
    document.getElementById('modalBodyDemand').innerHTML = generateFormHTMLDemand(editingLoadDemand);
    document.querySelector('#modalDemand .modal-footer').innerHTML = `
        <button class="btn-fluent btn-secondary" onclick="closeModalDemand()">Cancelar</button>
        <button class="btn-fluent btn-success" onclick="saveLoadDemand()"><i class="bi bi-check-circle"></i> Guardar</button>
    `;
    document.getElementById('modalDemand').classList.add('active');
}

function addNewLoadDemand() {
    const newKey = Utils.prompt('ID para la nueva carga:');
    if (!newKey) return;
    if (dataDemand.base.load[newKey]) { Utils.showNotification('Ya existe ese ID', 'warning'); return; }

    editingLoadDemand = {
        name: '',
        index: parseInt(newKey) || newKey,
        status: 1,
        load_bus: 1,
        pd: 0,
        qd: 0,
        zone: 1,
        area: 1
    };
    editingKeyDemand = newKey;

    document.getElementById('modalTitleDemand').innerHTML = '<i class="bi bi-plus-circle" style="color: #9c27b0;"></i> Agregar Carga';
    document.getElementById('modalBodyDemand').innerHTML = generateFormHTMLDemand(editingLoadDemand);
    document.querySelector('#modalDemand .modal-footer').innerHTML = `
        <button class="btn-fluent btn-secondary" onclick="closeModalDemand()">Cancelar</button>
        <button class="btn-fluent btn-success" onclick="saveLoadDemand()"><i class="bi bi-check-circle"></i> Guardar</button>
    `;
    document.getElementById('modalDemand').classList.add('active');
}

function saveLoadDemand() {
    const container = document.getElementById('propertiesContainerDemand');
    container.querySelectorAll('input:not([id^="nullDemand_"])').forEach(input => {
        const key = input.id.replace('fieldDemand_', '');
        const nullCb = document.getElementById(`nullDemand_${key}`);
        
        if (nullCb?.checked) editingLoadDemand[key] = null;
        else if (input.type === 'checkbox') editingLoadDemand[key] = input.checked;
        else if (input.dataset.type === 'number') editingLoadDemand[key] = input.value === '' ? null : parseFloat(input.value);
        else editingLoadDemand[key] = input.value;
    });

    dataDemand.base.load[editingKeyDemand] = editingLoadDemand;
    closeModalDemand();
    renderDemand();
    Utils.showNotification('Carga guardada', 'success');
}

function deleteLoadDemand(key) {
    if (Utils.confirm('¿Eliminar esta carga?')) {
        delete dataDemand.base.load[key];
        selectedNodesDemand.delete(key);
        renderDemand();
        Utils.showNotification('Carga eliminada', 'success');
    }
}

function closeModalDemand() {
    document.getElementById('modalDemand').classList.remove('active');
    editingLoadDemand = null;
    editingKeyDemand = null;
}

function exportDataDemand() {
    const sysName = dataDemand.base?.name || 'demanda';
    Utils.downloadJSON(dataDemand, `${sysName.replace(/\s+/g, '_')}_demanda_${new Date().toISOString().split('T')[0]}.json`);
    Utils.showNotification('Datos exportados', 'success');
}

// ==================== RENDER PRINCIPAL ====================

function renderDemand() {
    updateStatsDemand();
    const items = getCurrentItemsDemand();
    const content = document.getElementById('contentDemand');
    
    if (!dataDemand?.base?.load || Object.keys(dataDemand.base.load).length === 0) {
        content.innerHTML = `
            <div class="acrylic-card empty-state">
                <i class="bi bi-graph-up-arrow"></i>
                <h3>Sin datos de demanda</h3>
                <p>Carga un archivo con datos de demanda o agrega cargas manualmente.</p>
                <button class="btn-fluent btn-primary" onclick="addNewLoadDemand()">
                    <i class="bi bi-plus-circle"></i> Agregar Carga
                </button>
            </div>
        `;
        return;
    }
    
    switch (currentViewDemand) {
        case 'table':
            content.innerHTML = renderTableDemand(items);
            break;
        case 'chart':
            content.innerHTML = renderChartDemand();
            break;
        default:
            content.innerHTML = renderCardsDemand(items);
    }
}
