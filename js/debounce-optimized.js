// ==================== DEBOUNCE OPTIMIZADO ====================
const AdvancedDebounce = {
    // Debounce con cancelación y leading/trailing options
    debounce: function(func, wait, options = {}) {
        let timeout;
        let lastArgs;
        let lastThis;
        let result;
        
        const leading = options.leading || false;
        const trailing = options.trailing !== false;
        
        function invokeFunc() {
            if (lastArgs) {
                result = func.apply(lastThis, lastArgs);
                lastArgs = lastThis = undefined;
            }
            return result;
        }
        
        function timerExpired() {
            if (trailing && lastArgs) {
                return invokeFunc();
            }
            lastArgs = lastThis = undefined;
        }
        
        function debounced(...args) {
            lastArgs = args;
            lastThis = this;
            
            if (timeout) {
                clearTimeout(timeout);
            }
            
            if (leading && !timeout) {
                result = invokeFunc();
            }
            
            timeout = setTimeout(timerExpired, wait);
            
            return result;
        }
        
        debounced.cancel = function() {
            if (timeout) {
                clearTimeout(timeout);
                lastArgs = lastThis = timeout = undefined;
            }
        };
        
        debounced.flush = function() {
            if (timeout) {
                invokeFunc();
                clearTimeout(timeout);
                lastArgs = lastThis = timeout = undefined;
            }
            return result;
        };
        
        return debounced;
    },
    
    // Throttle para eventos de scroll/resize
    throttle: function(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
};

window.AdvancedDebounce = AdvancedDebounce;