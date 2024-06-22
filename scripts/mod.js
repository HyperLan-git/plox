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
    return addMod(fx.getAllNodes(), inNode, outNode, param);
}

function getModOutSelector(nodes, outNode = null) {
    return listModulableNodes(nodes).map((x) => "<option value='" + x.name + "' class='name_" + x.name + "' "  + (x.name == outNode ? 'selected':'') + ">" + x.label + "</option>").join("");
}

function getModInSelector(nodes, inNode = null) {
    return nodes.map((x) => "<option value='" + x.name + "' class='name_" + x.name + "' "  + (x.name == inNode ? 'selected':'') + ">" + x.label + "</option>").join("");
}

function getModParamSelector(outNode, param = null) {
    let node = fx.getAudioNode(outNode);
    if(node == null) node = modulations[outNode].amount;

    const type = node.fxtype;
    return MODULATIONS[type].map((x) => "<option value='" + x + "' " + (param == x ? 'selected' : '') + ">" + x + "</option>").join("");
}

function addMod(nodes, inNode, outNode, param, label = null) {
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
    row.insertCell().innerHTML = "<select id='modin_" + uid + "' onchange='updateMod(\"" + uid + "\")'>" + getModInSelector(nodes, inNode.name) + "</select>";
    row.insertCell().innerHTML = "<select id='modout_" + uid + "' onchange='updateMod(\"" + uid + "\")'>" + getModOutSelector(nodes, outNode.name) + "</select> -> <select id='modparam_" + uid + "' onchange='updateMod(\"" + uid + "\")'>" + getModParamSelector(outNode.name, param) + "</select>";
    row.insertCell().innerHTML = drawParamUI(amount.node.gain.value, "mod_amount_" + uid, null, "updateModAmount('" + uid + "')", -1, 1, .01) + minCtr + maxCtr;
    row.insertCell().innerHTML = "<button onclick='removeModulation(\"" + uid + "\");'>DELETE</button>";

    inNode.connect(amount);
    amount.connectParam(outNode, param);
    return uid;
}

function updateMod(id) {
    modulations[id].in.disconnect(modulations[id].amount);
    modulations[id].amount.disconnectParam(modulations[id].out, modulations[id].param);

    const param = get("modparam_" + id).value;

    get("modparam_" + id).innerHTML = getModParamSelector(get("modout_" + id).value, param);
    modulations[id].in = fx.getAudioNode(get("modin_" + id).value);
    modulations[id].out = getAudioNode(get("modout_" + id).value);
    modulations[id].param = get("modparam_" + id).value;

    modulations[id].in.connect(modulations[id].amount);
    modulations[id].amount.connectParam(modulations[id].out, modulations[id].param);
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
    updateModUI(fx.getAllNodes());
}

function listModulableNodes(nodes) {
    return nodes.filter((x) => MODULATIONS[x.fxtype].length != 0).concat(getModulationNodes());
}

function updateModUI(nodes) {
    get("modIn").innerHTML = getModInSelector(nodes);
    get("modOut").innerHTML = getModOutSelector(nodes);

    for(let id in modulations) {
        get("modin_" + id).innerHTML = getModInSelector(nodes, modulations[id].in.name);
        get("modout_" + id).innerHTML = getModOutSelector(nodes, modulations[id].out.name);
    }
    getModUiParams();
}

function getModUiParams() {
    const name = get("modOut").value;
    let node = fx.getAudioNode(name);
    if(node == null) node = modulations[name].amount;

    const type = node.fxtype;
    get("modParam").innerHTML = MODULATIONS[type].map((x) => "<option value='" + x + "'>" + x + "</option>").join("");
}

function serializeModulations() {
    const res = [];
    for(let k in modulations) {
        res.push({
            param: modulations[k].param,
            in: modulations[k].in.name,
            out: modulations[k].out.name,
            amount: modulations[k].amount.node.gain.value,
            label: modulations[k].amount.label
        });
    }
    return res;
}

function deserializeModulations(nodes, mods) {
    for(let k in modulations) {
        removeModulation(k);
    }
    for(let k in mods) {
        const m = mods[k];
        const uid = addMod(nodes, nodes[m.in], nodes[m.out], m.param, m.label);
        modulations[uid].amount.node.gain.value = m.amount;
        if(m.amount > 1) {
            get("mod_max_" + uid).value = Math.ceil(m.amount);
            get("mod_amount_" + uid).max = Math.ceil(m.amount);
        } else if(m.amount < -1) {
            get("mod_min_" + uid).value = Math.floor(m.amount);
            get("mod_amount_" + uid).min = Math.floor(m.amount);
        }
        get("mod_amount_" + uid).value = m.amount;
        updateModAmount(uid);
    }
    updateModUI(nodes);
}