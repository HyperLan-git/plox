class ProgrammableProcessor extends AudioWorkletProcessor {
    fct;
    processorOptions;
    shouldStop;

    constructor(options) {
        super();

        this.processorOptions = options;
        this.fct = new Function("inputs", "outputs", "parameters", "\"use strict\";" + options.processorOptions.fct);
        this.shouldStop = false;
        this.port.onmessage = (e) => {
            if(e.data.type == 'stop')
                this.shouldStop = true;
        };
    }

    // I love how the docs won't even attempt to warn against the huge memory leak the example causes
    process(inputs, outputs, parameters) {
        try {
            this.fct(inputs, outputs, parameters);
        } catch(e) {
            this.port.postMessage({type: "error", data: e});
            this.shouldStop = true;
        }
        return !this.shouldStop;
    }
}
registerProcessor("programmable-processor", ProgrammableProcessor);