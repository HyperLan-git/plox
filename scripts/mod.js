let modulations = {};

function addModulation() {
    const inName = get("modIn").value;
    let inNode = null;
    switch(inName) {
        case osc1.name:
            inNode = osc1;
            break;
        case osc2.name:
            inNode = osc2;
            break;
        case constantSource.name:
            inNode = constantSource;
            break;
        case freqConstant.name:
            inNode = freqConstant;
            break;
        default:
            inNode = fx.getAudioNode(inName);
            break;
    }

    const outName = get("modOut").value;
    let outNode = null;
    switch(outName) {
        case osc1.name:
            outNode = osc1;
            break;
        case osc2.name:
            outNode = osc2;
            break;
        case fx.getOutput().name:
            outNode = fx.getOutput();
            break;
        default:
            outNode = fx.getAudioNode(outName);
            break;
    }

    const param = get("modParam").value;
    if(inNode == null || outNode == null || !(MODULATIONS[outNode.fxtype].includes(param))) return;
    const row = get("mod").insertRow();
    const uid = uidGen(20);
    const amount = new FX(new GainNode(AC));
    amount.label = "mod_" + uid;
    modulations[uid] = {
        param: param,
        in: inNode,
        out: outNode,
        amount: amount
    };
    row.id = "mod_" + uid;
    row.insertCell().innerHTML = inNode.label;
    row.insertCell().innerHTML = outNode.label;
    row.insertCell().innerHTML = drawParamUI(amount.node.gain.value, "mod_amount_" + uid);
    row.insertCell().innerHTML = "<button onclick='removeModulation('" + uid + "');'></button>";

    inNode.connect(amount);
    amount.connectParam(outNode, param);
}

function updateModAmount() {

}

function removeModulation(id) {
    const mod = modulations[id];
    mod.in.disconnectParam(mod.out, mod.param);
    get("mod").deleteRow(get("mod_" + id).rowIndex);

    delete modulations[id];
}

function listModInputs(fx) {
    let res = [osc1, osc2, constantSource, freqConstant];
    return res.concat(fx.getAllNodes());
}

function listModulableNodes(fx) {
    let res = [osc1, osc2, fx.getOutput()];
    const others = fx.getAllNodes().filter((x) => MODULATIONS[x.fxtype].length != 0);
    return res.concat(others);
}

function updateModUI() {
    get("modIn").innerHTML = listModInputs(fx).map((x) => "<option value='" + x.name + "'>" + x.label + "</option>").join("");
    get("modOut").innerHTML = listModulableNodes(fx).map((x) => "<option value='" + x.name + "'>" + x.label + "</option>").join("");

    getModUiParams();
}

function getModUiParams() {
    const name = get("modOut").value;
    let node = null;
    switch(name) {
        case osc1.name:
            node = osc1;
            break;
        case osc2.name:
            node = osc2;
            break;
        case fx.getOutput().name:
            node = fx.getOutput();
            break;
        default:
            node = fx.getAudioNode(name);
            break;
    }
    const type = node.fxtype;
    get("modParam").innerHTML = MODULATIONS[type].map((x) => "<option value='" + x + "'>" + x + "</option>").join("");
}