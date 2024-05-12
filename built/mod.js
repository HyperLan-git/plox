import { getAC, getFXGraph } from "./Audio.js";
import { FX, MODULATIONS } from "./FX.js";
import { drawParamUI } from "./FXUI.js";
import { get, getI, getS } from "./utils.js";
let modulations = {};
export function getModulationNodes() {
    return Object.keys(modulations).map((e) => modulations[e].amount);
}
function addModulation() {
    const inName = getS("modIn").value;
    let inNode = getFXGraph().getAudioNode(inName);
    const outName = getS("modOut").value;
    let outNode = getFXGraph().getAudioNode(outName);
    if (outNode == null)
        outNode = modulations[outName].amount;
    const param = getS("modParam").value;
    if (inNode == null || outNode == null || !(MODULATIONS[outNode.fxtype].includes(param)))
        return;
    return addMod(inNode, outNode, param);
}
export function addMod(inNode, outNode, param, label = null) {
    const row = get("mod").insertRow();
    const amount = new FX(new GainNode(getAC()));
    const uid = amount.name;
    amount.label = label !== null && label !== void 0 ? label : "mod_" + uid;
    modulations[uid] = {
        param: param,
        in: inNode,
        out: outNode,
        amount: amount
    };
    const upd = "onchange='updateModAmount(\"" + uid + "\")' " + "onmousemove='updateModAmount(\"" + uid + "\")'";
    const minCtr = "&nbsp;<input type='number' value='-1' style='width:3em' id='mod_min_" + uid + "' " + upd + "></input>";
    const maxCtr = " - <input type='number' value='1' style='width:3em' id='mod_max_" + uid + "' " + upd + "></input>";
    row.id = "mod_" + uid;
    row.insertCell().innerHTML = "<input onchange='setNodeLabel(\"" + amount.name + "\", this.value);' value=\"" + amount.label + "\"></input>";
    //TODO event listener pattern...
    row.insertCell().innerHTML = inNode.label;
    row.insertCell().innerHTML = outNode.label + " -> " + param;
    row.insertCell().innerHTML = drawParamUI(amount.node.gain.value, "mod_amount_" + uid, null, "updateModAmount('" + uid + "')", -1, 1, .01) + minCtr + maxCtr;
    row.insertCell().innerHTML = "<button onclick='removeModulation(\"" + uid + "\");'>DELETE</button>";
    inNode.connect(amount);
    amount.connectParam(outNode, param);
    return uid;
}
function updateModAmount(id) {
    getI("mod_amount_" + id).min = getI("mod_min_" + id).value;
    getI("mod_amount_" + id).max = getI("mod_max_" + id).value;
    modulations[id].amount.node.gain.value = getI("mod_amount_" + id).value;
    get("value_mod_amount_" + id).innerHTML = getI("mod_amount_" + id).value;
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
export function updateModUI(nodes) {
    get("modIn").innerHTML = nodes.map((x) => "<option value='" + x.name + "'>" + x.label + "</option>").join("");
    get("modOut").innerHTML = listModulableNodes(nodes).map((x) => "<option value='" + x.name + "'>" + x.label + "</option>").join("");
    getModUiParams();
}
function getModUiParams() {
    const name = getI("modOut").value;
    let node = getFXGraph().getAudioNode(name);
    if (node == null)
        node = modulations[name].amount;
    const type = node.fxtype;
    get("modParam").innerHTML = MODULATIONS[type].map((x) => "<option value='" + x + "'>" + x + "</option>").join("");
}
