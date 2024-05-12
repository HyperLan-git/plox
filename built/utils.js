export function get(id) {
    return document.getElementById(id);
}
export function getI(id) {
    return get(id);
}
export function getS(id) {
    return get(id);
}
export function getMousePos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
export function lerp(val, start, end) {
    return (1 - val) * start + val * end;
}
export function linearToLog(val, min, max) {
    // TODO simplify or memoize
    let b = Math.log10(min / max) / (min - max), a = max / Math.pow(10, b * max);
    return Math.log10(val / a) / b;
}
export function logToLinear(val, min, max) {
    // TODO simplify or memoize
    let b = Math.log10(min / max) / (min - max), a = max / Math.pow(10, b * max);
    return Math.pow(10, val * b) * a;
}
export function dbToRatio(db) {
    return Math.pow(10, db / 20);
}
export function ratioToDB(r) {
    return Math.log10(r) * 20;
}
export function valuesOf(o) {
    return Object.keys(o).map(function (k) { return o[k]; });
}
export function uidGen(length) {
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
const SEMITONE_PITCH = Math.pow(2, 1. / 12);
export function getNoteFreq(midiPitch) {
    let result = 1;
    while (midiPitch < 69 - 6) {
        midiPitch += 12;
        result /= 2.;
    }
    while (midiPitch > 69 + 6) {
        midiPitch -= 12;
        result *= 2;
    }
    return result * Math.pow(SEMITONE_PITCH, midiPitch - 69) * 440;
}
