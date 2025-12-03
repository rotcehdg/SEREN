// ==================== VIRTUAL LIST COMPONENT ====================
class VirtualList {
    constructor(container, options) {
        this.container = container;
        this.items = options.items || [];
        this.itemHeight = options.itemHeight || 50;
        this.renderItem = options.renderItem;
        this.visibleItems = Math.ceil(container.clientHeight / this.itemHeight) + 5;
        
        this.scrollTop = 0;
        this.startIndex = 0;
        this.endIndex = this.visibleItems;
        
        this.init();
    }
    
    init() {
        // Crear contenedor interno
        this.innerContainer = document.createElement('div');
        this.innerContainer.style.position = 'relative';
        this.innerContainer.style.height = `${this.items.length * this.itemHeight}px`;
        
        this.visibleContainer = document.createElement('div');
        this.visibleContainer.style.position = 'absolute';
        this.visibleContainer.style.top = '0';
        this.visibleContainer.style.width = '100%';
        
        this.innerContainer.appendChild(this.visibleContainer);
        this.container.appendChild(this.innerContainer);
        
        // Configurar scroll
        this.container.style.overflowY = 'auto';
        this.container.addEventListener('scroll', this.handleScroll.bind(this));
        
        this.renderVisibleItems();
    }
    
    handleScroll() {
        this.scrollTop = this.container.scrollTop;
        const newStartIndex = Math.floor(this.scrollTop / this.itemHeight);
        const newEndIndex = newStartIndex + this.visibleItems;
        
        if (newStartIndex !== this.startIndex || newEndIndex !== this.endIndex) {
            this.startIndex = newStartIndex;
            this.endIndex = newEndIndex;
            this.renderVisibleItems();
        }
    }
    
    renderVisibleItems() {
        const fragment = document.createDocumentFragment();
        const visibleItems = this.items.slice(this.startIndex, this.endIndex);
        
        visibleItems.forEach((item, index) => {
            const itemIndex = this.startIndex + index;
            const top = itemIndex * this.itemHeight;
            
            const itemElement = document.createElement('div');
            itemElement.style.position = 'absolute';
            itemElement.style.top = `${top}px`;
            itemElement.style.width = '100%';
            itemElement.style.height = `${this.itemHeight}px`;
            
            if (this.renderItem) {
                itemElement.innerHTML = this.renderItem(item, itemIndex);
            }
            
            fragment.appendChild(itemElement);
        });
        
        this.visibleContainer.innerHTML = '';
        this.visibleContainer.appendChild(fragment);
        this.innerContainer.style.height = `${this.items.length * this.itemHeight}px`;
    }
    
    updateItems(newItems) {
        this.items = newItems;
        this.renderVisibleItems();
    }
}

// Exportar al scope global
window.VirtualList = VirtualList;