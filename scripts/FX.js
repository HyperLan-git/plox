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

const PARAMS = {
    "gain": ["gain"],
    "delay": ["delayTime"],
    "distortion": ["curve", "oversample"],
    "biquadfilter": ["detune", "frequency", "Q", "gain", "type"],
    "iirfilter": [],
    "compressor": ["threshold", "knee", "ratio", "attack", "release"],
    "stereopanner": ["pan"],
    "analyser": ["fftSize", "minDecibels", "maxDecibels", "smoothingTimeConstant"],
    "convolver": ["buffer", "normalize"],
    "oscillator": ["detune", "frequency", "type"],
    "audiobuffersource": ["detune", "playbackRate", "buffer", "loop", "loopStart", "loopEnd"],
    "streamsource": [],
    "streamdestination": [],
    "constant": ["offset"]
};

const MODULATIONS = {
    "gain": ["gain"],
    "delay": ["delayTime"],
    "distortion": [],
    "biquadfilter": ["detune", "frequency", "Q", "gain"],
    "iirfilter": [],
    "compressor": ["threshold", "knee", "ratio", "attack", "release"],
    "stereopanner": ["pan"],
    "analyser": [],
    "convolver": [],
    "oscillator": ["detune", "frequency"],
    "audiobuffersource": ["detune", "playbackRate"],
    "streamsource": [],
    "constant": ["offset"]
};

// Code shamelessly stolen from SO
function uidGen(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter++;
    }
    return result;
}

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

    // function to draw ui
    draw;

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
        if(this.fxtype in FX_DRAW) this.draw = FX_DRAW[this.fxtype];
        this.label = this.fxtype + "-" + this.name;
    }

    connect(fx, output = 0, input = 0) {
        this.outputs.push({fx: fx, idx: output, input: input});
        fx.inputs[this.name + input] = {fx: this, idx: input, output: output};

        this.node.connect(fx.node, output, input);
        return fx;
    }

    connectParam(fx, param, output = 0) {
        if(MODULATIONS[fx.fxtype].indexOf(param) === -1) throw new TypeError(param + " is not a param of the fx provided !");
        this.outputParams.push({fx: fx, param: param, idx: output});
        fx.inputParams[this.name + param + output] = {fx: this, param: param, output: output};
        this.node.connect(fx.node[param], output);
    }

    disconnectParam(fx, param, output = 0) {
        for(let k = 0; k < this.outputParams.length; k++) {
            const v = this.outputParams[k];
            if(v["fx"] == fx && v["param"] == param && v["idx"] == output) {
                delete v.fx.inputParams[this.name + v["param"] + v["idx"]];
                this.outputParams.splice(k, 1);
                return;
            }
        }
    }

    disconnectAll(params = true) {
        this.node.disconnect();
        for(let k in this.outputs) {
            const v = this.outputs[k];
            delete v.fx.inputs[this.name + v["input"]];
        }
        if(params) for(let k in this.outputParams) {
            const v = this.outputParams[k];
            delete v.fx.inputParams[this.name + v["param"] + v["idx"]];
        }
        this.outputs = [];
        if(params) this.outputParams = [];
    }

    disconnectOutput(output, params = true) {
        if(params)
            this.node.disconnect(output);
        else {
            for(const v of this.outputs) if(v["idx"] == output)
                this.node.disconnect(v["fx"].node, v["idx"]);
        }

        this.filterConnections(((v) => v["idx"] == output), params ? ((v) => v["idx"] == output) : (() => false));
    }

    disconnectOutputFx(fx, output, params = true) {
        if(params) {
            this.node.disconnect(fx, output);
            for(const v of this.outputParams) if(v["idx"] == output)
                this.node.disconnect(v["fx"].node[v["param"]], v["idx"]);
        } else
            this.node.disconnect(fx, output);

        this.filterConnections(((v) => v["idx"] == output && v["fx"] == fx), params ? ((v) => v["idx"] == output && v["fx"] == fx) : (() => false));
    }

    disconnectFx(fx, params = true) {
        if(params) for(const v of this.outputParams) if(v["fx"] == fx)
            this.node.disconnect(fx.node[v["param"]]);
        this.node.disconnect(fx.node);
        this.filterConnections(((v) => v["fx"] == fx), params ? ((v) => v["fx"] == fx) : (() => false));
    }

    filterConnections(filter, paramsFilter) {
        for(let k = 0; k < this.outputs.length;) {
            const v = this.outputs[k];
            if(!filter(v)) {
                k++;
                continue;
            }
            delete v.fx.inputs[this.name + v["input"]];
            this.outputs.splice(k, 1);
        }
        for(let k = 0; k < this.outputParams.length;) {
            const v = this.outputParams[k];
            if(!paramsFilter(v)) {
                k++;
                continue;
            }
            delete v.fx.inputParams[this.name + v["param"] + v["idx"]];
            this.outputParams.splice(k, 1);
        }
    }

    disconnectInputs() {
        for(const k in this.inputParams) {
            const v = this.inputs[k];
            v["fx"].disconnect(this);
        }
        for(const k in this.inputs) {
            const v = this.inputs[k];
            v["fx"].disconnect(this);
        }
    }

    disconnect(fx = undefined, output = undefined, input = undefined, params = true) {
        if(fx === undefined && output !== undefined) {
            this.disconnectOutput(output, params);
            return;
        }

        if(fx === undefined) {
            this.disconnectAll(params);
            return;
        }

        if(output === undefined) {
            this.disconnectFx(fx, params);
            return;
        }

        if(input === undefined) {
            this.disconnectOutputFx(fx, output, params);
            return;
        }

        this.node.disconnect(fx.node, output, input);
        this.filterConnections(((v) => v["fx"] == fx && v["idx"] == output && v["input"] == input), (() => false));
    }

    copy(copyConnections = false) {
        let node, fx;
        if (this.fxtype == "iirfilter") {
            node = new IIRFilterNode(this.node.context, {feedforward: this.node.feedforward, feedback: this.node.feedback});
            node.feedforward = this.node.feedforward;
            node.feedback = this.node.feedback;
        } else if(this.fxtype == "channelmerger")
            node = new ChannelMergerNode(this.node.context, {numberOfInputs: this.node.numberOfInputs});
        else if(this.fxtype == "channelsplitter")
            node = new ChannelSplitterNode(this.node.context, {numberOfOutputs: this.node.numberOfOutputs});
        else
            node = new FX_TYPES[this.fxtype](this.node.context);

        fx = new FX(node);

        fx.node.channelCount = this.node.channelCount;
        fx.node.channelCountMode = this.node.channelCountMode;
        fx.node.channelInterpretation = this.node.channelInterpretation;

        for(const v of PARAMS[this.fxtype])
            if(MODULATIONS[this.fxtype].indexOf(v) == -1)
                fx.node[v] = this.node[v];
            else
                fx.node[v].value = this.node[v].value;

        if(!copyConnections) return fx;

        fx.outputs = [...this.outputs];
        for(const v of this.outputs)
            fx.connect(v["fx"], v["idx"], v["input"]);
        fx.outputParams = [...this.outputParams];
        for(const v of this.outputParams)
            fx.connectParam(v["fx"], v["param"], v["idx"]);

        for(const k in this.inputs) {
            const v = this.inputs[k];
            v["fx"].connect(fx, v["output"], v["idx"]);
        }
        for(const k in this.inputParams) {
            const v = this.inputs[k];
            v["fx"].connectParam(fx, v["param"], v["output"]);
        }
        return fx;
    }
}

// copies a list of fx and their connections, returns a dict with keys equal to the corresponding fx' uid
// This is useful for the monophonic fx graph
function copyFxs(...fxs) {
    const res = {};
    for(const fx of fxs)
        res[fx.name] = fx.copy();

    for(const fx of fxs) {
        for(const conn of fx.outputs) {
            if(conn.fx.name in res)
                res[fx.name].connect(res[conn.fx.name], conn.idx, conn.input);
        }
        for(const conn of fx.outputParams) {
            if(conn.fx.name in res)
                res[fx.name].connectParam(res[conn.fx.name], conn.param, conn.idx);
        }
    }
    return res;
}

//import Drawflow from "drawflow";

class FXGraph {
    nodes;
    inputNode;
    outputNode;

    AC;
    drawflow;

    constructor(context, drawflow) {
        this.nodes = {};
        this.inputNode = new FX(new GainNode(context));
        this.outputNode = new FX(new GainNode(context));

        this.drawflow = drawflow;
        this.AC = context;

        //this.drawflow = new Drawflow(null);

        this.drawflow.on("connectionCreated", (e) => {
            const out = this.getAudioNodeFromId(e.output_id),
                    input = this.getAudioNodeFromId(e.input_id);

            out.connect(input);
        });
        this.drawflow.on("connectionRemoved", (e) => {
            const out = this.getAudioNodeFromId(e.output_id),
                    input = this.getAudioNodeFromId(e.input_id);
            out.disconnect(input);
        });
        this.drawflow.on("nodeRemoved", (e) => {
            //XXX recreate connections
            if(e == this.inputNode.gid) {
                this.inputNode.gid = this.drawflow.addNode("input", 0, 1, 0, 0, "", {node: this.inputNode.name}, "Input", false);
                this.inputNode.disconnect();
                return;
            }
            if(e == this.outputNode.gid) {
                this.outputNode.gid = this.drawflow.addNode("output", 1, 0, 1000, 0, "", {node: this.outputNode.name}, "Output", false);
                this.outputNode.disconnectInputs();
                return;
            }
            for(let k in this.nodes) {
                if(this.nodes[k].gid === e) {
                    this.deleteNode(this.nodes[k]);
                    return;
                }
            }
        });

        this.drawflow.on("nodeSelected", (e) => {
            for(let k in this.nodes) {
                if(this.nodes[k].gid == e) {
                    openFx(k);
                    return;
                }
            }
        });

        this.drawflow.on("nodeUnselected", () => {
            closeFx();
        });

        this.inputNode.gid = this.drawflow.addNode("input", 0, 1, 0, 0, "", {node: this.inputNode.name}, "Input", false);
        this.outputNode.gid = this.drawflow.addNode("output", 1, 0, 1000, 0, "", {node: this.outputNode.name}, "Output", false);

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
        const fx = new FX(node)
        this.nodes[fx.name] = fx;
        fx.gid = this.drawflow.addNode(fx.name, 1, 1, 0, 200, "", {node: fx.name}, fx.label, false);
        return fx.gid;
    }

    deleteNode(name) {
        if(!(name in nodes)) return false;
        const fx = this.nodes[name];
        fx.disconnectInputs();
        fx.disconnectAll();
        delete this.nodes[name];
    }
};
/* TODO
make it easily clonable for multiple voices OR make automated channel splitting and merging when multiple keys are hit
*/