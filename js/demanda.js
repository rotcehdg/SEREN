// ==================== MÓDULO: GESTOR DE DEMANDA SENI ====================

let dataDemand = null;
let dataTimeSeries = null;
let currentViewDemand = 'cards';
let editingLoadDemand = null;
let editingKeyDemand = null;
let filterActiveOnlyDemand = true;
let demandCharts = {};

// Configuración temporal
let timeConfig = {
    startDate: null,
    endDate: null,
    resolution: 60 // minutos
};

// Cache para optimización
const DemandCache = {
    _summary: null,
    _currentItems: null,
    _lastFilterState: null,
    _timeSeriesProcessed: null,
    
    clear: function() {
        this._summary = null;
        this._currentItems = null;
        this._timeSeriesProcessed = null;
    }
};

// Propiedades protegidas y de visualización
const PROTECTED_PROPS_DEMAND = ['name', 'index', 'load_bus', '_key'];
const CARD_DISPLAY_PROPS_DEMAND = ['name', 'status', 'pd', 'qd', 'load_bus', 'zone', 'area', 'owner'];
const MAX_CARD_PROPS_DEMAND = 6;

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', function() {
    initDemand();
});

function initDemand() {
    setupEventListenersDemand();
    loadDataFromFileDemand();

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    
    document.getElementById('startDateDemand').value = startOfDay.toISOString().slice(0, 16);
    document.getElementById('endDateDemand').value = endOfDay.toISOString().slice(0, 16);
    
    timeConfig.startDate = startOfDay;
    timeConfig.endDate = endOfDay;
}

function setupEventListenersDemand() {
    document.getElementById('searchDemand').addEventListener('input', Utils.debounce((e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#contentDemand .item-card, #contentDemand tbody tr').forEach(el => {
            el.style.display = el.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
    }, 200));

    document.getElementById('addBtnDemand').addEventListener('click', addNewLoadDemand);
    document.getElementById('exportBtnDemand').addEventListener('click', exportDataDemand);
    document.getElementById('importBtnDemand').addEventListener('click', () => document.getElementById('fileInputDemand').click());

    document.getElementById('fileInputDemand').addEventListener('change', handleFileImport);

    document.querySelectorAll('#tab-demanda .view-toggle button[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#tab-demanda .view-toggle button[data-view]').forEach(b => b.classList.remove('active'));
            e.target.closest('button').classList.add('active');
            currentViewDemand = e.target.closest('button').dataset.view;
            renderDemand();
        });
    });

    document.getElementById('filterStateDemand')?.addEventListener('change', (e) => {
        filterActiveOnlyDemand = e.target.checked;
        DemandCache._currentItems = null;
        renderDemand();
    });

    document.getElementById('applyTimeFilterDemand')?.addEventListener('click', applyTimeFilter);
    
    document.getElementById('resolutionDemand')?.addEventListener('change', (e) => {
        timeConfig.resolution = parseInt(e.target.value);
    });
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
            DemandCache.clear();
            updateStatsDemand();
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











































// ==================== IMPORTACIÓN DE ARCHIVOS ====================

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (extension === 'csv') {
        importCSVTimeSeries(file);
    } else if (extension === 'json') {
        importJSONTimeSeries(file);
    } else {
        Utils.showNotification('Formato no soportado. Use CSV o JSON', 'error');
    }
    
    e.target.value = '';
}

// ==================== IMPORTACIÓN JSON (Formato SENI) ====================

function importJSONTimeSeries(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const jsonData = JSON.parse(e.target.result);
            
            // Detectar formato: Array de objetos con FECHA o estructura base
            if (Array.isArray(jsonData) && jsonData.length > 0 && jsonData[0].FECHA) {
                // Formato SENI: Array con FECHA, GENERACION, PACTIVA, PREACTIVA
                dataTimeSeries = processSENIFormat(jsonData);
                updateTimeControlsFromData();
                Utils.showNotification(`Series importadas: ${dataTimeSeries.timestamps.length} registros`, 'success');
            } else if (jsonData.base && jsonData.base.load) {
                // Formato base.json con cargas
                dataDemand = jsonData;
                Utils.showNotification('Datos de cargas importados', 'success');
            } else if (jsonData.timeSeries) {
                // Formato exportado previamente
                dataTimeSeries = jsonData.timeSeries;
                Utils.showNotification('Series temporales importadas', 'success');
            } else {
                throw new Error('Formato JSON no reconocido');
            }
            
            DemandCache.clear();
            updateStatsDemand();
            
            if (currentViewDemand === 'chart') {
                renderDemand();
            }
        } catch (error) {
            console.error('Error procesando JSON:', error);
            Utils.showNotification('Error al procesar JSON: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

function processSENIFormat(jsonData) {
    // Ordenar por fecha
    jsonData.sort((a, b) => new Date(a.FECHA) - new Date(b.FECHA));
    
    const timestamps = [];
    const loads = {
        'GENERACION': [],
        'PACTIVA': [],
        'PREACTIVA': []
    };
    
    // Detectar todas las columnas numéricas disponibles
    const sampleKeys = Object.keys(jsonData[0]).filter(k => k !== 'FECHA');
    sampleKeys.forEach(key => {
        if (!loads[key]) loads[key] = [];
    });
    
    jsonData.forEach(record => {
        timestamps.push(new Date(record.FECHA));
        
        Object.keys(loads).forEach(key => {
            loads[key].push(record[key] || 0);
        });
    });
    
    // Detectar resolución
    const resolution = timestamps.length > 1 
        ? Math.round((timestamps[1] - timestamps[0]) / (1000 * 60)) 
        : 1;
    
    return {
        timestamps,
        loads,
        resolution,
        source: 'SENI',
        importDate: new Date().toISOString()
    };
}

function updateTimeControlsFromData() {
    if (!dataTimeSeries || !dataTimeSeries.timestamps.length) return;
    
    const minDate = new Date(Math.min(...dataTimeSeries.timestamps));
    const maxDate = new Date(Math.max(...dataTimeSeries.timestamps));
    
    document.getElementById('startDateDemand').value = minDate.toISOString().slice(0, 16);
    document.getElementById('endDateDemand').value = maxDate.toISOString().slice(0, 16);
    
    timeConfig.startDate = minDate;
    timeConfig.endDate = maxDate;
    timeConfig.resolution = dataTimeSeries.resolution || 1;
    
    // Actualizar selector de resolución
    const resSelect = document.getElementById('resolutionDemand');
    if (resSelect) {
        const res = dataTimeSeries.resolution;
        // Seleccionar la opción más cercana
        const options = [1, 5, 15, 30, 60];
        const closest = options.reduce((a, b) => Math.abs(b - res) < Math.abs(a - res) ? b : a);
        resSelect.value = closest;
    }
}

// ==================== IMPORTACIÓN CSV ====================

function importCSVTimeSeries(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const csvData = parseCSV(e.target.result);
            dataTimeSeries = processCSVToTimeSeries(csvData);
            updateTimeControlsFromData();
            Utils.showNotification(`CSV importado: ${dataTimeSeries.timestamps.length} registros`, 'success');
            
            DemandCache.clear();
            if (currentViewDemand === 'chart') {
                renderDemand();
            }
        } catch (error) {
            Utils.showNotification('Error al procesar CSV: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= headers.length) {
            const row = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx];
            });
            data.push(row);
        }
    }
    
    return { headers, data };
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if ((char === ',' || char === ';') && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    
    return result;
}

function processCSVToTimeSeries(csvData) {
    const { headers, data } = csvData;
    
    // Detectar columna de tiempo
    const timeColumn = headers.find(h => 
        h.toLowerCase().includes('fecha') ||
        h.toLowerCase().includes('time') || 
        h.toLowerCase().includes('hora') ||
        h.toLowerCase() === 't' ||
        h.toLowerCase() === 'timestamp'
    ) || headers[0];
    
    const timestamps = [];
    const loads = {};
    
    // Columnas de datos (excluyendo tiempo)
    const dataColumns = headers.filter(h => h !== timeColumn);
    dataColumns.forEach(col => {
        loads[col] = [];
    });
    
    data.forEach(row => {
        const timestamp = parseTimestamp(row[timeColumn]);
        timestamps.push(timestamp);
        
        dataColumns.forEach(col => {
            const value = parseFloat(row[col]) || 0;
            loads[col].push(value);
        });
    });
    
    return { 
        timestamps, 
        loads, 
        resolution: detectResolution(timestamps),
        source: 'CSV',
        importDate: new Date().toISOString()
    };
}

function parseTimestamp(value) {
    if (!value) return new Date();
    
    // Unix timestamp
    if (/^\d{10,13}$/.test(value)) {
        return new Date(parseInt(value) * (value.length === 10 ? 1000 : 1));
    }
    
    return new Date(value);
}

function detectResolution(timestamps) {
    if (timestamps.length < 2) return 1;
    const diff = (timestamps[1] - timestamps[0]) / (1000 * 60);
    return Math.max(1, Math.round(diff));
}

function applyTimeFilter() {
    const startInput = document.getElementById('startDateDemand').value;
    const endInput = document.getElementById('endDateDemand').value;
    
    timeConfig.startDate = new Date(startInput);
    timeConfig.endDate = new Date(endInput);
    timeConfig.resolution = parseInt(document.getElementById('resolutionDemand').value);
    
    DemandCache._timeSeriesProcessed = null;
    
    if (currentViewDemand === 'chart') {
        renderDemand();
    }
    
    Utils.showNotification('Filtro temporal aplicado', 'info');
}







// ==================== ESTADÍSTICAS ====================

function calculateDemandSummary() {
    let summary = {
        total: 0, active: 0, inactive: 0,
        totalPd: 0, totalQd: 0,
        maxPd: 0, minPd: Infinity, avgPd: 0
    };
    
    // Estadísticas de cargas base
    if (dataDemand?.base?.load) {
        const loads = Object.values(dataDemand.base.load);
        summary.total = loads.length;
        
        loads.forEach(load => {
            const isActive = load.status === 1 || load.status === true;
            if (isActive) {
                summary.active++;
                summary.totalPd += load.pd || 0;
                summary.totalQd += load.qd || 0;
                if (load.pd > summary.maxPd) summary.maxPd = load.pd;
                if (load.pd < summary.minPd) summary.minPd = load.pd;
            } else {
                summary.inactive++;
            }
        });
        
        summary.avgPd = summary.active > 0 ? summary.totalPd / summary.active : 0;
        summary.minPd = summary.minPd === Infinity ? 0 : summary.minPd;
    }
    
    // Estadísticas de series temporales
    if (dataTimeSeries) {
        const filtered = filterTimeSeriesData();
        summary.timeSeries = {
            records: filtered.labels.length,
            series: Object.keys(filtered.loads).length,
            resolution: dataTimeSeries.resolution
        };
        
        // Calcular max/min de GENERACION si existe
        if (filtered.loads.GENERACION) {
            summary.maxGen = Math.max(...filtered.loads.GENERACION);
            summary.minGen = Math.min(...filtered.loads.GENERACION);
            summary.avgGen = filtered.loads.GENERACION.reduce((a, b) => a + b, 0) / filtered.loads.GENERACION.length;
        }
    }
    
    return summary;
}

function updateStatsDemand() {
    const statsDiv = document.getElementById('statsDemand');
    if (!statsDiv) return;
    
    const summary = calculateDemandSummary();
    
    let html = '';
    
    // Panel principal de series temporales si hay datos
    if (summary.timeSeries) {
        html += `
            <div class="stat-card" style="grid-column: span 3; background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3><i class="bi bi-graph-up-arrow"></i> Series Temporales SENI</h3>
                        <p style="font-size: 1.5rem; font-weight: bold;">${summary.timeSeries.records} registros</p>
                    </div>
                    <div style="text-align: right;">
                        <p>${summary.timeSeries.series} variables</p>
                        <p>Resolución: ${summary.timeSeries.resolution} min</p>
                    </div>
                </div>
            </div>
        `;
        
        if (summary.maxGen !== undefined) {
            html += `
                <div class="stat-card">
                    <h3><i class="bi bi-arrow-up-circle"></i> Gen. Máxima</h3>
                    <p style="color: #22c55e;">${summary.maxGen.toFixed(2)} MW</p>
                </div>
                <div class="stat-card">
                    <h3><i class="bi bi-arrow-down-circle"></i> Gen. Mínima</h3>
                    <p style="color: #ef4444;">${summary.minGen.toFixed(2)} MW</p>
                </div>
                <div class="stat-card">
                    <h3><i class="bi bi-dash-circle"></i> Gen. Promedio</h3>
                    <p style="color: #3b82f6;">${summary.avgGen.toFixed(2)} MW</p>
                </div>
            `;
        }
    }
    
    // Panel de cargas base
    if (summary.total > 0) {
        html += `
            <div class="stat-card" style="grid-column: span 2; background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); color: white;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3><i class="bi bi-lightning-charge-fill"></i> Demanda Base</h3>
                        <p style="font-size: 1.5rem; font-weight: bold;">${summary.totalPd.toFixed(2)} MW</p>
                    </div>
                    <div style="text-align: right;">
                        <p>Q: ${summary.totalQd.toFixed(2)} MVAr</p>
                        <p>Cargas: ${summary.active}/${summary.total}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Mensaje si no hay datos
    if (!summary.timeSeries && summary.total === 0) {
        html = `
            <div class="stat-card" style="grid-column: span 3; text-align: center;">
                <i class="bi bi-cloud-upload" style="font-size: 2rem; color: var(--text-muted);"></i>
                <h3>Sin datos de series temporales</h3>
                <p style="color: var(--text-muted);">Importa un archivo JSON o CSV para visualizar</p>
            </div>
        `;
    }
    
    statsDiv.innerHTML = html;
}

// ==================== OBTENER ITEMS ====================

function getCurrentLoadsDemand() {
    if (!dataDemand?.base?.load) return [];
    
    const entries = Object.entries(dataDemand.base.load);
    let items = entries.map(([key, value]) => ({ ...value, _key: key }));
    
    if (filterActiveOnlyDemand) {
        items = items.filter(item => item.status === 1 || item.status === true);
    }
    
    return items;
}

function getLoadDisplayName(item) {
    return item.name || item.chr_name || item.for_name || item._key;
}

// ==================== FILTRADO DE SERIES TEMPORALES ====================

function filterTimeSeriesData() {
    if (!dataTimeSeries) return { labels: [], loads: {} };
    
    const { timestamps, loads } = dataTimeSeries;
    const filteredLabels = [];
    const filteredLoads = {};
    
    Object.keys(loads).forEach(key => {
        filteredLoads[key] = [];
    });
    
    timestamps.forEach((ts, idx) => {
        const date = new Date(ts);
        if ((!timeConfig.startDate || date >= timeConfig.startDate) &&
            (!timeConfig.endDate || date <= timeConfig.endDate)) {
            filteredLabels.push(formatTimeLabel(date));
            Object.keys(loads).forEach(key => {
                filteredLoads[key].push(loads[key][idx]);
            });
        }
    });
    
    return { labels: filteredLabels, loads: filteredLoads };
}

function formatTimeLabel(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${day}/${month} ${hours}:${mins}`;
}

// ==================== RENDERIZADO ====================

function renderDemand() {
    updateStatsDemand();
    const items = getCurrentLoadsDemand();
    const content = document.getElementById('contentDemand');
    
    if (!content) return;
    
    // Mostrar/ocultar controles de tiempo
    const timeControls = document.getElementById('timeControlsDemand');
    timeControls.style.display = 'flex';
    
    switch (currentViewDemand) {
        case 'cards':
            content.innerHTML = renderCardsDemand(items);
            break;
        case 'table':
            content.innerHTML = renderTableDemand(items);
            break;
        case 'chart':
            content.innerHTML = renderChartsDemand(items);
            setTimeout(() => initDemandCharts(items), 100);
            break;
    }
}

function renderCardsDemand(items) {
    if (items.length === 0) {
        return `<div class="acrylic-card empty-state">
            <i class="bi bi-inbox"></i>
            <h3>No hay cargas ${filterActiveOnlyDemand ? 'activas' : ''}</h3>
            <p>Importa un archivo de datos o agrega cargas manualmente</p>
        </div>`;
    }
    
    return `<div class="cards-grid">${items.map((item, index) => {
        const isActive = item.status === 1 || item.status === true;
        const pd = item.pd || 0;
        const qd = item.qd || 0;
        const s = Math.sqrt(pd*pd + qd*qd);
        const fp = s > 0 ? (pd / s).toFixed(3) : '-';
        
        return `
        <div class="item-card">
            <div class="card-header">
                <div class="card-header-title">
                    <h3>${getLoadDisplayName(item)}</h3>
                    <span class="badge-fluent ${isActive ? 'badge-success' : 'badge-danger'}">
                        ${isActive ? '✓ Activo' : '✗ Inactivo'}
                    </span>
                </div>
                <p style="font-size: 0.75rem; color: var(--text-muted);">ID: ${item._key} | Bus: ${item.load_bus || '-'}</p>
            </div>
            <div class="card-info">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                    <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); padding: 12px; border-radius: 8px; text-align: center;">
                        <label style="font-size: 0.7rem; color: #1e40af;">P (MW)</label>
                        <span style="display: block; font-size: 1.2rem; font-weight: bold; color: #1e40af;">${pd.toFixed(2)}</span>
                    </div>
                    <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 12px; border-radius: 8px; text-align: center;">
                        <label style="font-size: 0.7rem; color: #92400e;">Q (MVAr)</label>
                        <span style="display: block; font-size: 1.2rem; font-weight: bold; color: #92400e;">${qd.toFixed(2)}</span>
                    </div>
                    <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); padding: 12px; border-radius: 8px; text-align: center;">
                        <label style="font-size: 0.7rem; color: #065f46;">FP</label>
                        <span style="display: block; font-size: 1.2rem; font-weight: bold; color: #065f46;">${fp}</span>
                    </div>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-fluent btn-primary" onclick="editLoadDemand('${item._key}')"><i class="bi bi-pencil"></i> Editar</button>
                <button class="btn-fluent btn-danger" onclick="deleteLoadDemand('${item._key}')"><i class="bi bi-trash"></i> Eliminar</button>
            </div>
        </div>`;
    }).join('')}</div>`;
}

function renderTableDemand(items) {
    if (items.length === 0) {
        return `<div class="acrylic-card empty-state"><h3>No hay cargas</h3></div>`;
    }
    
    return `<div class="acrylic-card"><div class="table-container"><table class="table-fluent">
        <thead><tr>
            <th>ID</th><th>Nombre</th><th>Estado</th><th>P (MW)</th><th>Q (MVAr)</th><th>FP</th><th>Bus</th><th>Acciones</th>
        </tr></thead>
        <tbody>${items.map(item => {
            const pd = item.pd || 0;
            const qd = item.qd || 0;
            const s = Math.sqrt(pd*pd + qd*qd);
            const fp = s > 0 ? (pd / s).toFixed(3) : '-';
            const isActive = item.status === 1 || item.status === true;
            
            return `<tr>
                <td><strong>${item._key}</strong></td>
                <td>${getLoadDisplayName(item)}</td>
                <td><span class="badge-fluent ${isActive ? 'badge-success' : 'badge-danger'}">${isActive ? 'Activo' : 'Inactivo'}</span></td>
                <td><strong>${pd.toFixed(2)}</strong></td>
                <td>${qd.toFixed(2)}</td>
                <td><strong>${fp}</strong></td>
                <td>${item.load_bus || '-'}</td>
                <td>
                    <button class="btn-fluent btn-primary" onclick="editLoadDemand('${item._key}')" style="padding: 6px 12px;"><i class="bi bi-pencil"></i></button>
                    <button class="btn-fluent btn-danger" onclick="deleteLoadDemand('${item._key}')" style="padding: 6px 12px;"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('')}
        </tbody></table></div></div>`;
}

// ==================== GRÁFICOS ====================

function renderChartsDemand(items) {
    const hasTimeSeries = dataTimeSeries && dataTimeSeries.timestamps.length > 0;
    
    return `
        <div class="charts-container">
            ${hasTimeSeries ? `
            <!-- Gráfico Principal de Series Temporales -->
            <div class="acrylic-card" style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                    <i class="bi bi-graph-up" style="color: #2563eb;"></i>
                    Curva de Generación/Demanda SENI
                </h3>
                <div style="height: 500px;">
                    <canvas id="demandTimeSeriesChart"></canvas>
                </div>
            </div>
            
            <!-- Comparativa de Variables -->
            <div class="acrylic-card" style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                    <i class="bi bi-bar-chart-line-fill" style="color: #7c3aed;"></i>
                    Comparativa: Generación vs Programada
                </h3>
                <div style="height: 400px;">
                    <canvas id="demandCompareChart"></canvas>
                </div>
            </div>
            ` : `
            <div class="acrylic-card" style="margin-bottom: 20px; text-align: center; padding: 60px;">
                <i class="bi bi-cloud-arrow-up" style="font-size: 4rem; color: var(--text-muted);"></i>
                <h3 style="margin-top: 20px;">Importa datos de series temporales</h3>
                <p style="color: var(--text-muted);">Usa el botón "Importar" para cargar un archivo JSON con el formato SENI</p>
                <p style="color: var(--text-muted); font-size: 0.85rem;">Formato: [{ "FECHA": "...", "GENERACION": ..., "PACTIVA": ..., "PREACTIVA": ... }]</p>
            </div>
            `}
            
            ${items.length > 0 ? `
            <!-- Distribución de Cargas Base -->
            <div class="acrylic-card" style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 20px;">
                    <i class="bi bi-pie-chart-fill" style="color: #f59e0b;"></i>
                    Distribución de Cargas Base
                </h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; height: 350px;">
                    <div><canvas id="demandPieChart"></canvas></div>
                    <div><canvas id="demandBarChart"></canvas></div>
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

function initDemandCharts(items) {
    // Destruir gráficos existentes
    Object.values(demandCharts).forEach(chart => {
        if (chart) chart.destroy();
    });
    demandCharts = {};
    
    // Gráfico de Series Temporales
    if (dataTimeSeries) {
        initTimeSeriesChart();
        initCompareChart();
    }
    
    // Gráficos de cargas base
    if (items.length > 0) {
        initPieChart(items);
        initBarChart(items);
    }
}

function initTimeSeriesChart() {
    const ctx = document.getElementById('demandTimeSeriesChart')?.getContext('2d');
    if (!ctx) return;
    
    const filtered = filterTimeSeriesData();
    const colors = {
        'GENERACION': { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)' },
        'PACTIVA': { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
        'PREACTIVA': { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }
    };
    
    const datasets = Object.keys(filtered.loads).map(key => ({
        label: key,
        data: filtered.loads[key],
        borderColor: colors[key]?.border || '#' + Math.floor(Math.random()*16777215).toString(16),
        backgroundColor: colors[key]?.bg || 'rgba(128,128,128,0.1)',
        fill: key === 'GENERACION',
        tension: 0.4,
        pointRadius: 0,
        borderWidth: key === 'GENERACION' ? 2 : 1.5
    }));
    
    demandCharts.timeSeries = new Chart(ctx, {
        type: 'line',
        data: { labels: filtered.labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: `Datos del ${timeConfig.startDate?.toLocaleDateString() || ''} al ${timeConfig.endDate?.toLocaleDateString() || ''}` }
            },
            scales: {
                x: { 
                    title: { display: true, text: 'Tiempo' },
                    ticks: { maxTicksLimit: 20 }
                },
                y: { 
                    title: { display: true, text: 'Potencia (MW)' },
                    beginAtZero: false
                }
            }
        }
    });
}

function initCompareChart() {
    const ctx = document.getElementById('demandCompareChart')?.getContext('2d');
    if (!ctx) return;
    
    const filtered = filterTimeSeriesData();
    
    if (!filtered.loads.GENERACION || !filtered.loads.PACTIVA) return;
    
    // Calcular diferencia
    const diff = filtered.loads.GENERACION.map((g, i) => g - (filtered.loads.PACTIVA[i] || 0));
    
    demandCharts.compare = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: filtered.labels,
            datasets: [{
                label: 'Diferencia (Gen - Programada)',
                data: diff,
                backgroundColor: diff.map(d => d >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                borderColor: diff.map(d => d >= 0 ? '#22c55e' : '#ef4444'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const idx = context.dataIndex;
                            return `Gen: ${filtered.loads.GENERACION[idx]?.toFixed(2)} MW\nProg: ${filtered.loads.PACTIVA[idx]?.toFixed(2)} MW`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { maxTicksLimit: 20 } },
                y: { title: { display: true, text: 'Diferencia (MW)' } }
            }
        }
    });
}

function initPieChart(items) {
    const ctx = document.getElementById('demandPieChart')?.getContext('2d');
    if (!ctx) return;
    
    const topLoads = items.sort((a, b) => (b.pd || 0) - (a.pd || 0)).slice(0, 8);
    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    
    demandCharts.pie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: topLoads.map(l => getLoadDisplayName(l)),
            datasets: [{
                data: topLoads.map(l => l.pd || 0),
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { size: 10 } } },
                title: { display: true, text: 'Top Cargas por P' }
            }
        }
    });
}

function initBarChart(items) {
    const ctx = document.getElementById('demandBarChart')?.getContext('2d');
    if (!ctx) return;
    
    const topLoads = items.sort((a, b) => (b.pd || 0) - (a.pd || 0)).slice(0, 10);
    
    demandCharts.bar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topLoads.map(l => getLoadDisplayName(l).substring(0, 10)),
            datasets: [
                { label: 'P (MW)', data: topLoads.map(l => l.pd || 0), backgroundColor: 'rgba(59, 130, 246, 0.8)' },
                { label: 'Q (MVAr)', data: topLoads.map(l => l.qd || 0), backgroundColor: 'rgba(245, 158, 11, 0.8)' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, title: { display: true, text: 'P vs Q por Carga' } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ==================== CRUD ====================

function editLoadDemand(key) {
    if (!dataDemand?.base?.load?.[key]) return;
    
    editingLoadDemand = { ...dataDemand.base.load[key] };
    editingKeyDemand = key;
    
    document.getElementById('modalTitleDemand').innerHTML = `<i class="bi bi-pencil"></i> Editar: ${getLoadDisplayName(editingLoadDemand)}`;
    document.getElementById('modalBodyDemand').innerHTML = generateFormHTMLDemand(editingLoadDemand);
    document.getElementById('modalDemand').classList.add('active');
}

function addNewLoadDemand() {
    const newKey = Utils.prompt('ID para la nueva carga:');
    if (!newKey) return;
    
    if (!dataDemand) dataDemand = { base: { load: {} } };
    if (!dataDemand.base) dataDemand.base = { load: {} };
    if (!dataDemand.base.load) dataDemand.base.load = {};
    
    if (dataDemand.base.load[newKey]) {
        Utils.showNotification('Ya existe ese ID', 'warning');
        return;
    }
    
    editingLoadDemand = { index: Object.keys(dataDemand.base.load).length + 1, name: '', status: 1, pd: 0, qd: 0, load_bus: 1 };
    editingKeyDemand = newKey;
    
    document.getElementById('modalTitleDemand').innerHTML = '<i class="bi bi-plus-circle"></i> Nueva Carga';
    document.getElementById('modalBodyDemand').innerHTML = generateFormHTMLDemand(editingLoadDemand);
    document.getElementById('modalDemand').classList.add('active');
}

function generateFormHTMLDemand(item) {
    return `<div id="propertiesContainerDemand">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 10px;">
            <div class="form-group" style="margin: 0;">
                <label class="form-label"><i class="bi bi-lightning-charge"></i> P (MW)</label>
                <input type="number" id="fieldDemand_pd" class="form-input" value="${item.pd || 0}" step="any" style="font-size: 1.2rem; font-weight: bold;">
            </div>
            <div class="form-group" style="margin: 0;">
                <label class="form-label"><i class="bi bi-arrow-repeat"></i> Q (MVAr)</label>
                <input type="number" id="fieldDemand_qd" class="form-input" value="${item.qd || 0}" step="any" style="font-size: 1.2rem; font-weight: bold;">
            </div>
        </div>
        <div class="form-group"><label class="form-label">Nombre</label><input type="text" id="fieldDemand_name" class="form-input" value="${item.name || ''}"></div>
        <div class="form-group"><label class="form-label">Estado</label><select id="fieldDemand_status" class="form-input"><option value="1" ${item.status === 1 ? 'selected' : ''}>Activo</option><option value="0" ${item.status === 0 ? 'selected' : ''}>Inactivo</option></select></div>
        <div class="form-group"><label class="form-label">Bus</label><input type="number" id="fieldDemand_load_bus" class="form-input" value="${item.load_bus || 1}"></div>
        <div class="form-group"><label class="form-label">Zona</label><input type="number" id="fieldDemand_zone" class="form-input" value="${item.zone || 1}"></div>
    </div>`;
}

function saveLoadDemand() {
    editingLoadDemand.pd = parseFloat(document.getElementById('fieldDemand_pd').value) || 0;
    editingLoadDemand.qd = parseFloat(document.getElementById('fieldDemand_qd').value) || 0;
    editingLoadDemand.name = document.getElementById('fieldDemand_name').value;
    editingLoadDemand.status = parseInt(document.getElementById('fieldDemand_status').value);
    editingLoadDemand.load_bus = parseInt(document.getElementById('fieldDemand_load_bus').value) || 1;
    editingLoadDemand.zone = parseInt(document.getElementById('fieldDemand_zone').value) || 1;
    
    dataDemand.base.load[editingKeyDemand] = editingLoadDemand;
    
    closeModalDemand();
    DemandCache.clear();
    renderDemand();
    Utils.showNotification('Carga guardada', 'success');
}

function deleteLoadDemand(key) {
    if (!Utils.confirm('¿Eliminar esta carga?')) return;
    delete dataDemand.base.load[key];
    DemandCache.clear();
    renderDemand();
    Utils.showNotification('Carga eliminada', 'success');
}

function closeModalDemand() {
    document.getElementById('modalDemand').classList.remove('active');
    editingLoadDemand = null;
    editingKeyDemand = null;
}

function exportDataDemand() {
    const exportData = {
        base: dataDemand?.base || {},
        timeSeries: dataTimeSeries || null,
        exportDate: new Date().toISOString()
    };
    Utils.downloadJSON(exportData, `demanda_SENI_${new Date().toISOString().split('T')[0]}.json`);
    Utils.showNotification('Datos exportados', 'success');
}

// Exportar funciones globalmente
window.editLoadDemand = editLoadDemand;
window.deleteLoadDemand = deleteLoadDemand;
window.addNewLoadDemand = addNewLoadDemand;
window.saveLoadDemand = saveLoadDemand;
window.closeModalDemand = closeModalDemand;
window.exportDataDemand = exportDataDemand;
window.renderDemand = renderDemand;
window.initDemand = initDemand;
window.loadDataFromFileDemand = loadDataFromFileDemand;