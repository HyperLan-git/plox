class Modulation {
    inputs;
    outputs;

    gain;

    constructor(context) {
        this.inputs = [];
        this.outputs = [];
        this.gain = context.createGain();

        this.gain.name = uidGen(10);
        this.gain.fxtype = "gain";
    }

    addInput(input) {
        input.connect(this.gain);

        this.inputs.push(input);
    }

    addOutput(output) {
        this.gain.connect(output);

        this.outputs.push(output);
    }

    setAmount(gain) {
        this.gain.gain.value = gain;
    }
}