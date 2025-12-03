// ==================== MÓDULO: GRÁFICOS AVANZADOS DE DEMANDA (ECharts) ====================
// Este archivo complementa demanda.js con gráficos avanzados estilo graficas.html

let echartsInstances = {};

// Inicializar gráficos avanzados con ECharts
function initAdvancedDemandCharts(items) {
    // Destruir instancias existentes
    Object.values(echartsInstances).forEach(chart => {
        if (chart) chart.dispose();
    });
    echartsInstances = {};
    
    // Solo inicializar si ECharts está disponible
    if (typeof echarts === 'undefined') {
        console.warn('ECharts no está cargado. Usando Chart.js como fallback.');
        return;
    }
    
    initDemandStackedAreaChart(items);
    initDemandComparisonChart(items);
    initDemandHeatmapChart(items);
}

// Gráfico de Área Apilada - Demanda por Carga
function initDemandStackedAreaChart(items) {
    const dom = document.getElementById('demandStackedChart');
    if (!dom) return;
    
    const chart = echarts.init(dom, null, { renderer: 'svg' });
    echartsInstances.stacked = chart;
    
    // Generar datos temporales simulados o usar dataTimeSeries
    const hours = generateTimeLabels();
    const demandProfiles = generateDemandProfiles(items, hours.length);
    
    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
    
    const series = items.slice(0, 10).map((item, idx) => ({
        name: getLoadDisplayName(item),
        type: 'line',
        stack: 'Total',
        areaStyle: { opacity: 0.8 },
        smooth: true,
        lineStyle: { width: 1, color: colors[idx] },
        showSymbol: false,
        emphasis: { focus: 'series' },
        data: demandProfiles[idx],
        itemStyle: { color: colors[idx] }
    }));
    
    const option = {
        title: {
            text: 'Demanda Apilada por Carga',
            subtext: 'Distribución temporal de potencia activa',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } },
            formatter: function(params) {
                let result = `<strong>${params[0].axisValue}</strong><br/>`;
                let total = 0;
                params.forEach(param => {
                    result += `${param.marker} ${param.seriesName}: <strong>${param.value.toFixed(2)} MW</strong><br/>`;
                    total += param.value;
                });
                result += `<hr style="margin: 5px 0;"/><strong>Total: ${total.toFixed(2)} MW</strong>`;
                return result;
            }
        },
        legend: {
            data: items.slice(0, 10).map(item => getLoadDisplayName(item)),
            top: 50,
            type: 'scroll',
            textStyle: { fontSize: 11 }
        },
        toolbox: {
            feature: {
                saveAsImage: { title: 'Guardar' },
                restore: { title: 'Restaurar' },
                dataZoom: { title: { zoom: 'Zoom', back: 'Restaurar' } }
            }
        },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '18%', containLabel: true },
        xAxis: [{
            type: 'category',
            boundaryGap: false,
            data: hours,
            axisLabel: { rotate: 45, fontSize: 10 }
        }],
        yAxis: [{
            type: 'value',
            name: 'Potencia (MW)',
            nameLocation: 'middle',
            nameGap: 50,
            splitLine: { lineStyle: { type: 'dashed' } }
        }],
        dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', start: 0, end: 100, height: 25, bottom: 10 }
        ],
        series: series
    };
    
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
}

// Gráfico de Comparación de Escenarios
function initDemandComparisonChart(items) {
    const dom = document.getElementById('demandComparisonChart');
    if (!dom) return;
    
    const chart = echarts.init(dom, null, { renderer: 'svg' });
    echartsInstances.comparison = chart;
    
    const hours = generateTimeLabels();
    const totalPd = items.reduce((sum, item) => sum + (item.pd || 0), 0);
    
    // Generar dos escenarios para comparación
    const scenario1 = generateDemandCurve(totalPd, hours.length, 1.0);
    const scenario2 = generateDemandCurve(totalPd * 1.15, hours.length, 1.1); // 15% mayor
    const difference = scenario1.map((v, i) => scenario2[i] - v);
    
    const option = {
        title: {
            text: 'Comparación de Escenarios de Demanda',
            subtext: 'Escenario Base vs Proyección de Crecimiento (+15%)',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            formatter: function(params) {
                const hour = params[0].axisValue;
                let result = `<strong>${hour}</strong><br/>`;
                params.forEach(param => {
                    const unit = param.seriesName.includes('Diferencia') ? 'MW' : 'MW';
                    result += `${param.marker} ${param.seriesName}: <strong>${param.value.toFixed(2)} ${unit}</strong><br/>`;
                });
                return result;
            }
        },
        legend: {
            data: ['Escenario Base', 'Proyección +15%', 'Diferencia'],
            top: 50
        },
        toolbox: {
            feature: { saveAsImage: {}, restore: {} }
        },
        grid: { left: '3%', right: '8%', bottom: '15%', top: '18%', containLabel: true },
        xAxis: [{
            type: 'category',
            data: hours,
            axisLabel: { rotate: 45, fontSize: 10 }
        }],
        yAxis: [
            {
                type: 'value',
                name: 'Demanda (MW)',
                position: 'left',
                splitLine: { lineStyle: { type: 'dashed' } }
            },
            {
                type: 'value',
                name: 'Diferencia (MW)',
                position: 'right',
                splitLine: { show: false },
                axisLine: { lineStyle: { color: '#10b981' } }
            }
        ],
        dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', start: 0, end: 100, height: 25, bottom: 10 }
        ],
        series: [
            {
                name: 'Escenario Base',
                type: 'line',
                data: scenario1,
                smooth: true,
                lineStyle: { width: 3, color: '#3b82f6' },
                itemStyle: { color: '#3b82f6' },
                areaStyle: { color: 'rgba(59, 130, 246, 0.1)' }
            },
            {
                name: 'Proyección +15%',
                type: 'line',
                data: scenario2,
                smooth: true,
                lineStyle: { width: 3, color: '#ef4444' },
                itemStyle: { color: '#ef4444' },
                areaStyle: { color: 'rgba(239, 68, 68, 0.1)' }
            },
            {
                name: 'Diferencia',
                type: 'bar',
                yAxisIndex: 1,
                data: difference,
                itemStyle: {
                    color: function(params) {
                        return params.value >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
                    }
                },
                barWidth: '60%'
            }
        ]
    };
    
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
}

// Mapa de Calor de Demanda Semanal
function initDemandHeatmapChart(items) {
    const dom = document.getElementById('demandHeatmapChart');
    if (!dom) return;
    
    const chart = echarts.init(dom, null, { renderer: 'svg' });
    echartsInstances.heatmap = chart;
    
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    
    const totalPd = items.reduce((sum, item) => sum + (item.pd || 0), 0);
    
    // Generar datos de mapa de calor (día x hora)
    const data = [];
    const weeklyProfile = [1.0, 1.02, 1.01, 1.03, 0.98, 0.85, 0.82]; // Factor por día
    const hourlyProfile = [0.7, 0.65, 0.6, 0.58, 0.6, 0.7, 0.85, 0.95, 1.0, 0.98, 0.95, 0.92, 
                          0.88, 0.85, 0.82, 0.85, 0.9, 0.95, 1.0, 0.98, 0.92, 0.85, 0.78, 0.72];
    
    days.forEach((day, dayIdx) => {
        hours.forEach((hour, hourIdx) => {
            const value = totalPd * weeklyProfile[dayIdx] * hourlyProfile[hourIdx];
            data.push([hourIdx, dayIdx, Math.round(value * 10) / 10]);
        });
    });
    
    const option = {
        title: {
            text: 'Mapa de Calor - Demanda Semanal Típica',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            position: 'top',
            formatter: function(params) {
                return `<strong>${days[params.value[1]]} ${hours[params.value[0]]}</strong><br/>Demanda: <strong>${params.value[2]} MW</strong>`;
            }
        },
        grid: { left: '10%', right: '10%', bottom: '15%', top: '12%' },
        xAxis: {
            type: 'category',
            data: hours,
            splitArea: { show: true },
            axisLabel: { fontSize: 10 }
        },
        yAxis: {
            type: 'category',
            data: days,
            splitArea: { show: true }
        },
        visualMap: {
            min: Math.min(...data.map(d => d[2])),
            max: Math.max(...data.map(d => d[2])),
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '2%',
            inRange: {
                color: ['#f0f9ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e40af', '#1e3a8a']
            }
        },
        series: [{
            name: 'Demanda',
            type: 'heatmap',
            data: data,
            label: { show: false },
            emphasis: {
                itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
            }
        }]
    };
    
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
}

// Funciones auxiliares
function generateTimeLabels() {
    const labels = [];
    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
            labels.push(`${dayNames[day]} ${hour}:00`);
        }
    }
    return labels;
}

function generateDemandProfiles(items, length) {
    const hourlyProfile = [0.7, 0.65, 0.6, 0.58, 0.6, 0.7, 0.85, 0.95, 1.0, 0.98, 0.95, 0.92, 
                          0.88, 0.85, 0.82, 0.85, 0.9, 0.95, 1.0, 0.98, 0.92, 0.85, 0.78, 0.72];
    
    return items.slice(0, 10).map(item => {
        const basePd = item.pd || 0;
        const profile = [];
        for (let i = 0; i < length; i++) {
            const hourFactor = hourlyProfile[i % 24];
            const noise = 0.95 + Math.random() * 0.1;
            profile.push(Math.round(basePd * hourFactor * noise * 100) / 100);
        }
        return profile;
    });
}

function generateDemandCurve(basePd, length, scale = 1.0) {
    const hourlyProfile = [0.7, 0.65, 0.6, 0.58, 0.6, 0.7, 0.85, 0.95, 1.0, 0.98, 0.95, 0.92, 
                          0.88, 0.85, 0.82, 0.85, 0.9, 0.95, 1.0, 0.98, 0.92, 0.85, 0.78, 0.72];
    const weeklyFactor = [1.0, 1.02, 1.01, 1.03, 0.98, 0.85, 0.82];
    
    const curve = [];
    for (let i = 0; i < length; i++) {
        const dayIdx = Math.floor(i / 24) % 7;
        const hourIdx = i % 24;
        const noise = 0.97 + Math.random() * 0.06;
        const value = basePd * hourlyProfile[hourIdx] * weeklyFactor[dayIdx] * scale * noise;
        curve.push(Math.round(value * 100) / 100);
    }
    return curve;
}

// Renderizar vista de gráficos avanzados
function renderAdvancedChartsDemand(items) {
    return `
        <div class="charts-container">
            <!-- Gráfico de Área Apilada -->
            <div class="acrylic-card" style="margin-bottom: 20px;">
                <div id="demandStackedChart" style="height: 500px;"></div>
            </div>
            
            <!-- Gráfico de Comparación -->
            <div class="acrylic-card" style="margin-bottom: 20px;">
                <div id="demandComparisonChart" style="height: 450px;"></div>
            </div>
            
            <!-- Mapa de Calor -->
            <div class="acrylic-card" style="margin-bottom: 20px;">
                <div id="demandHeatmapChart" style="height: 400px;"></div>
            </div>
            
            <!-- Gráficos básicos de Chart.js -->
            <div class="acrylic-card" style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                    <i class="bi bi-pie-chart-fill" style="color: var(--primary-color);"></i>
                    Distribución de Demanda
                </h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; height: 350px;">
                    <div><canvas id="demandPieChart"></canvas></div>
                    <div><canvas id="demandBarChart"></canvas></div>
                </div>
            </div>
            
            <div class="acrylic-card" style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 20px;">
                    <i class="bi bi-graph-up" style="color: #7c3aed;"></i>
                    Curva de Demanda
                </h3>
                <div style="height: 400px;">
                    <canvas id="demandTimeSeriesChart"></canvas>
                </div>
            </div>
            
            <div class="acrylic-card" style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 20px;">
                    <i class="bi bi-scatter" style="color: #10b981;"></i>
                    Análisis P vs Q
                </h3>
                <div style="height: 350px;">
                    <canvas id="demandScatterChart"></canvas>
                </div>
            </div>
            
            <div class="acrylic-card">
                <h3 style="margin-bottom: 20px;">
                    <i class="bi bi-diagram-3-fill" style="color: #f59e0b;"></i>
                    Demanda por Zona
                </h3>
                <div style="height: 350px;">
                    <canvas id="demandZoneChart"></canvas>
                </div>
            </div>
        </div>
    `;
}

// Función para inicializar todos los gráficos
function initAllDemandCharts(items) {
    // Primero ECharts (avanzados)
    setTimeout(() => initAdvancedDemandCharts(items), 100);
    // Luego Chart.js (básicos)
    setTimeout(() => initDemandCharts(items), 200);
}

// Exportar funciones
window.initAdvancedDemandCharts = initAdvancedDemandCharts;
window.renderAdvancedChartsDemand = renderAdvancedChartsDemand;
window.initAllDemandCharts = initAllDemandCharts;
