let modulations = {};

function getModulationNodes() {
    return Object.values(modulations).map((e) => e.amount);
}

function addModulation() {
    const inName = get("modIn").value;
    let inNode = fx.getAudioNode(inName);

    const outName = get("modOut").value;
    let outNode = fx.getAudioNode(outName);
    if(outNode == null) outNode = modulations[outName].amount;

    const param = get("modParam").value;
    if(inNode == null || outNode == null || !(MODULATIONS[outNode.fxtype].includes(param))) return;
    const labelListener = (e) => {
        const list = document.getElementsByClassName("name_" + e.fx.name);
        for(let i = 0; i < list.length; i++) {
            list.item(i).innerHTML = e.label;
        }
    };
    if(inNode.nameListener === undefined) {
        inNode.labelListener = labelListener;
        inNode.addEventListener('labelChange', inNode.labelListener);
    }
    if(outNode.nameListener === undefined) {
        outNode.labelListener = labelListener;
        outNode.addEventListener('labelChange', outNode.labelListener);
    }
    return addMod(inNode, outNode, param);
}

function addMod(inNode, outNode, param, label = null) {
    const row = get("mod").insertRow();
    const amount = new FX(new GainNode(AC));
    const uid = amount.name;
    amount.label = (label == null ? "mod_" + uid : label);
    modulations[uid] = {
        param: param,
        in: inNode,
        out: outNode,
        amount: amount
    };
    const upd = "onchange='updateModAmount(\"" + uid + "\")' " + "onmousemove='updateModAmount(\"" + uid + "\")'"
    const minCtr = "&nbsp;<input type='number' value='-1' style='width:3em' id='mod_min_" + uid + "' " + upd + "></input>";
    const maxCtr = " - <input type='number' value='1' style='width:3em' id='mod_max_" + uid + "' " + upd + "></input>";
    row.id = "mod_" + uid;
    row.insertCell().innerHTML = "<input onchange='setNodeLabel(\"" + amount.name + "\", this.value);' value=\"" + amount.label + "\"></input>";
    row.insertCell().innerHTML = '<span class="name_' + inNode.name + '">' + inNode.label + '</span>';
    row.insertCell().innerHTML = '<span class="name_' + outNode.name + '">' + outNode.label + "</span>" + " -> " + param;
    row.insertCell().innerHTML = drawParamUI(amount.node.gain.value, "mod_amount_" + uid, null, "updateModAmount('" + uid + "')", -1, 1, .01) + minCtr + maxCtr;
    row.insertCell().innerHTML = "<button onclick='removeModulation(\"" + uid + "\");'>DELETE</button>";

    inNode.connect(amount);
    amount.connectParam(outNode, param);
    return uid;
}

function updateModAmount(id) {
    get("mod_amount_" + id).min = get("mod_min_" + id).value;
    get("mod_amount_" + id).max = get("mod_max_" + id).value;
    modulations[id].amount.setParam('gain', get("mod_amount_" + id).value);
    get("value_mod_amount_" + id).innerHTML = get("mod_amount_" + id).value;
}

function removeModulation(id) {
    const mod = modulations[id];
    mod.amount.disconnect();
    get("mod").deleteRow(get("mod_" + id).rowIndex);

    delete modulations[id];
}

function listModulableNodes(nodes) {
    return nodes.filter((x) => MODULATIONS[x.fxtype].length != 0).concat(getModulationNodes());
}

function updateModUI(nodes) {
    get("modIn").innerHTML = nodes.map((x) => "<option value='" + x.name + "' class='name_" + x.name + "'>" + x.label + "</option>").join("");
    get("modOut").innerHTML = listModulableNodes(nodes).map((x) => "<option value='" + x.name + "' class='name_" + x.name + "'>" + x.label + "</option>").join("");

    getModUiParams();
}

function getModUiParams() {
    const name = get("modOut").value;
    let node = fx.getAudioNode(name);
    if(node == null) node = modulations[name].amount;

    const type = node.fxtype;
    get("modParam").innerHTML = MODULATIONS[type].map((x) => "<option value='" + x + "'>" + x + "</option>").join("");
}