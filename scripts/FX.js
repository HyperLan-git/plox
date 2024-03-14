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

class FXGraph {
    nodes;
    inputNode;
    outputNode;

    constructor(context) {
        nodes = {};
        this.inputNode = new GainNode(context);
        this.outputNode = new GainNode(context);
    }
};
/* TODO
make it easily clonable for multiple voices OR make automated channel splitting and merging when multiple keys are hit
*/