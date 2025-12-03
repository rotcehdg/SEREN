// ==================== SISTEMA INTEGRADO SENI - APP.JS ====================
// Funciones globales, sistema de tabs y utilidades

// Cache para operaciones costosas
const AppCache = {
    _cache: new Map(),
    
    set: function(key, value, ttl = 300000) { // 5 minutos por defecto
        const item = {
            value,
            expiry: Date.now() + ttl
        };
        this._cache.set(key, item);
        return value;
    },
    
    get: function(key) {
        const item = this._cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expiry) {
            this._cache.delete(key);
            return null;
        }
        
        return item.value;
    },
    
    clear: function(key) {
        if (key) this._cache.delete(key);
        else this._cache.clear();
    }
};

// Sistema de memoización
function memoize(fn, resolver) {
    const cache = new Map();
    
    return function(...args) {
        const key = resolver ? resolver(...args) : JSON.stringify(args);
        
        if (cache.has(key)) {
            return cache.get(key);
        }
        
        const result = fn.apply(this, args);
        cache.set(key, result);
        return result;
    };
}

document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initModals();
    initPerformanceMonitoring();
});

/**
 * Inicializa el sistema de tabs principales
 */
function initTabs() {
    const tabs = document.querySelectorAll('.main-tab');
    
    tabs.forEach(tab => {
        // Usar event delegation
        tab.addEventListener('click', () => {
            // Usar requestAnimationFrame para animaciones suaves
            requestAnimationFrame(() => {
                // Remover clase active de todos los tabs y contenidos
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content-main').forEach(c => c.classList.remove('active'));
                
                // Activar el tab seleccionado
                tab.classList.add('active');
                const targetTab = document.getElementById(`tab-${tab.dataset.tab}`);
                if (targetTab) {
                    targetTab.classList.add('active');
                    
                    // Lazy load del contenido de la pestaña
                    loadTabContent(tab.dataset.tab);
                }
            });
        });
    });
}

/**
 * Carga perezosa del contenido de pestañas
 */
function loadTabContent(tabName) {
    const tabContent = document.getElementById(`tab-${tabName}`);
    
    // Verificar si ya está cargado
    if (tabContent.dataset.loaded === 'true') return;
    
    // Simular carga diferida de módulos pesados
    switch(tabName) {
        case 'Generadores':
            if (typeof renderGen === 'function') {
                setTimeout(() => renderGen(), 50);
            }
            break;
        case 'red':
            if (typeof renderNet === 'function') {
                setTimeout(() => renderNet(), 50);
            }
            break;
        case 'demanda':
            if (typeof renderDemand === 'function') {
                setTimeout(() => renderDemand(), 50);
            }
            break;
    }
    
    tabContent.dataset.loaded = 'true';
}

/**
 * Inicializa monitoreo de performance
 */
function initPerformanceMonitoring() {
    // Solo en desarrollo
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Performance monitoring activado');
        
        // Medir tiempo de carga de módulos
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfEntries = performance.getEntriesByType('navigation');
                if (perfEntries.length > 0) {
                    const navEntry = perfEntries[0];
                    console.log(`Tiempo de carga: ${navEntry.loadEventEnd - navEntry.startTime}ms`);
                }
            }, 0);
        });
    }
}

/**
 * Inicializa los event listeners de los modales
 */
function initModals() {
    // Cerrar modales con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (typeof closeModalGen === 'function') closeModalGen();
            if (typeof closeModalNet === 'function') closeModalNet();
            if (typeof closeModalDemand === 'function') closeModalDemand();
        }
    });

    // Cerrar modal al hacer clic en el overlay
    ['modalGen', 'modalNet', 'modalDemand'].forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    const closeFn = {
                        'modalGen': closeModalGen,
                        'modalNet': closeModalNet,
                        'modalDemand': closeModalDemand
                    }[modalId];
                    if (typeof closeFn === 'function') closeFn();
                }
            });
        }
    });
}

/**
 * Utilidades globales
 */
const Utils = {
    /**
     * Formatea un valor para mostrar en tablas/cards
     */
    formatValue: function(val) {
        if (val === null) {
            return '<span class="null-value">null</span>';
        }
        if (val === undefined) return '<span style="color: #bdbdbd;">—</span>';
        if (typeof val === 'boolean') {
            return val 
                ? '<span style="color: #107c10;">✓ Sí</span>' 
                : '<span style="color: #c42b1c;">✗ No</span>';
        }
        if (typeof val === 'number') return val.toLocaleString('es-DO', { maximumFractionDigits: 4 });
        if (Array.isArray(val)) return `[${val.join(', ')}]`;
        if (typeof val === 'object') return '[Object]';
        if (val === '') return '<span style="color: #bdbdbd; font-style: italic;">vacío</span>';
        return val;
    },

    /**
     * Formatea un valor para texto plano
     */
    formatValuePlain: function(val) {
        if (val === null) return 'null';
        if (val === undefined) return '—';
        if (typeof val === 'boolean') return val ? '✓ Sí' : '✗ No';
        if (typeof val === 'number') return val.toLocaleString('es-DO', { maximumFractionDigits: 4 });
        if (Array.isArray(val)) return `[${val.join(', ')}]`;
        if (typeof val === 'object') return '[Object]';
        if (val === '') return 'vacío';
        return val;
    },

    /**
     * Determina el tipo de un valor
     */
    getValueType: function(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    },

    /**
     * Descarga un objeto JSON como archivo
     */
    downloadJSON: function(data, filename) {
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'data_' + new Date().toISOString().split('T')[0] + '.json';
        link.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Lee un archivo JSON y devuelve una promesa con los datos
     */
    readJSONFile: function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    resolve(data);
                } catch (error) {
                    reject(new Error('Error al parsear JSON: ' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('Error al leer el archivo'));
            reader.readAsText(file);
        });
    },

    /**
     * Muestra una notificación temporal
     */
    showNotification: function(message, type = 'info') {
        const colors = {
            success: 'linear-gradient(135deg, #107c10 0%, #0e6b0e 100%)',
            error: 'linear-gradient(135deg, #c42b1c 0%, #a72315 100%)',
            warning: 'linear-gradient(135deg, #ffb900 0%, #ff8c00 100%)',
            info: 'linear-gradient(135deg, #0078d4 0%, #106ebe 100%)'
        };

        const icons = {
            success: 'bi-check-circle-fill',
            error: 'bi-x-circle-fill',
            warning: 'bi-exclamation-triangle-fill',
            info: 'bi-info-circle-fill'
        };

        // Remover notificaciones anteriores
        document.querySelectorAll('.notification-toast').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = 'notification-toast';
        notification.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            z-index: 10001;
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 500;
        `;
        notification.innerHTML = `
            <i class="bi ${icons[type] || icons.info}" style="font-size: 1.25rem;"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out forwards';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    /**
     * Confirma una acción con el usuario
     */
    confirm: function(message) {
        return window.confirm(message);
    },

    /**
     * Solicita un input del usuario
     */
    prompt: function(message, defaultValue = '') {
        return window.prompt(message, defaultValue);
    },

    /**
     * Genera un ID único
     */
    generateId: function() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * Formatea una fecha
     */
    formatDate: function(date) {
        if (!date) return '—';
        const d = new Date(date);
        return d.toLocaleDateString('es-DO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Debounce function
     */
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// Hacer Utils disponible globalmente
window.Utils = Utils;
window.AppCache = AppCache;