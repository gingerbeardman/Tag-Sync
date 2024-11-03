class Logger {
    // static enabled = true;
    static enabled = false;
    
    static formatValue(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return `"${value}"`;
        if (typeof value !== 'object') return String(value);
        
        if (Array.isArray(value)) {
            return `[${value.map(v => Logger.formatValue(v)).join(', ')}]`;
        }
        
        if (value instanceof Range) {
            return `Range(${value.start}, ${value.end})`;
        }
        
        const props = [];
        for (const key in value) {
            if (value.hasOwnProperty(key)) {
                props.push(`${key}: ${Logger.formatValue(value[key])}`);
            }
        }
        return `{${props.join(', ')}}`;
    }
    
    static log(prefix, ...args) {
        if (!this.enabled) return;
        const timestamp = new Date().toISOString().split('T')[1];
        const message = args.map(arg => this.formatValue(arg)).join(' ');
        console.log(`[${timestamp}] [TagSync] ${prefix}: ${message}`);
    }
    
    static debug(...args) { this.log('DEBUG', ...args); }
    static info(...args) { this.log('INFO', ...args); }
    static warn(...args) { this.log('WARN', ...args); }
    static error(...args) { this.log('ERROR', ...args); }
}

module.exports = Logger;