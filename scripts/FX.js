class FXChain {
    inputNode;
    outputNode;
    nodes;

    constructor(context) {
        this.nodes = [];
        this.inputNode = new GainNode(context);
        this.outputNode = new GainNode(context);

        this.inputNode.connect(this.outputNode);
    }

    push_front(node) {
        this.inputNode.disconnect();
        this.inputNode.connect(node);

        if(this.nodes.length > 0) node.connect(this.nodes[0]);
        else node.connect(this.outputNode);

        this.nodes.unshift(node);
    }

    push_back(node) {
        if(this.nodes.length > 0) {
            this.nodes[this.nodes.length - 1].disconnect();
            this.nodes[this.nodes.length - 1].connect(node);
        } else {
            this.inputNode.disconnect();
            this.inputNode.connect(node);
        }

        node.connect(this.outputNode);
        this.nodes.push(node);
    }

    pop_front() {
        if(this.nodes.length == 0) return null; 
        this.nodes[0].disconnect();
        this.inputNode.disconnect();
        if(this.nodes.length == 1)
            this.inputNode.connect(this.outputNode);
        else
            this.inputNode.connect(this.nodes[1]);
        return this.nodes.shift();
    }

    pop_back() {
        if(this.nodes.length == 0) return null;
        this.nodes[this.nodes.length - 1].disconnect();
        if(this.nodes.length == 1)
            this.inputNode.connect(this.outputNode);
        else
            this.nodes[this.nodes.length - 2].connect(this.outputNode);
        return this.nodes.pop();
    }

    insert(pos, node) {
        if (pos >= this.nodes.length) return this.push_back(node);
        if (pos <= 0) return this.push_front(node);

        this.nodes[pos - 1].disconnect();
        this.nodes[pos - 1].connect(node);
        node.connect(this.nodes[pos]);
        this.nodes.splice(pos, 0, node);
        return node;
    }

    remove(pos) {
        if (pos >= this.nodes.length - 1) return this.pop_back();
        if (pos <= 0) return this.pop_front();
        this.nodes[pos - 1].disconnect();
        this.nodes[pos - 1].connect(this.nodes[pos + 1]);
        return this.nodes.splice(pos, 1)[0];
    }

    get(pos) {
        return this.nodes[pos];
    }

    getInput() {
        return this.inputNode;
    }

    getOutput() {
        return this.outputNode;
    }

    connect(node) {
        return this.outputNode.connect(node);
    }

    disconnect() {
        this.outputNode.disconnect();
    }
};

//import Drawflow from "drawflow";

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