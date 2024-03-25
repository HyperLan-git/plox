//import Drawflow from "drawflow";

const FX_TYPES = {
    "gain": GainNode,
    "biquadfilter": BiquadFilterNode,
    "iirfilter": IIRFilterNode,
    "distortion": WaveShaperNode,
    "convolver": ConvolverNode,
    "delay": DelayNode,
    "compressor": DynamicsCompressorNode,
    "stereopanner": StereoPannerNode,
    "channelmerger": ChannelMergerNode,
    "channelsplitter": ChannelSplitterNode,
    "analyser": AnalyserNode,
    "oscillator": OscillatorNode,
    "audiobuffersource": AudioBufferSourceNode,
    "streamsource": MediaStreamAudioSourceNode,
    "streamdestination": MediaStreamAudioDestinationNode,
    "worklet": AudioWorkletNode,
    "constant": ConstantSourceNode
};

const MODULATIONS = {
    "gain": ["gain"],
    "delay": ["delayTime"],
    "distortion": [],
    "biquadfilter": ["detune", "frequency", "Q", "gain"],
    "compressor": ["threshold", "knee", "ratio", "attack", "release"],
    "stereopanner": ["pan"],
    "analyser": [],
    "convolver": [],
    "oscillator": ["detune", "frequency"],
    "audiobuffersource": ["detune", "playbackRate"],
    "streamsource": []
};

/**
 * Wrapper for every node in the webapi (why do we have no way to access data about connections?)
 */
class FX {
    // internals
    inputs;
    inputParams;
    outputs;
    outputParams;
    node;

    // unique
    name;

    // tells the type of the node
    fxtype;

    // editable by user
    label;

    constructor(node) {
        this.inputs = {};
        this.inputParams = {};
        this.outputs = [];
        this.outputParams = [];
        this.node = node;
        this.name = uidGen(10);
        for(let k in FX_TYPES)
            if(FX_TYPES[k].prototype.constructor === node.constructor) {
                this.fxtype = k;
                break;
            }
        if(this.fxtype === undefined) throw new TypeError("Node given is not a supported type !");
        this.label = this.fxtype + "-" + this.name;
    }

    connect(fx, output = 0, input = 0) {
        this.outputs.push({fx: fx, idx: output, input: input});
        fx.inputs[this.name + input] = {fx: this, idx: input, output: output};

        this.node.connect(fx.node, output, input);
    }

    connectParam(fx, param, output = 0) {
        if(MODULATIONS[fx.fxtype].indexOf(param) === -1) throw new TypeError(param + " is not a param of the fx provided !");
        this.outputParams.push({fx: fx, param: param, idx: output});
        fx.inputParams[this.name + param + output] = {fx: this, param: param, output: output};
        this.node.connect(fx.node[param], output);
    }

    disconnectAll() {
        this.disconnect();
    }

    disconnectOutput(output) {
        this.disconnect(undefined, output);
    }

    disconnectFx(fx) {
        this.disconnect(fx);
    }

    disconnect(fx = undefined, output = undefined, input = undefined) {
        if(fx === undefined) {
            if(output !== undefined) {
                this.node.disconnect(output);
                return;
            }
            this.node.disconnect();
            for(let k in outputs) {
                const v = outputs[k];
                const input = v.fx.inputs[this.name + v["input"]];

            }
            return;
        }
        if(output === undefined) {
            this.node.disconnect(fx.node);
            return;
        }
    }

    copy(copyConnections = false) {

    }
}

class FXGraph {
    nodes;
    inputNode;
    outputNode;

    AC;
    drawflow;

    constructor(context, drawflow) {
        this.nodes = {};
        this.inputNode = new GainNode(context);
        this.outputNode = new GainNode(context);

        this.drawflow = drawflow;
        this.AC = context;

        //this.drawflow = new Drawflow(null);

        this.drawflow.on("connectionCreated", (e) => {
            const out = this.getAudioNodeFromId(e.output_id),
                    input = this.getAudioNodeFromId(e.input_id);

            input.inputs.push(e.output_id);
            out.outputs.push(e.input_id);

            out.connect(input);
        });
        this.drawflow.on("connectionRemoved", (e) => {
            const out = this.getAudioNodeFromId(e.output_id),
                    input = this.getAudioNodeFromId(e.input_id);
            if(out.outputs.includes(e.input_id)) {
                out.outputs.splice(out.outputs.indexOf(e.input_id), 1);
                input.inputs.splice(input.inputs.indexOf(e.output_id), 1);
                out.disconnect(input);
            }
        });
        this.drawflow.on("nodeRemoved", (e) => {
            //XXX recreate connections
            if(e == this.inputNode.id) {
                this.inputNode.id = this.drawflow.addNode("input", 0, 1, 0, 0, "", {node: this.inputNode.name}, "Input", false);
                this.inputNode.disconnect();
                this.inputNode.outputs = [];
                return;
            }
            if(e == this.outputNode.id) {
                this.outputNode.id = this.drawflow.addNode("output", 1, 0, 1000, 0, "", {node: this.outputNode.name}, "Output", false);
                for(let k in this.nodes) {
                    const i = this.nodes[k].outputs.indexOf(this.outputNode.id);
                    if(i != -1) {
                        this.nodes[k].outputs.splice(i);
                        return;
                    }
                }
                return;
            }
            for(let k in this.nodes) {
                if(this.nodes[k].id === e) {
                    this.deleteNode(this.nodes[k]);
                    return;
                }
            }
        });

        this.inputNode.name = uidGen(10);
        this.inputNode.fxtype = "gain";
        this.inputNode.draw = FX_DRAW['gain'];
        this.inputNode.inputs = [];
        this.inputNode.outputs = [];

        this.outputNode.name = uidGen(10);
        this.outputNode.fxtype = "gain";
        this.outputNode.draw = FX_DRAW['gain'];
        this.outputNode.inputs = [];
        this.outputNode.outputs = [];

        this.drawflow.on("nodeSelected", (e) => {
            for(let k in this.nodes) {
                if(this.nodes[k].id == e) {
                    openFx(k);
                    return;
                }
            }
        });

        this.drawflow.on("nodeUnselected", (e) => {
            closeFx();
        });

        this.inputNode.id = this.drawflow.addNode("input", 0, 1, 0, 0, "", {node: this.inputNode.name}, "Input", false);
        this.outputNode.id = this.drawflow.addNode("output", 1, 0, 1000, 0, "", {node: this.outputNode.name}, "Output", false);

        this.nodes[this.inputNode.name] = this.inputNode;
        this.nodes[this.outputNode.name] = this.outputNode;
    }

    connect(output) {
        return this.outputNode.connect(output);
    }

    getInput() {
        return this.inputNode;
    }

    getOutput() {
        return this.outputNode;
    }

    getNode(id) {
        return this.drawflow.getNodeFromId(id);
    }

    getNodes(name) {
        return this.drawflow.getNodesFromName(name);
    }

    getAudioNodeFromId(id) {
        return this.nodes[this.getNode(id).data.node];
    }

    getAudioNode(name) {
        return this.nodes[name];
    }

    addNode(node) {
        this.nodes[node.name] = node;
        node.id = this.drawflow.addNode(node.name, 1, 1, 0, 200, "", {node: node.name}, node.fxtype + "<br>" + node.name, false);
        node.outputs = [];
        node.inputs = [];
        return node.id;
    }

    // TODO determine if the object is still referenced through its inputs and delete the connections if so
    deleteNode(name) {
        if (!(name in nodes)) return false;
        const node = this.nodes[name];
        for(let k in node.inputs) {
            const input = this.getAudioNodeFromId(node.inputs[k]);
            input.outputs.splice(input.outputs.indexOf(node.id), 1);
            input.disconnect(node);
        }
        this.drawflow.removeNodeId(node.id);
        node.disconnect();
        delete this.nodes[name];
    }
};
/* TODO
make it easily clonable for multiple voices OR make automated channel splitting and merging when multiple keys are hit
*/