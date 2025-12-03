// Web Worker para cálculos pesados
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch(type) {
        case 'CALCULATE_STATS':
            const stats = calculateStats(data);
            self.postMessage({ type: 'STATS_RESULT', data: stats });
            break;
            
        case 'FILTER_DATA':
            const filtered = filterData(data.items, data.filters);
            self.postMessage({ type: 'FILTER_RESULT', data: filtered });
            break;
            
        case 'PROCESS_BATCH':
            const processed = processBatch(data);
            self.postMessage({ type: 'BATCH_RESULT', data: processed });
            break;
    }
};

function calculateStats(data) {
    // Cálculos complejos aquí
    const startTime = performance.now();
    
    // Ejemplo: calcular totales
    const totals = {
        count: data.length,
        active: data.filter(item => item.Estado === true).length,
        power: data.reduce((sum, item) => sum + (item.Pmax || 0), 0)
    };
    
    const endTime = performance.now();
    totals.calculationTime = endTime - startTime;
    
    return totals;
}

function filterData(items, filters) {
    return items.filter(item => {
        return Object.entries(filters).every(([key, value]) => {
            if (!value) return true;
            
            const itemValue = item[key];
            if (typeof value === 'string') {
                return itemValue?.toString().toLowerCase().includes(value.toLowerCase());
            }
            
            return itemValue === value;
        });
    });
}

function processBatch(batchData) {
    // Procesamiento por lotes
    return batchData.map(item => ({
        ...item,
        processed: true,
        timestamp: Date.now()
    }));
}