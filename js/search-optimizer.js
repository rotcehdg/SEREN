// ==================== SEARCH OPTIMIZER ====================
class SearchOptimizer {
    constructor(options) {
        this.data = options.data || [];
        this.fields = options.fields || [];
        this.minSearchLength = options.minSearchLength || 2;
        this.cache = new Map();
        this.index = null;
        
        if (options.autoIndex) {
            this.buildIndex();
        }
    }
    
    // Construir índice invertido simple
    buildIndex() {
        this.index = new Map();
        
        this.data.forEach((item, idx) => {
            const searchableText = this.fields
                .map(field => {
                    const value = this.getNestedValue(item, field);
                    return value ? value.toString().toLowerCase() : '';
                })
                .join(' ')
                .replace(/[^\w\s]/g, ' ');
            
            const words = searchableText.split(/\s+/);
            
            words.forEach(word => {
                if (word.length < 2) return;
                
                if (!this.index.has(word)) {
                    this.index.set(word, new Set());
                }
                
                this.index.get(word).add(idx);
            });
        });
    }
    
    // Búsqueda con índice
    search(query) {
        if (!query || query.length < this.minSearchLength) {
            return this.data;
        }
        
        // Verificar cache
        const cacheKey = `search:${query}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const queryWords = query.toLowerCase().split(/\s+/);
        let resultIndices = new Set();
        
        if (this.index) {
            // Búsqueda con índice
            queryWords.forEach(word => {
                if (this.index.has(word)) {
                    const indices = this.index.get(word);
                    if (resultIndices.size === 0) {
                        resultIndices = new Set(indices);
                    } else {
                        // Intersección de resultados
                        const intersection = new Set();
                        indices.forEach(idx => {
                            if (resultIndices.has(idx)) {
                                intersection.add(idx);
                            }
                        });
                        resultIndices = intersection;
                    }
                }
            });
        } else {
            // Fallback a búsqueda lineal (pero optimizada)
            resultIndices = this.linearSearch(queryWords);
        }
        
        const results = Array.from(resultIndices).map(idx => this.data[idx]);
        this.cache.set(cacheKey, results);
        
        return results;
    }
    
    // Búsqueda lineal optimizada
    linearSearch(queryWords) {
        const resultIndices = new Set();
        
        this.data.forEach((item, idx) => {
            const searchableText = this.fields
                .map(field => {
                    const value = this.getNestedValue(item, field);
                    return value ? value.toString().toLowerCase() : '';
                })
                .join(' ');
            
            const matchesAll = queryWords.every(word => 
                searchableText.includes(word)
            );
            
            if (matchesAll) {
                resultIndices.add(idx);
            }
        });
        
        return resultIndices;
    }
    
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    }
    
    updateData(newData) {
        this.data = newData;
        this.cache.clear();
        if (this.index) {
            this.buildIndex();
        }
    }
    
    clearCache() {
        this.cache.clear();
    }
}

window.SearchOptimizer = SearchOptimizer;