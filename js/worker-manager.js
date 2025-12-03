// ==================== WORKER MANAGER ====================
class WorkerManager {
    constructor() {
        this.workers = new Map();
        this.taskQueue = new Map();
        this.nextTaskId = 1;
    }
    
    initWorker(name, workerUrl) {
        if (this.workers.has(name)) return;
        
        const worker = new Worker(workerUrl);
        this.workers.set(name, worker);
        
        worker.onmessage = (e) => {
            const { taskId, result } = e.data;
            this.handleWorkerResponse(name, taskId, result);
        };
        
        worker.onerror = (error) => {
            console.error(`Worker ${name} error:`, error);
        };
    }
    
    executeTask(workerName, taskType, data) {
        return new Promise((resolve, reject) => {
            const worker = this.workers.get(workerName);
            if (!worker) {
                reject(new Error(`Worker ${workerName} not found`));
                return;
            }
            
            const taskId = this.nextTaskId++;
            
            // Almacenar resolución de la promesa
            this.taskQueue.set(taskId, { resolve, reject });
            
            // Enviar tarea al worker
            worker.postMessage({
                taskId,
                type: taskType,
                data
            });
            
            // Timeout para evitar bloqueos
            setTimeout(() => {
                if (this.taskQueue.has(taskId)) {
                    this.taskQueue.delete(taskId);
                    reject(new Error('Worker timeout'));
                }
            }, 30000); // 30 segundos timeout
        });
    }
    
    handleWorkerResponse(workerName, taskId, result) {
        const task = this.taskQueue.get(taskId);
        if (!task) return;
        
        this.taskQueue.delete(taskId);
        
        if (result.error) {
            task.reject(new Error(result.error));
        } else {
            task.resolve(result);
        }
    }
    
    terminateWorker(workerName) {
        const worker = this.workers.get(workerName);
        if (worker) {
            worker.terminate();
            this.workers.delete(workerName);
        }
    }
    
    terminateAll() {
        this.workers.forEach(worker => worker.terminate());
        this.workers.clear();
        this.taskQueue.clear();
    }
}

// Singleton para fácil acceso
window.WorkerManager = new WorkerManager();