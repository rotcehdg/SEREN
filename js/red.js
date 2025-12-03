// ==================== MÓDULO: GESTOR DE RED - OPTIMIZADO ====================

let dataNet = null;
let currentCategory = '';
let currentViewNet = 'cards';
let editingItemNet = null;
let editingKeyNet = null;
let filterActiveOnlyNet = true;

// Cache para cálculos repetitivos
const NetCache = {
    _systemSummary: null,
    _categorySchema: new Map(),
    _currentItems: null,
    _availableCategories: null,
    _lastCategory: '',
    _lastFilterState: null,
    _lastUpdateTime: 0,
    
    // Cache de estadísticas del sistema
    getSystemSummary: function(forceRefresh = false) {
        if (!forceRefresh && this._systemSummary && (Date.now() - this._lastUpdateTime < 30000)) {
            return this._systemSummary;
        }
        
        if (!dataNet?.base) return {};
        const base = dataNet.base;
        const summary = {
            totalGen: { count: 0, active: 0, pmax: 0 },
            totalLoad: { count: 0, active: 0, pd: 0 },
            totalBranch: { count: 0, active: 0 },
            totalBus: { count: 0 },
            totalShunt: { count: 0, active: 0 }
        };
        
        // Optimización: usar for loops en lugar de forEach
        if (base.gen) {
            const gens = Object.values(base.gen);
            for (let i = 0; i < gens.length; i++) {
                const g = gens[i];
                summary.totalGen.count++;
                if (g.gen_status === 1 || g.gen_status === true) {
                    summary.totalGen.active++;
                    summary.totalGen.pmax += g.pmax || 0;
                }
            }
        }
        
        if (base.load) {
            const loads = Object.values(base.load);
            for (let i = 0; i < loads.length; i++) {
                const l = loads[i];
                summary.totalLoad.count++;
                if (l.status === 1 || l.status === true) {
                    summary.totalLoad.active++;
                    summary.totalLoad.pd += l.pd || 0;
                }
            }
        }
        
        if (base.branch) {
            const branches = Object.values(base.branch);
            for (let i = 0; i < branches.length; i++) {
                const b = branches[i];
                summary.totalBranch.count++;
                if (b.br_status === 1 || b.br_status === true) summary.totalBranch.active++;
            }
        }
        
        if (base.bus) summary.totalBus.count = Object.keys(base.bus).length;
        
        if (base.shunt) {
            const shunts = Object.values(base.shunt);
            for (let i = 0; i < shunts.length; i++) {
                const s = shunts[i];
                summary.totalShunt.count++;
                if (s.status === 1 || s.status === true) summary.totalShunt.active++;
            }
        }
        
        this._systemSummary = summary;
        this._lastUpdateTime = Date.now();
        return summary;
    },
    
    // Cache de esquema de categoría
    getCategorySchema: function(category, forceRefresh = false) {
        const cacheKey = `schema_${category}`;
        
        if (!forceRefresh && this._categorySchema.has(cacheKey)) {
            return this._categorySchema.get(cacheKey);
        }
        
        if (!category || !dataNet?.base?.[category]) {
            return { properties: {}, inconsistencies: [], nullCounts: {}, totalItems: 0 };
        }
        
        const items = Object.values(dataNet.base[category]);
        if (items.length === 0) {
            return { properties: {}, inconsistencies: [], nullCounts: {}, totalItems: 0 };
        }
        
        const allProps = new Map();
        const nullCounts = {};
        
        // Optimización: bucles anidados más eficientes
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const keys = Object.keys(item);
            
            for (let j = 0; j < keys.length; j++) {
                const key = keys[j];
                const val = item[key];
                
                if (typeof val === 'object' && val !== null && !Array.isArray(val)) continue;
                
                if (!allProps.has(key)) {
                    allProps.set(key, { 
                        type: Utils.getValueType(val), 
                        count: 0, 
                        nullCount: 0 
                    });
                }
                
                const prop = allProps.get(key);
                prop.count++;
                
                if (val === null) prop.nullCount++;
                else if (prop.type === 'null') prop.type = Utils.getValueType(val);
            }
        }
        
        const inconsistencies = [];
        allProps.forEach((info, key) => {
            if (info.count < items.length) {
                inconsistencies.push({
                    property: key,
                    presentIn: info.count,
                    totalItems: items.length,
                    percentage: Math.round((info.count / items.length) * 100)
                });
            }
            if (info.nullCount > 0) {
                nullCounts[key] = { count: info.nullCount, total: info.count };
            }
        });
        
        const result = {
            properties: Object.fromEntries(allProps),
            inconsistencies,
            nullCounts,
            totalItems: items.length
        };
        
        this._categorySchema.set(cacheKey, result);
        return result;
    },
    
    // Cache de items actuales
    getCurrentItems: function(category, filterActive) {
        const cacheKey = `items_${category}_${filterActive}`;
        
        // Cache hit si los parámetros no han cambiado
        if (this._currentItems && 
            this._lastCategory === category && 
            this._lastFilterState === filterActive) {
            return this._currentItems;
        }
        
        if (!category || !dataNet?.base?.[category]) return [];
        
        const entries = Object.entries(dataNet.base[category]);
        const result = new Array(entries.length);
        
        // Optimización: transformación más eficiente
        for (let i = 0; i < entries.length; i++) {
            const [key, value] = entries[i];
            result[i] = { ...value, _key: key };
        }
        
        // Filtrar si es necesario
        if (filterActive) {
            const config = getCategoryConfig(category);
            if (config.statusField) {
                const filtered = [];
                for (let i = 0; i < result.length; i++) {
                    const item = result[i];
                    if (isItemActive(item, config.statusField)) {
                        filtered.push(item);
                    }
                }
                // Reasignar array filtrado
                result.length = filtered.length;
                for (let i = 0; i < filtered.length; i++) {
                    result[i] = filtered[i];
                }
            }
        }
        
        this._currentItems = result;
        this._lastCategory = category;
        this._lastFilterState = filterActive;
        
        return result;
    },
    
    // Cache de categorías disponibles
    getAvailableCategories: function() {
        if (this._availableCategories) {
            return this._availableCategories;
        }
        
        if (!dataNet?.base) return [];
        const available = [];
        Object.keys(categoryConfig).forEach(cat => {
            if (dataNet.base[cat] && Object.keys(dataNet.base[cat]).length > 0) available.push(cat);
        });
        Object.keys(dataNet.base).forEach(key => {
            if (!SYSTEM_PROPERTIES.includes(key) && !available.includes(key) && 
                typeof dataNet.base[key] === 'object' && dataNet.base[key] !== null &&
                Object.keys(dataNet.base[key]).length > 0) {
                available.push(key);
            }
        });
        
        this._availableCategories = available;
        return available;
    },
    
    // Limpiar cache
    clear: function() {
        this._systemSummary = null;
        this._categorySchema.clear();
        this._currentItems = null;
        this._availableCategories = null;
        this._lastCategory = '';
        this._lastFilterState = null;
    },
    
    clearCategoryCache: function(category) {
        this._categorySchema.delete(`schema_${category}`);
        this._categorySchema.delete(`items_${category}_true`);
        this._categorySchema.delete(`items_${category}_false`);
        
        if (this._lastCategory === category) {
            this._currentItems = null;
        }
    }
};

// Configuraciones (sin cambios)
const PROTECTED_PROPERTIES_NET = {
    'bus': ['name', 'index', 'bus_i'],
    'gen': ['name', 'index', 'gen_bus'],
    'branch': ['name', 'index', 'f_bus', 't_bus'],
    'load': ['name', 'index', 'load_bus'],
    'shunt': ['name', 'index', 'shunt_bus'],
    'storage': ['name', 'index', 'storage_bus'],
    'branch3': ['name', 'index'],
    'dcline': ['name', 'index', 'f_bus', 't_bus'],
    'switch': ['name', 'index', 'f_bus', 't_bus']
};

const CARD_DISPLAY_PROPERTIES_NET = {
    'bus': ['name', 'base_kv', 'bus_type', 'zone', 'area', 'vmax', 'vmin'],
    'gen': ['name', 'gen_status', 'pg', 'qg', 'pmax', 'pmin', 'qmax', 'qmin'],
    'branch': ['name', 'br_status', 'f_bus', 't_bus', 'br_r', 'br_x', 'transformer'],
    'load': ['name', 'status', 'pd', 'qd', 'owner', 'zone', 'area'],
    'shunt': ['name', 'status', 'gs', 'bs', 'base_kv', 'zone'],
    'storage': ['name', 'status', 'energy', 'energy_rating', 'pmax', 'pmin'],
    'branch3': ['name', 'br_status', 'transformer', 'zone', 'area'],
    'dcline': ['name', 'status', 'f_bus', 't_bus', 'pf', 'pt'],
    'switch': ['name', 'status', 'f_bus', 't_bus', 'state', 'type']
};

const MAX_CARD_PROPERTIES_NET = 4;

const categoryConfig = {
    'bus': { name: 'Buses', icon: 'bi-circle-fill', statusField: null, color: '#2196f3' },
    'gen': { name: 'Generadores', icon: 'bi-lightning-charge-fill', statusField: 'gen_status', color: '#ff9800' },
    'branch': { name: 'Líneas/Trafos', icon: 'bi-bezier2', statusField: 'br_status', color: '#4caf50' },
    'load': { name: 'Cargas', icon: 'bi-house-fill', statusField: 'status', color: '#9c27b0' },
    'shunt': { name: 'Compensadores', icon: 'bi-diagram-2-fill', statusField: 'status', color: '#00bcd4' },
    'storage': { name: 'Almacenamiento', icon: 'bi-battery-charging', statusField: 'status', color: '#8bc34a' },
    'branch3': { name: 'Trafos 3 Dev.', icon: 'bi-diagram-3-fill', statusField: 'br_status', color: '#795548' },
    'dcline': { name: 'Líneas DC', icon: 'bi-arrow-left-right', statusField: 'status', color: '#607d8b' },
    'switch': { name: 'Interruptores', icon: 'bi-toggle-on', statusField: 'status', color: '#e91e63' }
};

const SYSTEM_PROPERTIES = ['name', 'baseMVA', 'version', 'f', 'source_type', 'per_unit'];

// ==================== FUNCIONES AUXILIARES OPTIMIZADAS ====================

// Helper optimizado para verificar estado
function isItemActive(item, statusField) {
    if (!statusField) return true;
    const status = item[statusField];
    return status !== 0 && status !== false && status !== '0';
}

// Función memoizada para obtener configuración de categoría
const getCategoryConfig = (function() {
    const cache = new Map();
    return function(cat) {
        if (cache.has(cat)) return cache.get(cat);
        const config = categoryConfig[cat] || { 
            name: cat.charAt(0).toUpperCase() + cat.slice(1), 
            icon: 'bi-box', 
            statusField: 'status', 
            color: '#757575' 
        };
        cache.set(cat, config);
        return config;
    };
})();

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', function() {
    currentCategory = getAvailableCategories()[2];
    initNet();
});

function initNet() {
    setupEventListenersNet();
    loadDataFromFileNet();
}

function loadDataFromFileNet() {
    const contentDiv = document.getElementById('contentNet');
    contentDiv.innerHTML = `
        <div class="acrylic-card" style="text-align: center; padding: 60px;">
            <div class="spinner"></div>
            <h3 style="color: var(--text-secondary); margin-top: 20px;">Cargando datos de red...</h3>
        </div>
    `;

    fetch('data/base.json')
        .then(response => {
            if (!response.ok) throw new Error('No se pudo cargar el archivo de datos de red');
            return response.json();
        })
        .then(data => {
            dataNet = data;
            NetCache.clear(); // Limpiar cache al cargar nuevos datos
            updateSystemInfoPanel();
            updateCategorySelect();
            Utils.showNotification('Datos de red cargados', 'success');
        })
        .catch(error => {
            console.error('Error al cargar datos de red:', error);
            contentDiv.innerHTML = `
                <div class="acrylic-card empty-state">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h3>No se pudieron cargar los datos de red</h3>
                    <p>${error.message}</p>
                    <button class="btn-fluent btn-primary" onclick="loadDataFromFileNet()">
                        <i class="bi bi-arrow-clockwise"></i> Reintentar
                    </button>
                </div>
            `;
        });
}

// ==================== PANEL DEL SISTEMA - OPTIMIZADO ====================

function getSystemData() {
    if (!dataNet?.base) return null;
    return {
        name: dataNet.base.name || 'Sin nombre',
        baseMVA: dataNet.base.baseMVA || 100,
        version: dataNet.base.version || null,
        frequency: dataNet.base.f || null,
        per_unit: dataNet.base.per_unit !== undefined ? dataNet.base.per_unit : null
    };
}

function updateSystemInfoPanel() {
    const statsDiv = document.getElementById('statsNet');
    if (!statsDiv || !dataNet?.base) return;
    
    const sysData = getSystemData();
    const summary = NetCache.getSystemSummary(); // Usar cache
    const baseMVA = sysData.baseMVA;
    
    statsDiv.innerHTML = `
        <div class="stat-card" style="grid-column: span 2; background: linear-gradient(135deg, #1a237e 0%, #3949ab 100%); color: white;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <p style="color: white;">${sysData.name}</p>
                </div>
                <div style="text-align: right;">
                    <p style="color: white;">${baseMVA} MVA</p>
                </div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.8rem;">
                ${sysData.frequency ? `<span><i class="bi bi-activity"></i> ${sysData.frequency} Hz</span>` : ''}
                ${sysData.version ? `<span><i class="bi bi-tag"></i> v${sysData.version}</span>` : ''}
                <span style="margin-left: auto; cursor: pointer;" onclick="editSystemInfo()"><i class="bi bi-gear"></i> Configurar</span>
            </div>
        </div>
    `;
}

// Las funciones editSystemInfo y saveSystemInfo permanecen iguales
function editSystemInfo() {
    const sysData = getSystemData();
    const modal = document.getElementById('modalNet');
    
    document.getElementById('modalTitleNet').innerHTML = '<i class="bi bi-gear"></i> Configuración del Sistema';
    document.getElementById('modalBodyNet').innerHTML = `
        <div style="padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 10px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="bi bi-info-circle" style="font-size: 1.5rem; color: #1976d2;"></i>
                <div>
                    <strong>Parámetros del Sistema</strong>
                    <p style="margin: 4px 0 0; font-size: 0.85rem; color: #555;">Estos parámetros afectan los cálculos de todo el sistema.</p>
                </div>
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">Nombre del Sistema</label>
            <input type="text" id="sysName" class="form-input" value="${sysData.name}">
        </div>
        <div class="form-group">
            <label class="form-label">Potencia Base (MVA)</label>
            <input type="number" id="sysBaseMVA" class="form-input" value="${sysData.baseMVA}" step="any">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="form-group">
                <label class="form-label">Frecuencia (Hz)</label>
                <input type="number" id="sysFrequency" class="form-input" value="${sysData.frequency || ''}" placeholder="50 o 60">
            </div>
            <div class="form-group">
                <label class="form-label">Versión</label>
                <input type="text" id="sysVersion" class="form-input" value="${sysData.version || ''}">
            </div>
        </div>
        <div class="form-group">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="sysPerUnit" class="form-checkbox" ${sysData.per_unit ? 'checked' : ''}>
                <span class="form-label" style="margin: 0;">Valores en por unidad (p.u.)</span>
            </label>
        </div>
    `;
    
    document.querySelector('#modalNet .modal-footer').innerHTML = `
        <button class="btn-fluent btn-secondary" onclick="closeModalNet()">Cancelar</button>
        <button class="btn-fluent btn-success" onclick="saveSystemInfo()"><i class="bi bi-check-circle"></i> Guardar</button>
    `;
    modal.classList.add('active');
}

function saveSystemInfo() {
    if (!dataNet?.base) return;
    dataNet.base.name = document.getElementById('sysName').value || 'Base';
    dataNet.base.baseMVA = parseFloat(document.getElementById('sysBaseMVA').value) || 100;
    const freq = document.getElementById('sysFrequency').value;
    if (freq) dataNet.base.f = parseFloat(freq);
    else delete dataNet.base.f;
    const version = document.getElementById('sysVersion').value;
    if (version) dataNet.base.version = version;
    else delete dataNet.base.version;
    dataNet.base.per_unit = document.getElementById('sysPerUnit').checked;
    
    closeModalNet();
    NetCache.clear(); // Limpiar cache al cambiar configuración del sistema
    updateSystemInfoPanel();
    renderNet();
    Utils.showNotification('Configuración actualizada', 'success');
}

// ==================== EVENT LISTENERS OPTIMIZADOS ====================

function setupEventListenersNet() {
    // Optimización: usar debounce mejorado si está disponible, sino el normal
    const debounceFn = window.AdvancedDebounce?.debounce || Utils.debounce;

    // Búsqueda optimizada con debounce
    document.getElementById('searchNet').addEventListener('input', debounceFn((e) => {
        const term = e.target.value.toLowerCase();
        const elements = document.querySelectorAll('#contentNet .item-card, #contentNet tbody tr');
        const len = elements.length;
        
        // Optimización: bucle simple
        for (let i = 0; i < len; i++) {
            elements[i].style.display = elements[i].textContent.toLowerCase().includes(term) ? '' : 'none';
        }
    }, 200));

    document.getElementById('addBtnNet').addEventListener('click', addNewItemNet);
    document.getElementById('exportBtnNet').addEventListener('click', exportDataNet);
    document.getElementById('importBtnNet').addEventListener('click', () => document.getElementById('fileInputNet').click());

    document.getElementById('fileInputNet').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            Utils.readJSONFile(file).then(data => {
                dataNet = data;
                NetCache.clear(); // Limpiar cache
                updateSystemInfoPanel();
                updateCategorySelect();
                Utils.showNotification('¡Datos importados!', 'success');
            }).catch(error => Utils.showNotification('Error: ' + error.message, 'error'));
        }
    });

    document.querySelectorAll('#tab-red .view-toggle button[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#tab-red .view-toggle button[data-view]').forEach(b => b.classList.remove('active'));
            e.target.closest('button').classList.add('active');
            currentViewNet = e.target.closest('button').dataset.view;
            renderNet();
        });
    });

    document.getElementById('filterStateNet')?.addEventListener('change', (e) => {
        filterActiveOnlyNet = e.target.checked;
        NetCache.clearCategoryCache(currentCategory); // Limpiar cache de esta categoría
        renderNet();
    });
}

// ==================== CATEGORÍAS - OPTIMIZADO ====================

function getAvailableCategories() {
    return NetCache.getAvailableCategories();
}

function updateCategorySelect() {
    currentCategory = getAvailableCategories()[0];
    renderNet();
}

// ==================== GESTIÓN DE ESQUEMA - OPTIMIZADO ====================

function getProtectedProperties() {
    return PROTECTED_PROPERTIES_NET[currentCategory] || ['name', 'index'];
}

function addPropertyToCategory(propertyName, propertyType, defaultValue) {
    if (!currentCategory || !dataNet?.base?.[currentCategory]) return 0;
    let value;
    switch (propertyType) {
        case 'number': value = defaultValue !== '' ? parseFloat(defaultValue) || 0 : 0; break;
        case 'boolean': value = defaultValue === 'true' || defaultValue === '1'; break;
        case 'null': value = null; break;
        default: value = defaultValue || '';
    }
    let count = 0;
    const items = Object.values(dataNet.base[currentCategory]);
    const itemsLength = items.length;
    
    for (let i = 0; i < itemsLength; i++) {
        const item = items[i];
        if (!item.hasOwnProperty(propertyName)) { 
            item[propertyName] = value; 
            count++; 
        }
    }
    
    // Limpiar cache después de modificar
    NetCache.clearCategoryCache(currentCategory);
    return count;
}

function removePropertyFromCategory(propertyName) {
    if (!currentCategory || !dataNet?.base?.[currentCategory]) return 0;
    let count = 0;
    const items = Object.values(dataNet.base[currentCategory]);
    const itemsLength = items.length;
    
    for (let i = 0; i < itemsLength; i++) {
        const item = items[i];
        if (item.hasOwnProperty(propertyName)) { 
            delete item[propertyName]; 
            count++; 
        }
    }
    
    // Limpiar cache después de modificar
    NetCache.clearCategoryCache(currentCategory);
    return count;
}

function normalizeSchemaNet() {
    if (!currentCategory || !dataNet?.base?.[currentCategory]) return 0;
    const items = Object.values(dataNet.base[currentCategory]);
    if (items.length === 0) return 0;
    
    const allProps = new Map();
    const itemsLength = items.length;
    
    for (let i = 0; i < itemsLength; i++) {
        const item = items[i];
        const keys = Object.keys(item);
        const keysLength = keys.length;
        
        for (let j = 0; j < keysLength; j++) {
            const key = keys[j];
            const val = item[key];
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) continue;
            if (!allProps.has(key)) allProps.set(key, { type: null, default: null });
            if (val !== null && allProps.get(key).type === null) {
                const t = typeof val;
                allProps.get(key).type = t;
                allProps.get(key).default = t === 'boolean' ? false : t === 'number' ? 0 : '';
            }
        }
    }
    
    let fixes = 0;
    for (let i = 0; i < itemsLength; i++) {
        const item = items[i];
        allProps.forEach((info, key) => {
            if (!item.hasOwnProperty(key)) { 
                item[key] = info.default !== null ? info.default : null; 
                fixes++; 
            }
        });
    }
    
    if (fixes > 0) {
        NetCache.clearCategoryCache(currentCategory);
    }
    return fixes;
}

// Las funciones openSchemaManagerNet, handleAddPropertyNet, handleRemovePropertyNet, 
// handleNormalizeSchemaNet permanecen funcionalmente iguales pero usan cache
function openSchemaManagerNet() {
    if (!currentCategory) { Utils.showNotification('Selecciona una categoría', 'warning'); return; }
    
    const schema = NetCache.getCategorySchema(currentCategory); // Usar cache
    const config = getCategoryConfig(currentCategory);
    const protectedProps = getProtectedProperties();
    
    document.getElementById('modalTitleNet').innerHTML = `<i class="bi ${config.icon}"></i> Esquema de ${config.name}`;
    
    const sortedProps = Object.entries(schema.properties).sort((a, b) => {
        if (protectedProps.includes(a[0]) && !protectedProps.includes(b[0])) return -1;
        if (!protectedProps.includes(a[0]) && protectedProps.includes(b[0])) return 1;
        return a[0].localeCompare(b[0]);
    });
    
    let html = `
        <div style="padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 10px; margin-bottom: 20px;">
            <strong>Gestión de Esquema</strong>
            <p style="margin: 4px 0 0; font-size: 0.85rem;">Cambios se aplicarán a <strong>${schema.totalItems} ${config.name.toLowerCase()}</strong>.</p>
        </div>
    `;
    
    if (schema.inconsistencies.length > 0) {
        html += `
            <div style="padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #ff9800;">
                <strong style="color: #e65100;">Inconsistencias Detectadas</strong>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                    ${schema.inconsistencies.map(i => `<span style="background: white; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem;">${i.property}: ${i.presentIn}/${i.totalItems}</span>`).join('')}
                </div>
                <button class="btn-fluent btn-primary" onclick="handleNormalizeSchemaNet()" style="margin-top: 12px;"><i class="bi bi-magic"></i> Normalizar</button>
            </div>
        `;
    }
    
    html += `<div style="margin-bottom: 16px;"><h4><i class="bi bi-list-check"></i> Propiedades (${sortedProps.length})</h4>
        <div style="border: 1px solid var(--border-color); border-radius: 10px; max-height: 250px; overflow-y: auto;">`;
    
    const sortedPropsLength = sortedProps.length;
    for (let idx = 0; idx < sortedPropsLength; idx++) {
        const [key, info] = sortedProps[idx];
        const isProtected = protectedProps.includes(key);
        html += `
            <div style="display: flex; align-items: center; padding: 12px 16px; background: ${idx % 2 === 0 ? '#fafafa' : 'white'}; border-bottom: 1px solid rgba(0,0,0,0.05);">
                <div style="flex: 1;">
                    <span style="font-weight: 600;">${key}</span>
                    ${isProtected ? '<i class="bi bi-lock-fill" style="color: #999; margin-left: 6px;"></i>' : ''}
                    <span style="margin-left: 8px; font-size: 0.75rem; background: #eee; padding: 2px 8px; border-radius: 4px;">${info.type}</span>
                </div>
                ${!isProtected ? `<button class="btn-fluent btn-danger" onclick="handleRemovePropertyNet('${key}')" style="padding: 6px 12px;"><i class="bi bi-trash"></i></button>` : ''}
            </div>
        `;
    }
    
    html += `</div></div>
        <div style="padding: 20px; background: var(--bg-secondary); border-radius: 10px;">
            <h4><i class="bi bi-plus-circle"></i> Agregar Propiedad</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                <div class="form-group" style="margin: 0;"><label class="form-label">Nombre</label><input type="text" id="schemaNewPropNameNet" class="form-input"></div>
                <div class="form-group" style="margin: 0;"><label class="form-label">Tipo</label>
                    <select id="schemaNewPropTypeNet" class="form-input">
                        <option value="number">Número</option><option value="text">Texto</option><option value="boolean">Booleano</option><option value="null">Null</option>
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin: 12px 0 0;"><label class="form-label">Valor por Defecto</label><input type="text" id="schemaNewPropDefaultNet" class="form-input"></div>
            <button class="btn-fluent btn-success" onclick="handleAddPropertyNet()" style="margin-top: 16px; width: 100%;"><i class="bi bi-plus-lg"></i> Agregar</button>
        </div>
    `;
    
    document.getElementById('modalBodyNet').innerHTML = html;
    document.querySelector('#modalNet .modal-footer').innerHTML = `<button class="btn-fluent btn-secondary" onclick="closeModalNet()">Cerrar</button>`;
    document.getElementById('modalNet').classList.add('active');
}

function handleAddPropertyNet() {
    const name = document.getElementById('schemaNewPropNameNet').value.trim();
    const type = document.getElementById('schemaNewPropTypeNet').value;
    const defaultVal = document.getElementById('schemaNewPropDefaultNet')?.value.trim() || '';
    if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) { Utils.showNotification('Nombre inválido', 'error'); return; }
    const count = addPropertyToCategory(name, type, defaultVal);
    Utils.showNotification(`Propiedad agregada a ${count} elementos`, 'success');
    openSchemaManagerNet();
    renderNet();
}

function handleRemovePropertyNet(propertyName) {
    if (Utils.confirm(`¿Eliminar "${propertyName}" de todos los elementos?`)) {
        const count = removePropertyFromCategory(propertyName);
        Utils.showNotification(`Propiedad eliminada de ${count} elementos`, 'success');
        openSchemaManagerNet();
        renderNet();
    }
}

function handleNormalizeSchemaNet() {
    const fixes = normalizeSchemaNet();
    Utils.showNotification(fixes > 0 ? `Normalizado: ${fixes} propiedades agregadas` : 'Ya está normalizado', fixes > 0 ? 'success' : 'info');
    if (fixes > 0) { 
        openSchemaManagerNet(); 
        renderNet(); 
    }
}

// ==================== ESTADÍSTICAS - OPTIMIZADO ====================

function updateStatsNet() {
    updateSystemInfoPanel();
    const statsDiv = document.getElementById('statsNet');
    if (!dataNet?.base) return;
    
    let categoriesHtml = '';
    const categories = getAvailableCategories();
    const categoriesLength = categories.length;
    
    for (let i = 0; i < categoriesLength; i++) {
        const cat = categories[i];
        const items = Object.values(dataNet.base[cat]);
        const config = getCategoryConfig(cat);
        let activeCount = items.length;
        
        if (config.statusField) {
            activeCount = 0;
            const itemsLength = items.length;
            for (let j = 0; j < itemsLength; j++) {
                if (isItemActive(items[j], config.statusField)) activeCount++;
            }
        }
        
        const isActive = currentCategory === cat;
        
        categoriesHtml += `
            <div class="stat-card ${isActive ? 'active' : ''}" onclick="currentCategory='${cat}'; renderNet();">
                <h3><i class="bi ${config.icon}"></i> ${config.name}</h3>
                <p>${items.length}</p>
            </div>
        `;
    }
    statsDiv.innerHTML += categoriesHtml;
}

// ==================== OBTENER ITEMS - OPTIMIZADO ====================

function getCurrentItemsNet() {
    return NetCache.getCurrentItems(currentCategory, filterActiveOnlyNet);
}

function getDisplayName(item) {
    return item.name || item.chr_name || item.for_name || item._key;
}

function getStatusBadge(item) {
    const config = getCategoryConfig(currentCategory);
    if (!config.statusField) return '';
    const isActive = isItemActive(item, config.statusField);
    return `<span class="badge-fluent ${isActive ? 'badge-success' : 'badge-danger'}">${isActive ? '✓ Activo' : '✗ Inactivo'}</span>`;
}

// ==================== RENDERIZADO - OPTIMIZADO ====================

// Cache simple para tarjetas renderizadas
const cardRenderCache = new Map();

function toggleCardExpandNet(index) {
    const hiddenDiv = document.getElementById(`hiddenPropsNet-${index}`);
    const label = document.getElementById(`expandLabelNet-${index}`);
    if (!hiddenDiv || !label) return;
    const isExpanded = hiddenDiv.style.display !== 'none';
    hiddenDiv.style.display = isExpanded ? 'none' : 'block';
    label.innerHTML = isExpanded ? `<i class="bi bi-chevron-down"></i> +${hiddenDiv.querySelectorAll('.info-item').length} más` : `<i class="bi bi-chevron-up"></i> Ver menos`;
}

function renderCardsNet(items) {
    if (items.length === 0) {
        const config = getCategoryConfig(currentCategory);
        return `<div class="acrylic-card empty-state">
            <h3>No hay ${config.name.toLowerCase()}</h3>
            <p>${filterActiveOnlyNet ? 'No hay elementos activos.' : 'Agrega elementos para comenzar.'}</p>
        </div>`;
    }
    
    const config = getCategoryConfig(currentCategory);
    const priorityProps = CARD_DISPLAY_PROPERTIES_NET[currentCategory] || [];
    const itemsLength = items.length;
    
    // Construir HTML eficientemente
    let cardsHTML = '<div class="cards-grid">';
    
    for (let index = 0; index < itemsLength; index++) {
        const item = items[index];
        const cacheKey = `card_${currentCategory}_${item._key}`;
        
        // Intentar usar cache
        if (cardRenderCache.has(cacheKey)) {
            cardsHTML += cardRenderCache.get(cacheKey);
            continue;
        }
        
        const excludeKeys = ['_key', 'name', 'chr_name', 'for_name', config.statusField].filter(Boolean);
        const allProps = Object.keys(item).filter(k => {
            if (excludeKeys.includes(k)) return false;
            const val = item[k];
            return typeof val !== 'object' || val === null || Array.isArray(val);
        });
        
        // Ordenar propiedades de manera más eficiente
        const orderedProps = [];
        const priorityPropsLength = priorityProps.length;
        const allPropsLength = allProps.length;
        
        // Agregar propiedades prioritarias primero
        for (let i = 0; i < priorityPropsLength; i++) {
            const prop = priorityProps[i];
            if (allProps.includes(prop)) orderedProps.push(prop);
        }
        
        // Agregar el resto
        for (let i = 0; i < allPropsLength; i++) {
            const prop = allProps[i];
            if (!priorityProps.includes(prop)) orderedProps.push(prop);
        }
        
        const propsToShow = orderedProps.slice(0, MAX_CARD_PROPERTIES_NET);
        const hiddenProps = orderedProps.slice(MAX_CARD_PROPERTIES_NET);
        
        const cardHTML = `
        <div class="item-card">
            <div class="card-header">
                <div class="card-header-title">
                    <h3>${getDisplayName(item)}</h3>
                    ${getStatusBadge(item)}
                </div>
                <p style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">
                    ${item.for_name}
                    ID: ${item._key}    
                </p>
            </div>
            <div class="card-info">
                <div class="card-props-main">
                    ${propsToShow.map(key => `<div class="info-item"><label>${key}</label><span>${Utils.formatValue(item[key])}</span></div>`).join('')}
                </div>
                ${hiddenProps.length > 0 ? `
                    <div class="card-props-hidden" id="hiddenPropsNet-${index}" style="display: none;">
                        <div class="card-props-main">${hiddenProps.map(key => `<div class="info-item"><label>${key}</label><span>${Utils.formatValue(item[key])}</span></div>`).join('')}</div>
                    </div>
                    <div class="expand-trigger" onclick="event.stopPropagation(); toggleCardExpandNet(${index})">
                        <span id="expandLabelNet-${index}"><i class="bi bi-chevron-down"></i> +${hiddenProps.length} más</span>
                    </div>
                ` : ''}
            </div>
            <div class="card-actions">
                <button class="btn-fluent btn-primary" onclick="editItemNet('${item._key}')"><i class="bi bi-pencil"></i> Editar</button>
                <button class="btn-fluent btn-danger" onclick="deleteItemNet('${item._key}')"><i class="bi bi-trash"></i> Eliminar</button>
            </div>
        </div>`;
        
        // Cachear tarjeta
        if (cardRenderCache.size > 100) {
            // Limitar tamaño del cache (estrategia FIFO simple)
            const firstKey = cardRenderCache.keys().next().value;
            cardRenderCache.delete(firstKey);
        }
        cardRenderCache.set(cacheKey, cardHTML);
        
        cardsHTML += cardHTML;
    }
    
    cardsHTML += '</div>';
    return cardsHTML;
}

function renderTableNet(items) {
    if (items.length === 0) return `<div class="acrylic-card empty-state"><h3>No hay elementos</h3></div>`;
    
    const priorityProps = CARD_DISPLAY_PROPERTIES_NET[currentCategory] || [];
    const fields = new Set(['_key']);
    const itemsLength = items.length;
    
    // Determinar campos a mostrar de manera más eficiente
    if (itemsLength > 0) {
        // Usar el primer item para determinar campos comunes
        const firstItem = items[0];
        const firstItemKeys = Object.keys(firstItem);
        
        // Agregar propiedades prioritarias que existan
        for (let i = 0; i < priorityProps.length; i++) {
            if (firstItem.hasOwnProperty(priorityProps[i])) fields.add(priorityProps[i]);
        }
        
        // Agregar otros campos
        for (let i = 0; i < firstItemKeys.length; i++) {
            const key = firstItemKeys[i];
            const val = firstItem[key];
            if ((typeof val !== 'object' || val === null || Array.isArray(val)) && !fields.has(key)) {
                fields.add(key);
            }
        }
    }
    
    const fieldsArray = Array.from(fields);
    const fieldsLength = fieldsArray.length;
    
    // Construir tabla eficientemente
    let tableHTML = `<div class="acrylic-card"><div class="table-container"><table class="table-fluent">
        <thead><tr>${fieldsArray.map(f => `<th>${f === '_key' ? 'ID' : f}</th>`).join('')}<th>Acciones</th></tr></thead>
        <tbody>`;
    
    for (let i = 0; i < itemsLength; i++) {
        const item = items[i];
        let rowHTML = '<tr>';
        
        for (let j = 0; j < fieldsLength; j++) {
            const f = fieldsArray[j];
            rowHTML += `<td>${f === '_key' ? `<strong>${item[f]}</strong>` : Utils.formatValue(item[f])}</td>`;
        }
        
        rowHTML += `<td>
            <button class="btn-fluent btn-primary" onclick="editItemNet('${item._key}')" style="padding: 6px 12px;"><i class="bi bi-pencil"></i></button>
            <button class="btn-fluent btn-danger" onclick="deleteItemNet('${item._key}')" style="padding: 6px 12px;"><i class="bi bi-trash"></i></button>
        </td></tr>`;
        
        tableHTML += rowHTML;
    }
    
    tableHTML += `</tbody></table></div></div>`;
    return tableHTML;
}

// ==================== CRUD - OPTIMIZADO ====================

function generateFormHTMLNet(item) {
    const protectedProps = getProtectedProperties();
    let html = `<div id="propertiesContainerNet">`;
    
    const sortedKeys = Object.keys(item).filter(k => k !== '_key').sort((a, b) => {
        if (protectedProps.includes(a) && !protectedProps.includes(b)) return -1;
        if (!protectedProps.includes(a) && protectedProps.includes(b)) return 1;
        return a.localeCompare(b);
    });
    
    const sortedKeysLength = sortedKeys.length;
    for (let i = 0; i < sortedKeysLength; i++) {
        const key = sortedKeys[i];
        const value = item[key];
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) continue;
        
        const isProtected = protectedProps.includes(key);
        const isNull = value === null;
        const isArray = Array.isArray(value);
        const inputType = typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text';
        
        if (inputType === 'checkbox' && !isNull && !isArray) {
            html += `
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="fieldNet_${key}" data-type="boolean" class="form-checkbox" ${value ? 'checked' : ''}>
                        <span class="form-label" style="margin: 0;">${key}</span>
                        ${isProtected ? '<i class="bi bi-lock-fill" style="color: var(--text-muted);"></i>' : ''}
                    </label>
                </div>
            `;
        } else {
            const displayValue = isNull ? '' : (isArray ? JSON.stringify(value) : (value ?? ''));
            html += `
                <div class="form-group">
                    <label class="form-label" style="display: flex; align-items: center; gap: 6px;">
                        ${key} ${isProtected ? '<i class="bi bi-lock-fill" style="color: var(--text-muted);"></i>' : ''}
                        ${isNull ? '<span class="badge-warning">NULL</span>' : ''} ${isArray ? '<span class="badge-primary">ARRAY</span>' : ''}
                    </label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="${isArray ? 'text' : inputType}" id="fieldNet_${key}" class="form-input" 
                            data-type="${Utils.getValueType(value)}" data-is-array="${isArray}" value="${displayValue}" 
                            ${isNull ? 'disabled' : ''} step="any">
                        ${!isProtected ? `
                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.8rem;">
                                <input type="checkbox" id="nullNet_${key}" ${isNull ? 'checked' : ''} onchange="toggleNullFieldNet('${key}', this.checked)">
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

function toggleNullFieldNet(key, isNull) {
    const input = document.getElementById(`fieldNet_${key}`);
    if (!input) return;
    if (isNull) { 
        input.dataset.previousValue = input.value; 
        input.value = ''; 
        input.disabled = true; 
    } else { 
        input.disabled = false; 
        input.value = input.dataset.previousValue || ''; 
    }
}

function editItemNet(key) {
    const item = dataNet.base[currentCategory][key];
    editingItemNet = { ...item };
    editingKeyNet = key;

    const config = getCategoryConfig(currentCategory);
    document.getElementById('modalTitleNet').innerHTML = `<i class="bi ${config.icon}"></i> Editar: ${getDisplayName(item)}`;
    document.getElementById('modalBodyNet').innerHTML = generateFormHTMLNet(editingItemNet);
    document.querySelector('#modalNet .modal-footer').innerHTML = `
        <button class="btn-fluent btn-secondary" onclick="closeModalNet()">Cancelar</button>
        <button class="btn-fluent btn-success" onclick="saveItemNet()"><i class="bi bi-check-circle"></i> Guardar</button>
    `;
    document.getElementById('modalNet').classList.add('active');
}

function addNewItemNet() {
    if (!currentCategory) { Utils.showNotification('Selecciona una categoría', 'warning'); return; }
    const newKey = Utils.prompt('ID para el nuevo elemento:');
    if (!newKey) return;
    if (dataNet.base[currentCategory][newKey]) { Utils.showNotification('Ya existe ese ID', 'warning'); return; }

    const schema = NetCache.getCategorySchema(currentCategory); // Usar cache
    editingItemNet = { index: parseInt(newKey) || newKey };
    Object.entries(schema.properties).forEach(([key, info]) => {
        if (key === 'index') return;
        editingItemNet[key] = info.type === 'boolean' ? false : info.type === 'number' ? 0 : info.type === 'array' ? [] : info.type === 'null' ? null : '';
    });
    editingKeyNet = newKey;

    const config = getCategoryConfig(currentCategory);
    document.getElementById('modalTitleNet').innerHTML = `<i class="bi bi-plus-circle"></i> Agregar ${config.name}`;
    document.getElementById('modalBodyNet').innerHTML = generateFormHTMLNet(editingItemNet);
    document.querySelector('#modalNet .modal-footer').innerHTML = `
        <button class="btn-fluent btn-secondary" onclick="closeModalNet()">Cancelar</button>
        <button class="btn-fluent btn-success" onclick="saveItemNet()"><i class="bi bi-check-circle"></i> Guardar</button>
    `;
    document.getElementById('modalNet').classList.add('active');
}

function saveItemNet() {
    const container = document.getElementById('propertiesContainerNet');
    const inputs = container.querySelectorAll('input:not([id^="nullNet_"])');
    const inputsLength = inputs.length;
    
    for (let i = 0; i < inputsLength; i++) {
        const input = inputs[i];
        const key = input.id.replace('fieldNet_', '');
        const nullCb = document.getElementById(`nullNet_${key}`);
        
        if (nullCb?.checked) editingItemNet[key] = null;
        else if (input.type === 'checkbox') editingItemNet[key] = input.checked;
        else if (input.dataset.isArray === 'true') {
            try { editingItemNet[key] = JSON.parse(input.value); }
            catch { editingItemNet[key] = input.value.split(',').map(v => { const n = parseFloat(v.trim()); return isNaN(n) ? v.trim() : n; }); }
        }
        else if (input.dataset.type === 'number') editingItemNet[key] = input.value === '' ? null : parseFloat(input.value);
        else editingItemNet[key] = input.value;
    }

    dataNet.base[currentCategory][editingKeyNet] = editingItemNet;
    closeModalNet();
    
    // Limpiar caches relacionados
    NetCache.clearCategoryCache(currentCategory);
    cardRenderCache.clear();
    
    updateSystemInfoPanel();
    renderNet();
    Utils.showNotification('Elemento guardado', 'success');
}

function deleteItemNet(key) {
    if (Utils.confirm('¿Eliminar este elemento?')) {
        delete dataNet.base[currentCategory][key];
        
        // Limpiar caches relacionados
        NetCache.clearCategoryCache(currentCategory);
        cardRenderCache.clear();
        
        updateSystemInfoPanel();
        renderNet();
        Utils.showNotification('Elemento eliminado', 'success');
    }
}

function closeModalNet() {
    document.getElementById('modalNet').classList.remove('active');
    editingItemNet = null;
    editingKeyNet = null;
}

function exportDataNet() {
    const sysName = dataNet.base?.name || 'network';
    Utils.downloadJSON(dataNet, `${sysName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`);
    Utils.showNotification('Datos exportados', 'success');
}

function updateCurrentCategoryIndicator() {
    const indicator = document.getElementById('currentCategoryIndicator');
    if (!indicator) return;
    
    if (currentCategory) {
        const config = getCategoryConfig(currentCategory);
        const items = getCurrentItemsNet();
        const totalItems = dataNet?.base?.[currentCategory] ? Object.keys(dataNet.base[currentCategory]).length : 0;
        
        indicator.innerHTML = `
            <button onclick="openSchemaManagerNet()" style="background: rgba(0, 120, 212, 0.08); border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 8px; font-weight: 600; color: var(--primary-color);">
                <i class="bi ${config.icon}""></i> ${config.name} 
                <span style="color: var(--text-muted);">(${items.length}${filterActiveOnlyNet && config.statusField ? `/${totalItems}` : ''})</span>
                <i class="bi bi-gear"></i>
            </button>
        `;
    } else {
        indicator.innerHTML = '';
    }
}

// ==================== RENDER PRINCIPAL - OPTIMIZADO ====================

function renderNet() {
    updateStatsNet();
    updateCurrentCategoryIndicator();
    const items = getCurrentItemsNet();
    const content = document.getElementById('contentNet');
    
    if (!currentCategory) {
        const sysData = getSystemData();
        content.innerHTML = `
            <div class="acrylic-card empty-state">
                <i class="bi bi-diagram-3-fill"></i>
                <h3>Sistema: ${sysData?.name || 'Sin cargar'}</h3>
                <p>Elige una categoría para ver y gestionar los elementos de la red.</p>
            </div>
        `;
        return;
    }
    
    content.innerHTML = currentViewNet === 'cards' ? renderCardsNet(items) : renderTableNet(items);
}

// Exportar funciones necesarias globalmente
window.NetCache = NetCache;
window.openSchemaManagerNet = openSchemaManagerNet;
window.handleAddPropertyNet = handleAddPropertyNet;
window.handleRemovePropertyNet = handleRemovePropertyNet;
window.handleNormalizeSchemaNet = handleNormalizeSchemaNet;
window.editItemNet = editItemNet;
window.deleteItemNet = deleteItemNet;
window.closeModalNet = closeModalNet;
window.saveItemNet = saveItemNet;
window.addNewItemNet = addNewItemNet;
window.exportDataNet = exportDataNet;
window.editSystemInfo = editSystemInfo;
window.saveSystemInfo = saveSystemInfo;
window.toggleNullFieldNet = toggleNullFieldNet;
window.initNet = initNet;
window.loadDataFromFileNet = loadDataFromFileNet;
window.renderNet = renderNet;
window.toggleCardExpandNet = toggleCardExpandNet;