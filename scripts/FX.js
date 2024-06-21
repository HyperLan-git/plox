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
    "analyser": ["type", "fftSize", "minDecibels", "maxDecibels", "smoothingTimeConstant"],
    "convolver": ["buffer", "normalize"],
    "oscillator": ["detune", "frequency", "type"],
    "audiobuffersource": ["detune", "playbackRate", "buffer", "loop", "loopStart", "loopEnd"],
    "streamsource": [],
    "streamdestination": [],
    "constant": ["offset", "type", "data"]
};

const MODULATIONS = {
    "gain": ["gain"],
    "delay": ["delayTime"],
    "distortion": [],
    "biquadfilter": ["frequency", "detune", "Q", "gain"],
    "iirfilter": [],
    "compressor": ["threshold", "knee", "ratio", "attack", "release"],
    "stereopanner": ["pan"],
    "analyser": [],
    "convolver": [],
    "oscillator": ["frequency", "detune"],
    "audiobuffersource": ["detune", "playbackRate"],
    "streamsource": [],
    "constant": ["offset"]
};

const CONST_NODE_TYPE = [
    "ENVELOPE",
    //"RANDOM",
    "EXT_PARAM",
    "CONSTANT"
];

const CONST_EXTERNAL_PARAM = [
    "FREQUENCY",
    "NOTE",
    //"VELOCITY"
];

function deserializeEnvelope(json) {
    return new Envelope(json.attack, json.decay, json.sustain, json.release);
}

class Envelope {
    attack;
    decay;
    sustain;
    release;

    constructor(attack, decay, sustain, release) {
        this.attack = attack;
        this.decay = decay;
        this.sustain = sustain;
        this.release = release;
    }

    start(startTime, param) {
        param.setValueAtTime(0, startTime);
        param.setTargetAtTime(1, startTime, this.attack / 5000);
        param.setTargetAtTime(this.sustain, startTime + this.attack / 1000, this.decay / 5000);
    }

    end(time, param) {
        param.cancelScheduledValues(time);
        param.setTargetAtTime(0, time, this.release / 5000);
    }
}

function valuesOf(o) {
    return Object.keys(o).map(function(k){return o[k]});
}

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

const FX_EVENTS = ['paramChange', 'valueChange', 'labelChange', 'connect', 'disconnect'];

class AudioNodeLabelChangeEvent extends Event {
    fx;
    label;

    constructor(fx, label) {
        super('labelChange', {cancelable: true});
        this.fx = fx;
        this.label = label;
    }
}

class AudioParamChangeEvent extends Event {
    fx;
    param;
    newValue;
    smooth;

    constructor(fx, param, value, smooth) {
        super('paramChange', {cancelable: true});

        this.fx = fx;
        this.param = param;
        this.newValue = value;
        this.smooth = smooth;
    }
}

class AudioValueChangeEvent extends Event {
    fx;
    value;
    newValue;

    constructor(fx, value, newValue) {
        super('valueChange', {cancelable: true});

        this.fx = fx;
        this.value = value;
        this.newValue = newValue;
    }
}

const labelListener = (e) => {
    const list = document.getElementsByClassName("name_" + e.fx.name);
    for(let i = 0; i < list.length; i++) {
        list.item(i).innerHTML = e.label;
    }
};

/**
 * Wrapper for every node in the webapi (why do we have no way to access data about connections?)
 */
class FX extends EventTarget {
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

    constructor(node, updateUILabels = true) {
        super();

        if(updateUILabels)
            this.addEventListener('labelChange', labelListener);

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
        if(this.fxtype in FX_DRAW) this.draw = () => FX_DRAW[this.fxtype](this.name);
        this.label = this.fxtype + "-" + this.name;
    }

    setValue(valueName, value) {
        if (this.dispatchEvent(new AudioValueChangeEvent(this, valueName, value))) {
            this.node[valueName] = value;
            return true;
        }
        return false;
    }

    setParam(param, value, smooth = false) {
        let ev = new AudioParamChangeEvent(this, param, value, smooth);
        if (this.dispatchEvent(ev)) {
            if (smooth)
                this.node[param].setTargetAtTime(ev.newValue, this.node.context.currentTime, uiChange);
            else
                this.node[param].value = ev.newValue;
            return true;
        }
        return false;
    }

    setLabel(label) {
        let ev = new AudioNodeLabelChangeEvent(this, label);
        if (this.dispatchEvent(ev)) {
            this.label = label;
            return true;
        }
        return false;
    }

    // inputs are {fx, idx, output} where idx is the id of input and output is the other node's output
    // outputs are {fx, idx, input} where idx is the id of output and input id the other node's input
    connect(fx, output = 0, input = 0) {
        if(fx.inputs[this.name + input] != undefined) {
            return false;
        }
        this.outputs.push({fx: fx, idx: output, input: input});
        fx.inputs[this.name + input] = {fx: this, idx: input, output: output};

        this.node.connect(fx.node, output, input);
        return fx;
    }

    // input params are {fx, param, output} where output is the other node's output
    // output params are {fx, param, output} where output is the id of output
    connectParam(fx, param, output = 0) {
        if(MODULATIONS[fx.fxtype].indexOf(param) === -1) throw new TypeError(param + " is not a param of the fx type " + fx.fxtype + " !");
        if(fx.inputParams[this.name + param + output] != undefined) {
            return false;
        }
        this.outputParams.push({fx: fx, param: param, idx: output});
        fx.inputParams[this.name + param + output] = {fx: this, param: param, output: output};
        this.node.connect(fx.node[param], output);
        return true;
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

    isParamConnected(param) {
        for(const k in this.inputParams) {
            if(this.inputParams[k].param == param) return true;
        }
        return false;
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

        this.filterConnections(((v) => v["idx"] == output), params ? ((v) => v["idx"] == output) : null);
    }

    disconnectOutputFx(fx, output, params = true) {
        if(params) {
            this.node.disconnect(fx, output);
            for(const v of this.outputParams) if(v["idx"] == output)
                this.node.disconnect(v["fx"].node[v["param"]], v["idx"]);
        } else
            this.node.disconnect(fx, output);

        this.filterConnections(((v) => v["idx"] == output && v["fx"] == fx), params ? ((v) => v["idx"] == output && v["fx"] == fx) : null);
    }

    disconnectFx(fx, params = true) {
        if(params) for(const v of this.outputParams) if(v["fx"] == fx)
            this.node.disconnect(fx.node[v["param"]]);
        this.node.disconnect(fx.node);
        this.filterConnections(((v) => v["fx"] == fx), params ? ((v) => v["fx"] == fx) : null);
    }

    filterConnections(filter, paramsFilter = null) {
        for(let k = 0; k < this.outputs.length;) {
            const v = this.outputs[k];
            if(!filter(v)) {
                k++;
                continue;
            }
            delete v.fx.inputs[this.name + v["input"]];
            this.outputs.splice(k, 1);
        }
        if(paramsFilter == null) return;
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

    disconnectInputs(params = true) {
        if(params) for(const k in this.inputParams) {
            const v = this.inputParams[k];
            v["fx"].disconnect(this.node[v.param]);
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
        this.filterConnections(((v) => v["fx"] == fx && v["idx"] == output && v["input"] == input), null);
    }

    copy(copyConnections = false) {
        let node, fx;
        // For special nodes that have parameters set at creation
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
            if(!MODULATIONS[this.fxtype].includes(v))
                fx.node[v] = this.node[v];
            else
                fx.node[v].value = this.node[v].value; // It is an audioparam

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

    serialize() {
        const params = {};

        for(let p of PARAMS[this.fxtype]) {
            if(p == "buffer")
                params[p] = {audioParam: false, value: null};
            else if(MODULATIONS[this.fxtype].includes(p))
                params[p] = {audioParam: true, value: this.node[p].value};
            else
                params[p] = {audioParam: false, value: this.node[p]};
        }
        return {type: this.fxtype, label: this.label, params: params};
    }
}

function deserializeFX(AC, json, updateUILabels = true) {
    let node = FX_TYPES[json.type];
    if(node === undefined) throw new Error("Invalid node type !");

    node = new node(AC);
    const res = new FX(node, updateUILabels);

    res.label = json.label;
    for(let k in json.params) {
        const val = json.params[k];
        if(val["audioParam"] === true) {
            res.node[k].value = val.value;
        } else if(json.type == "constant" && k == "data" && json.params["type"]["value"] === "ENVELOPE") {
            res.node[k] = new Envelope(val.value.attack, val.value.decay, val.value.sustain, val.value.release);
        } else if(json.type == "distortion" && k == "curve") {
            const arr = new Float32Array(Object.keys(val.value).length);
            for(let k2 in val.value) {
                arr[k2] = val.value[k2];
            }
            res.node[k] = arr;
        } else {
            res.node[k] = val.value;
        }
    }
    return res;
}


// Copies a list of fx and their connections, returns a dict with keys equal to the corresponding fx' uid
// This is useful for the monophonic fx graph
function copyFxs(...fxs) {
    const res = {};
    if(fxs.length == 0) return res;
    if(fxs.length == 1 && fxs[0].constructor === Array) fxs = fxs[0];
    for(const fx of fxs) {
        res[fx.name] = fx.copy();
    }

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
    defaultNodes;
    outputNode;

    AC;
    drawflow;

    constructor(context, drawflow, defaultFxs) {
        this.nodes = {};
        this.defaultNodes = {};
        this.outputNode = new FX(new GainNode(context));
        for(let n of defaultFxs) {
            if(this.defaultNodes[n.label] !== undefined) throw new Error("Default fxs must have different labels !");
            this.defaultNodes[n.label] = n;
        }

        this.drawflow = drawflow;
        this.AC = context;

        //this.drawflow = new Drawflow(null);

        //TODO connect the right output
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
            if(e == this.outputNode.gid) {
                this.outputNode.gid = this.drawflow.addNode("output", 1, 0, 1000, 0, "", {node: this.outputNode.name}, "Output", false);
                this.outputNode.disconnectInputs(false);
                return;
            }
            for(let k in this.defaultNodes) {
                if(this.defaultNodes[k].gid == e) {
                    this.defaultNodes[k].gid = 
                        this.drawflow.addNode(this.defaultNodes[k].name, this.defaultNodes[k].node.numberOfInputs, this.defaultNodes[k].node.numberOfOutputs,
                                300, 200, "", {node: this.defaultNodes[k].name}, "<span class='name_" + this.defaultNodes[k].name + "'>" + this.defaultNodes[k].label, false);
                    this.defaultNodes[k].disconnectInputs(false);
                    this.defaultNodes[k].disconnect();
                    for(let k2 in modulations) {
                        if(modulations[k2].in == this.defaultNodes[k] || modulations[k2].out == this.defaultNodes[k])
                            removeModulation(k2);
                    }
                    //TODO delete modulation if one is present
                    return;
                }
            }
            for(let k in this.nodes) {
                if(this.nodes[k].gid == e) {
                    this.deleteNode(k);
                    updateModUI(this.getAllNodes());
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

        let y = 0, x = 0;
        for(let k in this.defaultNodes) {
            this.defaultNodes[k].gid = this.drawflow.addNode(this.defaultNodes[k].name, this.defaultNodes[k].node.numberOfInputs, this.defaultNodes[k].node.numberOfOutputs,
                    x * 300, y * 100, "", {node: this.defaultNodes[k].name}, "<span class='name_" + this.defaultNodes[k].name + "'>" + this.defaultNodes[k].label + "</span>", false);

            this.nodes[this.defaultNodes[k].name] = this.defaultNodes[k];
            x++;
            if(x > 1) {
                x = 0;
                y++;
            }
        }
        this.outputNode.gid = this.drawflow.addNode(this.outputNode.name, 1, 0, 1000, 0, "", {node: this.outputNode.name}, "Output", false);

        for(let k in this.defaultNodes) {
            const node = this.defaultNodes[k];
            for(let k2 in node.outputs) {
                const conn = node.outputs[k2];
                this.drawflow.addConnection(node.gid, conn.fx.gid, 'output_1', 'input_1');
            }
        }

        this.nodes[this.outputNode.name] = this.outputNode;
    }

    connect(output) {
        return this.outputNode.connect(output);
    }

    connectGraphNode(input, output) {
        this.drawflow.addConnection(input.gid, output.gid, 'output_1', 'input_1');
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
        const fx = new FX(node);
        this.nodes[fx.name] = fx;
        fx.gid = this.drawflow.addNode(fx.name, node.numberOfInputs, node.numberOfOutputs, 0, 200, "", {node: fx.name},
                                        "<span class='name_" + fx.name + "'>" + fx.label + "</span>", false);
        return fx.gid;
    }

    deleteNode(name) {
        if(!(name in this.nodes)) return false;
        const fx = this.nodes[name];
        fx.disconnectInputs();
        fx.disconnectAll();
        fx.removeEventListener('labelChange', fx.graphListener);
        delete fx.graphListener;
        delete this.nodes[name];
        return true;
    }

    getAllNodes() {
        return valuesOf(this.nodes);
    }

    serialize() {
        const nodes = {};
        for(let k in this.nodes) nodes[k] = this.nodes[k].serialize();
        const pos = {};
        for(let k in this.nodes) {
            const node = this.drawflow.getNodeFromId(this.nodes[k].gid);
            pos[k] = {x: node.pos_x, y: node.pos_y};
        }
        const connections = {};
        for(let k in this.nodes) {
            for(let k2 in this.nodes[k].inputs) {
                const v = this.nodes[k].inputs[k2];
                if(nodes[v.fx.name] == undefined) continue;
                connections[this.nodes[k].name + ":" + v.fx.name] = {in: this.nodes[k].name, out: v.fx.name, input: v.idx, output: v.output};
            }
            for(let v of this.nodes[k].outputs) {
                if(nodes[v.fx.name] == undefined) continue;
                connections[v.fx.name + ":" + this.nodes[k].name] = {in: v.fx.name, out: this.nodes[k].name, input: v.input, output: v.idx};
            }
        }
        const defaults = [];
        for(let k in this.defaultNodes) {
            defaults.push({label:k, name: this.defaultNodes[k].name});
        }
        return {nodes: nodes, pos: pos, connections: connections, output: this.outputNode.name, defaultNodes: defaults};
    }

    deserialize(json) {
        for(let n in this.nodes) {
            if(n != this.outputNode.name) {
                this.drawflow.removeNodeId("node-" + this.nodes[n].gid);
                this.deleteNode(n);
            }
        }
        this.outputNode.disconnectAll();
        const nodes = {};
        for(let k in json.nodes) {
            if(k == json.output) continue;
            nodes[k] = deserializeFX(AC, json.nodes[k]);

            nodes[k].gid = this.drawflow.addNode(nodes[k].name, nodes[k].node.numberOfInputs, nodes[k].node.numberOfOutputs,
                json.pos[k].x, json.pos[k].y, "", {node: nodes[k].name}, "<span class='name_" + nodes[k].name + "'>" + nodes[k].label + "</span>", false);

            this.nodes[nodes[k].name] = nodes[k];
        }

        for(let k in json.connections) {
            const con = json.connections[k];
            if(con.in == json.output) {
                if(nodes[con.out] == undefined) continue;
                nodes[con.out].connect(this.outputNode, con.output, con.input);
                this.drawflow.addConnection(nodes[con.out].gid, this.outputNode.gid, 'output_' + String(con.output + 1), 'input_' + String(con.input + 1));
            } else {
                if(nodes[con.out] == undefined || nodes[con.in] == undefined) continue;
                nodes[con.out].connect(nodes[con.in], con.output, con.input);
                this.drawflow.addConnection(nodes[con.out].gid, nodes[con.in].gid, 'output_' + String(con.output + 1), 'input_' + String(con.input + 1));
            }
        }

        this.defaultNodes = {};
        for(let v of json.defaultNodes) {
            this.defaultNodes[v.label] = nodes[v.name];
        }
        return nodes;
    }
};