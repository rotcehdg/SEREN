// ==================== MÓDULO: GESTOR DE GENERADORAS ====================

let dataGen = null;
let currentPathGen = [];
let currentViewGen = 'cards';
let editingItemGen = null;
let editingPathGen = null;
let filterActiveOnly = true;
let flatViewLevel = null;   

// Variables para virtualización
let virtualListGen = null;
let isVirtualized = false;

const PROTECTED_PROPERTIES = ['Name', 'Code', 'Estado'];
const CHILD_PROPERTIES = ['Complejos_G2', 'Centrales_G3', 'Grupos_G4', 'Unidades_G5'];
const LEVEL_NAMES = ['Empresas', 'Complejos', 'Centrales', 'Grupos', 'Unidades'];
const LEVEL_ICONS = ['bi-building', 'bi-diagram-3', 'bi-lightning-charge', 'bi-gear', 'bi-cpu'];
const CARD_DISPLAY_PROPERTIES = ['Alias', 'Tecnologia', 'Tipo', 'Pmax', 'Pmin', 'Combustible'];
const MAX_CARD_PROPERTIES = 4;

document.addEventListener('DOMContentLoaded', function() {
    initGeneradoras();
});

function initGeneradoras() {
    setupEventListenersGen();
    loadDataFromFile();
}

function loadDataFromFile() {
    const contentDiv = document.getElementById('contentGen');
    contentDiv.innerHTML = `
        <div class="acrylic-card" style="text-align: center; padding: 60px;">
            <div class="spinner"></div>
            <h3 style="color: var(--text-secondary); margin-top: 20px;">Cargando datos de generadores...</h3>
        </div>
    `;

    fetch('data/datos-ejemplo.json')
        .then(response => {
            if (!response.ok) throw new Error('No se pudo cargar el archivo de datos');
            return response.json();
        })
        .then(data => {
            dataGen = data;
            renderGen();
            Utils.showNotification('Datos de generadores cargados', 'success');
        })
        .catch(error => {
            console.error('Error al cargar datos:', error);
            contentDiv.innerHTML = `
                <div class="acrylic-card empty-state">
                    <i class="bi bi-exclamation-triangle"></i>
                    <h3>No se pudieron cargar los datos</h3>
                    <p>${error.message}</p>
                    <button class="btn-fluent btn-primary" onclick="loadDataFromFile()">
                        <i class="bi bi-arrow-clockwise"></i> Reintentar
                    </button>
                </div>
            `;
        });
}

function setupEventListenersGen() {
    document.getElementById('addBtnGen').addEventListener('click', addNewItemGen);
    document.getElementById('exportBtnGen').addEventListener('click', exportDataGen);
    document.getElementById('importBtnGen').addEventListener('click', () => document.getElementById('fileInputGen').click());

    document.getElementById('fileInputGen').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            Utils.readJSONFile(file).then(data => {
                dataGen = data;
                currentPathGen = [];
                flatViewLevel = null;
                renderGen();
                Utils.showNotification('¡Datos importados correctamente!', 'success');
            }).catch(error => Utils.showNotification('Error al importar: ' + error.message, 'error'));
        }
    });

    document.querySelectorAll('#tab-Generadores .view-toggle button[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#tab-Generadores .view-toggle button[data-view]').forEach(b => b.classList.remove('active'));
            e.target.closest('button').classList.add('active');
            currentViewGen = e.target.closest('button').dataset.view;
            renderGen();
        });
    });

    document.getElementById('searchGen').addEventListener('input', Utils.debounce((e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#contentGen .item-card, #contentGen tbody tr').forEach(el => {
            el.style.display = el.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
    }, 200));

    document.getElementById('filterStateGen').addEventListener('change', (e) => {
        filterActiveOnly = e.target.checked;
        renderGen();
    });
}

// ==================== GESTIÓN DE ESQUEMA ====================

function getAllItemsAtLevel(level) {
    let items = [];
    if (level === 0) return dataGen?.Empresas_G1 || [];
    
    const traverse = (array, currentLevel, targetLevel) => {
        if (!array) return;
        if (currentLevel === targetLevel) {
            items = items.concat(array);
            return;
        }
        array.forEach(item => {
            const childKey = ['Complejos_G2', 'Centrales_G3', 'Grupos_G4', 'Unidades_G5'][currentLevel];
            if (item[childKey]) traverse(item[childKey], currentLevel + 1, targetLevel);
        });
    };
    
    traverse(dataGen?.Empresas_G1, 0, level);
    return items;
}

function getLevelSchema(level) {
    const items = getAllItemsAtLevel(level);
    if (items.length === 0) return { properties: {}, inconsistencies: [], nullCounts: {}, totalItems: 0 };
    
    const allProps = new Map();
    const nullCounts = {};
    
    items.forEach(item => {
        Object.keys(item).forEach(key => {
            if (CHILD_PROPERTIES.includes(key)) return;
            const val = item[key];
            
            if (!allProps.has(key)) {
                allProps.set(key, { type: Utils.getValueType(val), count: 0, nullCount: 0 });
            }
            
            const prop = allProps.get(key);
            prop.count++;
            
            if (val === null) prop.nullCount++;
            else if (prop.type === 'null') prop.type = Utils.getValueType(val);
        });
    });
    
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
    
    return { properties: Object.fromEntries(allProps), inconsistencies, nullCounts, totalItems: items.length };
}

function addPropertyToLevel(propertyName, propertyType, defaultValue) {
    const level = currentPathGen.length;
    const items = getAllItemsAtLevel(level);
    
    let value;
    switch (propertyType) {
        case 'number': value = defaultValue !== '' ? parseFloat(defaultValue) || 0 : 0; break;
        case 'boolean': value = defaultValue === 'true' || defaultValue === '1'; break;
        case 'null': value = null; break;
        default: value = defaultValue || '';
    }
    
    let count = 0;
    items.forEach(item => {
        if (!item.hasOwnProperty(propertyName)) {
            item[propertyName] = value;
            count++;
        }
    });
    return count;
}

function removePropertyFromLevel(propertyName) {
    const level = currentPathGen.length;
    const items = getAllItemsAtLevel(level);
    let count = 0;
    items.forEach(item => {
        if (item.hasOwnProperty(propertyName)) {
            delete item[propertyName];
            count++;
        }
    });
    return count;
}

function normalizeSchema() {
    const level = currentPathGen.length;
    const items = getAllItemsAtLevel(level);
    if (items.length === 0) return 0;
    
    const allProps = new Map();
    items.forEach(item => {
        Object.keys(item).forEach(key => {
            if (CHILD_PROPERTIES.includes(key)) return;
            const val = item[key];
            if (!allProps.has(key)) allProps.set(key, { type: null, default: null });
            if (val !== null && allProps.get(key).type === null) {
                const t = typeof val;
                allProps.get(key).type = t;
                allProps.get(key).default = t === 'boolean' ? false : t === 'number' ? 0 : '';
            }
        });
    });
    
    let fixes = 0;
    items.forEach(item => {
        allProps.forEach((info, key) => {
            if (!item.hasOwnProperty(key)) {
                item[key] = info.default !== null ? info.default : null;
                fixes++;
            }
        });
    });
    return fixes;
}

function openSchemaManager() {
    const level = flatViewLevel !== null ? flatViewLevel : currentPathGen.length;
    const levelName = LEVEL_NAMES[level];
    const schema = getLevelSchema(level);
    
    const modal = document.getElementById('modalGen');
    const modalTitle = document.getElementById('modalTitleGen');
    const modalBody = document.getElementById('modalBodyGen');
    
    modalTitle.innerHTML = `<i class="bi bi-diagram-3"></i> Esquema de ${levelName}`;
    
    let html = `
        <div style="margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 10px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="bi bi-info-circle" style="font-size: 1.5rem; color: #1976d2;"></i>
                <div>
                    <strong>Gestión de Esquema</strong>
                    <p style="margin: 4px 0 0; font-size: 0.85rem; color: #555;">
                        Los cambios se aplicarán a <strong>todos los ${schema.totalItems} ${levelName.toLowerCase()}</strong>.
                    </p>
                </div>
            </div>
        </div>
    `;
    
    if (schema.inconsistencies.length > 0) {
        html += `
            <div style="margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 10px; border-left: 4px solid #ff9800;">
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                    <i class="bi bi-exclamation-triangle" style="font-size: 1.5rem; color: #f57c00;"></i>
                    <div style="flex: 1;">
                        <strong style="color: #e65100;">Inconsistencias Detectadas</strong>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                            ${schema.inconsistencies.map(inc => `
                                <span style="background: white; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; border: 1px solid #ffcc80;">
                                    <strong>${inc.property}</strong>: ${inc.presentIn}/${inc.totalItems}
                                </span>
                            `).join('')}
                        </div>
                        <button class="btn-fluent btn-primary" onclick="handleNormalizeSchema()" style="margin-top: 12px;">
                            <i class="bi bi-magic"></i> Normalizar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    const sortedProps = Object.entries(schema.properties).sort((a, b) => {
        const aP = PROTECTED_PROPERTIES.includes(a[0]);
        const bP = PROTECTED_PROPERTIES.includes(b[0]);
        if (aP && !bP) return -1;
        if (!aP && bP) return 1;
        return a[0].localeCompare(b[0]);
    });
    
    html += `<div style="margin-bottom: 16px;"><h4 style="margin: 0 0 12px;"><i class="bi bi-list-check"></i> Propiedades (${sortedProps.length})</h4>
        <div style="border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; max-height: 250px; overflow-y: auto;">`;
    
    sortedProps.forEach(([key, info], idx) => {
        const isProtected = PROTECTED_PROPERTIES.includes(key);
        html += `
            <div style="display: flex; align-items: center; padding: 12px 16px; background: ${idx % 2 === 0 ? '#fafafa' : 'white'}; border-bottom: 1px solid rgba(0,0,0,0.05);">
                <div style="flex: 1;">
                    <span style="font-weight: 600;">${key}</span>
                    ${isProtected ? '<i class="bi bi-lock-fill" style="color: #999; margin-left: 6px; font-size: 0.75rem;"></i>' : ''}
                    <span style="margin-left: 8px; font-size: 0.75rem; color: #888; background: #eee; padding: 2px 8px; border-radius: 4px;">${info.type}</span>
                </div>
                ${!isProtected ? `<button class="btn-fluent btn-danger" onclick="handleRemovePropertyFromLevel('${key}')" style="padding: 6px 12px; font-size: 0.75rem;"><i class="bi bi-trash"></i></button>` : ''}
            </div>
        `;
    });
    
    html += `</div></div>
        <div style="padding: 20px; background: var(--bg-secondary); border-radius: 10px;">
            <h4 style="margin: 0 0 16px;"><i class="bi bi-plus-circle"></i> Agregar Propiedad</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group" style="margin: 0;">
                    <label class="form-label">Nombre</label>
                    <input type="text" id="schemaNewPropName" class="form-input" placeholder="Ej: Combustible">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label class="form-label">Tipo</label>
                    <select id="schemaNewPropType" class="form-input">
                        <option value="text">Texto</option>
                        <option value="number">Número</option>
                        <option value="boolean">Booleano</option>
                        <option value="null">Null</option>
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin: 12px 0 0;">
                <label class="form-label">Valor por Defecto</label>
                <input type="text" id="schemaNewPropDefault" class="form-input" placeholder="Valor inicial">
            </div>
            <button class="btn-fluent btn-success" onclick="handleAddPropertyToLevel()" style="margin-top: 16px; width: 100%;">
                <i class="bi bi-plus-lg"></i> Agregar a Todos
            </button>
        </div>
    `;
    
    modalBody.innerHTML = html;
    document.querySelector('#modalGen .modal-footer').innerHTML = `<button class="btn-fluent btn-secondary" onclick="closeModalGen()">Cerrar</button>`;
    modal.classList.add('active');
}

function handleAddPropertyToLevel() {
    const name = document.getElementById('schemaNewPropName').value.trim();
    const type = document.getElementById('schemaNewPropType').value;
    const defaultVal = document.getElementById('schemaNewPropDefault')?.value.trim() || '';
    
    if (!name) { Utils.showNotification('El nombre es requerido', 'error'); return; }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) { Utils.showNotification('Nombre inválido', 'error'); return; }
    
    const count = addPropertyToLevel(name, type, defaultVal);
    Utils.showNotification(`Propiedad "${name}" agregada a ${count} elementos`, 'success');
    openSchemaManager();
    renderGen();
}

function handleRemovePropertyFromLevel(propertyName) {
    const level = currentPathGen.length;
    if (Utils.confirm(`¿Eliminar "${propertyName}" de TODOS los ${LEVEL_NAMES[level].toLowerCase()}?`)) {
        const count = removePropertyFromLevel(propertyName);
        Utils.showNotification(`Propiedad eliminada de ${count} elementos`, 'success');
        openSchemaManager();
        renderGen();
    }
}

function handleNormalizeSchema() {
    const fixes = normalizeSchema();
    if (fixes > 0) {
        Utils.showNotification(`Esquema normalizado: ${fixes} propiedades agregadas`, 'success');
        openSchemaManager();
        renderGen();
    } else {
        Utils.showNotification('El esquema ya está normalizado', 'info');
    }
}

// ==================== ESTADÍSTICAS Y NAVEGACIÓN ====================

function calculateStatsGen() {
    let empresas = 0, complejos = 0, centrales = 0, grupos = 0, unidades = 0, potenciaTotal = 0;
    if (dataGen?.Empresas_G1) {
        const ef = filterByState(dataGen.Empresas_G1);
        empresas = ef.length;
        ef.forEach(emp => {
            if (emp.Complejos_G2) {
                const cf = filterByState(emp.Complejos_G2);
                complejos += cf.length;
                cf.forEach(comp => {
                    if (comp.Centrales_G3) {
                        const ctf = filterByState(comp.Centrales_G3);
                        centrales += ctf.length;
                        ctf.forEach(cent => {
                            potenciaTotal += cent.Pmax || 0;
                            if (cent.Grupos_G4) {
                                const gf = filterByState(cent.Grupos_G4);
                                grupos += gf.length;
                                gf.forEach(grp => {
                                    if (grp.Unidades_G5) unidades += filterByState(grp.Unidades_G5).length;
                                });
                            }
                        });
                    }
                });
            }
        });
    }
    return { empresas, complejos, centrales, grupos, unidades, potenciaTotal };
}

function calculateStatsGenAll() {
    let empresas = 0, complejos = 0, centrales = 0, grupos = 0, unidades = 0, potenciaTotal = 0;
    if (dataGen?.Empresas_G1) {
        const ef = dataGen.Empresas_G1;
        empresas = ef.length;
        ef.forEach(emp => {
            if (emp.Complejos_G2) {
                const cf = emp.Complejos_G2;
                complejos += cf.length;
                cf.forEach(comp => {
                    if (comp.Centrales_G3) {
                        const ctf = comp.Centrales_G3;
                        centrales += ctf.length;
                        ctf.forEach(cent => {
                            potenciaTotal += cent.Pmax || 0;
                            if (cent.Grupos_G4) {
                                const gf = cent.Grupos_G4;
                                grupos += gf.length;
                                gf.forEach(grp => {
                                    if (grp.Unidades_G5) unidades += grp.Unidades_G5.length;
                                });
                            }
                        });
                    }
                });
            }
        });
    }
    return { empresas, complejos, centrales, grupos, unidades, potenciaTotal };
}

function updateStatsGen() {
    const statsAll = calculateStatsGenAll();
    const stats = calculateStatsGen();
    
    document.getElementById('statsGen').innerHTML = `
        <div class="stat-card ${flatViewLevel === 0 ? 'active' : ''}" onclick="setFlatLevel(0)"><h3><i class="bi bi-building"></i> Empresas</h3><p>${stats.empresas}/${statsAll.empresas}</p></div>
        <div class="stat-card ${flatViewLevel === 1 ? 'active' : ''}" onclick="setFlatLevel(1)"><h3><i class="bi bi-diagram-3"></i> Complejos</h3><p>${stats.complejos}/${statsAll.complejos}</p></div>
        <div class="stat-card ${flatViewLevel === 2 ? 'active' : ''}" onclick="setFlatLevel(2)"><h3><i class="bi bi-lightning-charge"></i> Centrales</h3><p>${stats.centrales}/${statsAll.centrales}</p></div>
        <div class="stat-card ${flatViewLevel === 3 ? 'active' : ''}" onclick="setFlatLevel(3)"><h3><i class="bi bi-gear"></i> Grupos</h3><p>${stats.grupos}/${statsAll.grupos}</p></div>
        <div class="stat-card ${flatViewLevel === 4 ? 'active' : ''}" onclick="setFlatLevel(4)"><h3><i class="bi bi-cpu"></i> Unidades</h3><p>${stats.unidades}/${statsAll.unidades}</p></div>
        <div class="stat-card"><h3><i class="bi bi-lightning-charge-fill"></i> Capacidad Instalada</h3><p>${stats.potenciaTotal.toFixed(0)} MW</p></div>
    `;
}

function setFlatLevel(level) {
    flatViewLevel = level;
    currentPathGen = [];
    renderGen();
}

function updateBreadcrumbsGen() {
    const container = document.getElementById('breadcrumbsGen');
    const levels = ['G1 Empresa', 'G2 Complejo', 'G3 Central', 'G4 Grupo', 'G5 Unidad'];
    
    if (flatViewLevel !== null) {
        const items = getCurrentItemsGen();
        container.innerHTML = `
            <div class="breadcrumb-item">
                <button onclick="exitFlatView()"><i class="bi bi-house-fill"></i> Inicio</button>
            </div>
            <i class="bi bi-chevron-right" style="color: var(--text-muted);"></i>
            <div class="breadcrumb-item">
                <i class="bi ${LEVEL_ICONS[flatViewLevel]}"></i> Todos los ${LEVEL_NAMES[flatViewLevel]} (${items.length})
            </div>
        `;
        return;
    }
    
    let html = '<div class="breadcrumb-item"><button onclick="navigateToGen([])"><i class="bi bi-house-fill"></i> Inicio</button></div>';
    currentPathGen.forEach((item, index) => {
        html += '<i class="bi bi-chevron-right" style="color: var(--text-muted);"></i>';
        html += `<div class="breadcrumb-item"><button onclick="navigateToGen(${JSON.stringify(currentPathGen.slice(0, index + 1)).replace(/"/g, '&quot;')})">${levels[index]}: ${item.name}</button></div>`;
    });
    container.innerHTML = html;
}

function exitFlatView() {
    flatViewLevel = null;
    currentPathGen = [];
    renderGen();
}

function updateCurrentLevelIndicator() {
    const indicator = document.getElementById('currentLevelIndicatorGen');
    if (!indicator) return;
    
    const currentLevel = flatViewLevel !== null ? flatViewLevel : currentPathGen.length;
    
    if (currentLevel < LEVEL_NAMES.length) {
        indicator.innerHTML = `
            <button onclick="openSchemaManager()" style="background: rgba(0, 120, 212, 0.08); border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 8px; transition: all 0.2s; font-weight: 600; color: var(--primary-color);">
                <i class="bi ${LEVEL_ICONS[currentLevel]}"></i> ${LEVEL_NAMES[currentLevel]}
                ${flatViewLevel !== null ? '<span class="badge-primary" style="font-size: 0.7rem; padding: 4px 8px;">VISTA PLANA</span>' : ''}
                <i class="bi bi-gear" style="margin-left: 4px;"></i>
            </button>
        `;
    } else {
        indicator.innerHTML = '';
    }
}

// ==================== OBTENER ITEMS ====================

function filterByState(items) {
    return filterActiveOnly ? items.filter(item => item.Estado !== false) : items;
}

function getCurrentItemsGen() {
    if (flatViewLevel !== null) return filterByState(getAllItemsAtLevel(flatViewLevel));
    
    let items = [];
    if (currentPathGen.length === 0) {
        items = dataGen?.Empresas_G1 || [];
    } else {
        let current = dataGen.Empresas_G1;
        for (let i = 0; i < currentPathGen.length; i++) {
            const item = current.find(el => el.Code === currentPathGen[i].code);
            if (!item) return [];
            const childKey = ['Complejos_G2', 'Centrales_G3', 'Grupos_G4', 'Unidades_G5'][i];
            if (i === currentPathGen.length - 1) {
                items = item[childKey] || [];
                break;
            }
            current = item[childKey] || [];
        }
    }
    return filterByState(items);
}

// ==================== RENDERIZADO ====================

function toggleCardExpand(index) {
    const hiddenDiv = document.getElementById(`hiddenProps-${index}`);
    const label = document.getElementById(`expandLabel-${index}`);
    if (!hiddenDiv || !label) return;
    
    const isExpanded = hiddenDiv.style.display !== 'none';
    hiddenDiv.style.display = isExpanded ? 'none' : 'block';
    label.innerHTML = isExpanded 
        ? `<i class="bi bi-chevron-down"></i> +${hiddenDiv.querySelectorAll('.info-item').length} más`
        : `<i class="bi bi-chevron-up"></i> Ver menos`;
}

function renderCardsGen(items) {
    if (items.length === 0) {
        return `<div class="acrylic-card empty-state">
            <i class="bi bi-inbox"></i>
            <h3>No hay elementos</h3>
            <p>Comienza agregando un nuevo elemento</p>
            <button class="btn-fluent btn-primary" onclick="addNewItemGen()"><i class="bi bi-plus-circle"></i> Agregar</button>
        </div>`;
    }
    
    return `<div class="cards-grid">${items.map((item, index) => {
        const excludeKeys = ['Name', 'Code', 'Estado', ...CHILD_PROPERTIES];
        const allProps = Object.keys(item).filter(k => !excludeKeys.includes(k) && (typeof item[k] !== 'object' || item[k] === null));
        const priorityProps = CARD_DISPLAY_PROPERTIES.filter(p => allProps.includes(p));
        const otherProps = allProps.filter(p => !CARD_DISPLAY_PROPERTIES.includes(p));
        const orderedProps = [...priorityProps, ...otherProps];
        const propsToShow = orderedProps.slice(0, MAX_CARD_PROPERTIES);
        const hiddenProps = orderedProps.slice(MAX_CARD_PROPERTIES);
        
        const childCounts = [];
        if (item.Complejos_G2?.length) childCounts.push(`${filterByState(item.Complejos_G2).length} Complejos`);
        if (item.Centrales_G3?.length) childCounts.push(`${filterByState(item.Centrales_G3).length} Centrales`);
        if (item.Grupos_G4?.length) childCounts.push(`${filterByState(item.Grupos_G4).length} Grupos`);
        if (item.Unidades_G5?.length) childCounts.push(`${filterByState(item.Unidades_G5).length} Unidades`);
        
        return `
        <div class="item-card" onclick="handleCardClickGen('${item.Code}', ${index})">
            <div class="card-header">
                <div class="card-header-title">
                    <h3>${item.Name}</h3>
                    <span class="badge-fluent ${item.Estado !== false ? 'badge-success' : 'badge-danger'}">
                        ${item.Estado !== false ? '✓ Activo' : '✗ Inactivo'}
                    </span>
                </div>
                <p style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${item.Code}</p>
            </div>
            <div class="card-info">
                <div class="card-props-main">
                    ${propsToShow.map(key => `<div class="info-item"><label>${key}</label><span>${Utils.formatValue(item[key])}</span></div>`).join('')}
                </div>
                ${hiddenProps.length > 0 ? `
                    <div class="card-props-hidden" id="hiddenProps-${index}" style="display: none;">
                        <div class="card-props-main">${hiddenProps.map(key => `<div class="info-item"><label>${key}</label><span>${Utils.formatValue(item[key])}</span></div>`).join('')}</div>
                    </div>
                    <div class="expand-trigger" onclick="event.stopPropagation(); toggleCardExpand(${index})">
                        <span id="expandLabel-${index}"><i class="bi bi-chevron-down"></i> +${hiddenProps.length} más</span>
                    </div>
                ` : ''}
                ${childCounts.length ? `<div class="info-item" style="grid-column: span 2;"><label>Elementos</label><span>${childCounts.join(', ')}</span></div>` : ''}
            </div>
            <div class="card-actions">
                <button class="btn-fluent btn-primary" onclick="event.stopPropagation(); editItemGen(${index})"><i class="bi bi-pencil"></i> Editar</button>
                <button class="btn-fluent btn-danger" onclick="event.stopPropagation(); deleteItemGen(${index})"><i class="bi bi-trash"></i> Eliminar</button>
            </div>
        </div>`;
    }).join('')}</div>`;
}

function renderVirtualCardsGen(items) {
    const containerId = 'virtualCardsContainerGen';
    
    return `
        <div id="${containerId}" style="height: 600px; overflow-y: auto; border-radius: var(--border-radius); border: 1px solid var(--border-color);">
            <!-- VirtualList se inicializará después -->
        </div>
    `;
}

function initVirtualListGen(items) {
    const container = document.getElementById('virtualCardsContainerGen');
    if (!container || items.length <= 50) return;
    
    virtualListGen = new VirtualList(container, {
        items: items,
        itemHeight: 320, // Altura aproximada de una tarjeta
        renderItem: (item, index) => {
            return renderSingleCardGen(item, index);
        }
    });
    
    isVirtualized = true;
}

function renderSingleCardGen(item, index) {
    const excludeKeys = ['Name', 'Code', 'Estado', ...CHILD_PROPERTIES];
    const allProps = Object.keys(item).filter(k => !excludeKeys.includes(k) && (typeof item[k] !== 'object' || item[k] === null));
    const priorityProps = CARD_DISPLAY_PROPERTIES.filter(p => allProps.includes(p));
    const otherProps = allProps.filter(p => !CARD_DISPLAY_PROPERTIES.includes(p));
    const orderedProps = [...priorityProps, ...otherProps];
    const propsToShow = orderedProps.slice(0, MAX_CARD_PROPERTIES);
    const hiddenProps = orderedProps.slice(MAX_CARD_PROPERTIES);
    
    const childCounts = [];
    if (item.Complejos_G2?.length) childCounts.push(`${filterByState(item.Complejos_G2).length} Complejos`);
    if (item.Centrales_G3?.length) childCounts.push(`${filterByState(item.Centrales_G3).length} Centrales`);
    if (item.Grupos_G4?.length) childCounts.push(`${filterByState(item.Grupos_G4).length} Grupos`);
    if (item.Unidades_G5?.length) childCounts.push(`${filterByState(item.Unidades_G5).length} Unidades`);
    
    // Usar un ID único basado en Code para evitar conflictos en virtualización
    const uniqueId = `card-${item.Code}-${index}`;
    
    return `
    <div class="item-card virtual-item" data-index="${index}" data-code="${item.Code}">
        <div class="card-header">
            <div class="card-header-title">
                <h3>${item.Name}</h3>
                <span class="badge-fluent ${item.Estado !== false ? 'badge-success' : 'badge-danger'}">
                    ${item.Estado !== false ? '✓ Activo' : '✗ Inactivo'}
                </span>
            </div>
            <p style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${item.Code}</p>
        </div>
        <div class="card-info">
            <div class="card-props-main">
                ${propsToShow.map(key => `<div class="info-item"><label>${key}</label><span>${Utils.formatValue(item[key])}</span></div>`).join('')}
            </div>
            ${hiddenProps.length > 0 ? `
                <div class="card-props-hidden" id="hiddenProps-${uniqueId}" style="display: none;">
                    <div class="card-props-main">${hiddenProps.map(key => `<div class="info-item"><label>${key}</label><span>${Utils.formatValue(item[key])}</span></div>`).join('')}</div>
                </div>
                <div class="expand-trigger" onclick="event.stopPropagation(); handleToggleExpand('${uniqueId}')">
                    <span id="expandLabel-${uniqueId}"><i class="bi bi-chevron-down"></i> +${hiddenProps.length} más</span>
                </div>
            ` : ''}
            ${childCounts.length ? `<div class="info-item" style="grid-column: span 2;"><label>Elementos</label><span>${childCounts.join(', ')}</span></div>` : ''}
        </div>
        <div class="card-actions">
            <button class="btn-fluent btn-primary" onclick="event.stopPropagation(); handleEditClick('${item.Code}', ${index})"><i class="bi bi-pencil"></i> Editar</button>
            <button class="btn-fluent btn-danger" onclick="event.stopPropagation(); handleDeleteClick('${item.Code}', ${index})"><i class="bi bi-trash"></i> Eliminar</button>
        </div>
    </div>`;
}

// Funciones auxiliares para manejar eventos en tarjetas virtualizadas
function handleToggleExpand(uniqueId) {
    const hiddenDiv = document.getElementById(`hiddenProps-${uniqueId}`);
    const label = document.getElementById(`expandLabel-${uniqueId}`);
    if (!hiddenDiv || !label) return;
    
    const isExpanded = hiddenDiv.style.display !== 'none';
    hiddenDiv.style.display = isExpanded ? 'none' : 'block';
    label.innerHTML = isExpanded 
        ? `<i class="bi bi-chevron-down"></i> +${hiddenDiv.querySelectorAll('.info-item').length} más`
        : `<i class="bi bi-chevron-up"></i> Ver menos`;
}

function handleEditClick(code, index) {
    if (flatViewLevel !== null) {
        // En modo vista plana, buscar el elemento por código
        const items = getAllItemsAtLevel(flatViewLevel);
        const itemIndex = items.findIndex(item => item.Code === code);
        if (itemIndex !== -1) {
            editItemGen(itemIndex);
        }
    } else {
        // En modo jerárquico normal
        editItemGen(index);
    }
}

function handleDeleteClick(code, index) {
    if (flatViewLevel !== null) {
        // En modo vista plana
        deleteItemFromHierarchy(code, flatViewLevel);
        renderGen();
    } else {
        // En modo jerárquico normal
        deleteItemGen(index);
    }
}

function renderTableGen(items) {
    if (items.length === 0) return `<div class="acrylic-card empty-state"><h3>No hay elementos</h3></div>`;
    const fields = Object.keys(items[0]).filter(k => !CHILD_PROPERTIES.includes(k) && (typeof items[0][k] !== 'object' || items[0][k] === null));
    return `<div class="acrylic-card"><div class="table-container"><table class="table-fluent">
        <thead><tr>${fields.map(f => `<th>${f}</th>`).join('')}<th>Acciones</th></tr></thead>
        <tbody>${items.map((item, index) => `
            <tr onclick="handleCardClickGen('${item.Code}', ${index})">
                ${fields.map(f => `<td>${Utils.formatValue(item[f])}</td>`).join('')}
                <td>
                    <button class="btn-fluent btn-primary" onclick="event.stopPropagation(); editItemGen(${index})" style="padding: 6px 12px;"><i class="bi bi-pencil"></i></button>
                    <button class="btn-fluent btn-danger" onclick="event.stopPropagation(); deleteItemGen(${index})" style="padding: 6px 12px;"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`).join('')}
        </tbody></table></div></div>`;
}

// ==================== CRUD ====================

function handleCardClickGen(code, index) {
    if (flatViewLevel !== null) return;
    const items = getCurrentItemsGen();
    const item = items[index];
    if (item.Complejos_G2 || item.Centrales_G3 || item.Grupos_G4 || item.Unidades_G5) {
        navigateToGen([...currentPathGen, { name: item.Name, code: item.Code }]);
    }
}

function navigateToGen(path) {
    flatViewLevel = null;
    currentPathGen = path;
    renderGen();
}

function generateFormHTML(item) {
    let html = `<div id="propertiesContainer">`;
    for (let key in item) {
        if (CHILD_PROPERTIES.includes(key) || (typeof item[key] === 'object' && item[key] !== null)) continue;
        
        const value = item[key];
        const isProtected = PROTECTED_PROPERTIES.includes(key);
        const isNull = value === null;
        const inputType = typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text';

        if (inputType === 'checkbox' && !isNull) {
            html += `
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="field_${key}" data-type="boolean" class="form-checkbox" ${value ? 'checked' : ''}>
                        <span class="form-label" style="margin: 0;">${key}</span>
                        ${isProtected ? '<i class="bi bi-lock-fill" style="color: var(--text-muted);"></i>' : ''}
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
                        <input type="${inputType}" id="field_${key}" class="form-input" 
                            data-type="${Utils.getValueType(value)}" value="${isNull ? '' : (value ?? '')}" 
                            ${isNull ? 'disabled' : ''} step="any">
                        ${!isProtected ? `
                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.8rem;">
                                <input type="checkbox" id="null_${key}" ${isNull ? 'checked' : ''} onchange="toggleNullField('${key}', this.checked)">
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

function toggleNullField(key, isNull) {
    const input = document.getElementById(`field_${key}`);
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

function editItemGen(index) {
    const items = getCurrentItemsGen();
    editingItemGen = items[index];
    editingPathGen = index;

    document.getElementById('modalTitleGen').innerHTML = `<i class="bi bi-pencil"></i> Editar: ${editingItemGen.Name}`;
    document.getElementById('modalBodyGen').innerHTML = generateFormHTML(editingItemGen);
    document.querySelector('#modalGen .modal-footer').innerHTML = `
        <button class="btn-fluent btn-secondary" onclick="closeModalGen()">Cancelar</button>
        <button class="btn-fluent btn-success" onclick="saveItemGen()"><i class="bi bi-check-circle"></i> Guardar</button>
    `;
    document.getElementById('modalGen').classList.add('active');
}

function addNewItemGen() {
    if (flatViewLevel !== null) {
        Utils.showNotification('Para agregar, usa navegación jerárquica', 'warning');
        return;
    }
    
    const level = currentPathGen.length;
    const schema = getLevelSchema(level);
    const template = { Name: '', Code: '', Estado: true };
    
    Object.entries(schema.properties).forEach(([key, info]) => {
        if (!template.hasOwnProperty(key)) {
            template[key] = info.type === 'boolean' ? false : info.type === 'number' ? 0 : '';
        }
    });
    
    if (level < 4) template[['Complejos_G2', 'Centrales_G3', 'Grupos_G4', 'Unidades_G5'][level]] = [];
    
    editingItemGen = template;
    editingPathGen = -1;

    document.getElementById('modalTitleGen').innerHTML = '<i class="bi bi-plus-circle"></i> Agregar Nuevo';
    document.getElementById('modalBodyGen').innerHTML = generateFormHTML(editingItemGen);
    document.querySelector('#modalGen .modal-footer').innerHTML = `
        <button class="btn-fluent btn-secondary" onclick="closeModalGen()">Cancelar</button>
        <button class="btn-fluent btn-success" onclick="saveItemGen()"><i class="bi bi-check-circle"></i> Guardar</button>
    `;
    document.getElementById('modalGen').classList.add('active');
}

function saveItemGen() {
    const container = document.getElementById('propertiesContainer');
    container.querySelectorAll('input:not([id^="null_"])').forEach(input => {
        const key = input.id.replace('field_', '');
        const nullCb = document.getElementById(`null_${key}`);
        
        if (nullCb?.checked) editingItemGen[key] = null;
        else if (input.type === 'checkbox') editingItemGen[key] = input.checked;
        else if (input.dataset.type === 'number') editingItemGen[key] = input.value === '' ? null : parseFloat(input.value) || 0;
        else editingItemGen[key] = input.value;
    });

    if (editingPathGen === -1) {
        let targetArray = dataGen.Empresas_G1;
        if (currentPathGen.length > 0) {
            let current = dataGen.Empresas_G1;
            for (let i = 0; i < currentPathGen.length; i++) {
                const item = current.find(el => el.Code === currentPathGen[i].code);
                const childKey = ['Complejos_G2', 'Centrales_G3', 'Grupos_G4', 'Unidades_G5'][i];
                if (i === currentPathGen.length - 1) targetArray = item[childKey];
                else current = item[childKey] || [];
            }
        }
        targetArray.push(editingItemGen);
        Utils.showNotification('Elemento agregado', 'success');
    } else {
        Utils.showNotification('Elemento actualizado', 'success');
    }

    closeModalGen();
    renderGen();
}

function deleteItemGen(index) {
    if (!Utils.confirm('¿Eliminar este elemento?')) return;
    
    const items = getCurrentItemsGen();
    const itemToDelete = items[index];
    
    if (flatViewLevel !== null) {
        deleteItemFromHierarchy(itemToDelete.Code, flatViewLevel);
    } else {
        const realArray = getRealCurrentArray();
        const realIndex = realArray.findIndex(i => i.Code === itemToDelete.Code);
        if (realIndex !== -1) realArray.splice(realIndex, 1);
    }
    
    renderGen();
    Utils.showNotification('Elemento eliminado', 'success');
}

function getRealCurrentArray() {
    if (currentPathGen.length === 0) return dataGen.Empresas_G1;
    
    let current = dataGen.Empresas_G1;
    for (let i = 0; i < currentPathGen.length; i++) {
        const item = current.find(el => el.Code === currentPathGen[i].code);
        const childKey = ['Complejos_G2', 'Centrales_G3', 'Grupos_G4', 'Unidades_G5'][i];
        if (i === currentPathGen.length - 1) return item[childKey];
        current = item[childKey] || [];
    }
    return [];
}

function deleteItemFromHierarchy(code, level) {
    const childKeys = ['Complejos_G2', 'Centrales_G3', 'Grupos_G4', 'Unidades_G5'];
    
    const searchAndDelete = (array, currentLevel, targetLevel) => {
        if (currentLevel === targetLevel) {
            const idx = array.findIndex(item => item.Code === code);
            if (idx !== -1) { array.splice(idx, 1); return true; }
            return false;
        }
        for (const item of array) {
            if (item[childKeys[currentLevel]] && searchAndDelete(item[childKeys[currentLevel]], currentLevel + 1, targetLevel)) return true;
        }
        return false;
    };
    
    if (level === 0) {
        const idx = dataGen.Empresas_G1.findIndex(item => item.Code === code);
        if (idx !== -1) { dataGen.Empresas_G1.splice(idx, 1); return true; }
        return false;
    }
    return searchAndDelete(dataGen.Empresas_G1, 0, level);
}

function closeModalGen() {
    document.getElementById('modalGen').classList.remove('active');
    editingItemGen = null;
    editingPathGen = null;
}

function exportDataGen() {
    Utils.downloadJSON(dataGen, 'generadores_' + new Date().toISOString().split('T')[0] + '.json');
    Utils.showNotification('Datos exportados', 'success');
}

function renderGen() {
    updateStatsGen();
    updateBreadcrumbsGen();
    updateCurrentLevelIndicator();
    const items = getCurrentItemsGen();
    const content = document.getElementById('contentGen');
    
    if (!content) return;
    
    content.innerHTML = currentViewGen === 'table' ? renderTableGen(items) : renderCardsGen(items);
    
    // Inicializar virtualización después de renderizar
    if (currentViewGen === 'cards' && items.length > 50) {
        setTimeout(() => initVirtualListGen(items), 100);
    } else {
        isVirtualized = false;
        virtualListGen = null;
    }
}
