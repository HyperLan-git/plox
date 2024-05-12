import { getModulationNodes } from "./mod.js";
let AC = null;
let fx = null;
let osc = {};
export function getAC() {
    return AC;
}
export function getFXGraph() {
    return fx;
}
export function noAudio() {
    return AC == null;
}
export function getAudioNode(name) {
    if (AC == null)
        return null;
    const mod = getModulationNodes();
    for (let k in mod)
        if (mod[k].name == name)
            return mod[k];
    return fx.getAudioNode(name);
}
export function getHighestOsc(name) {
    let max = -1;
    for (let k in osc) {
        if (max < Number(k))
            max = Number(k);
    }
    if (max !== -1)
        return osc[max][name];
    return null;
}
