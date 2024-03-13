"use strict"

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

/* TODO
make it easily clonable for multiple voices OR make automated channel splitting and merging when multiple keys are hit
class FXTable {

}*/

// TODO understand wtf is an audio worklet

let AC = new AudioContext();

let masterFader = new GainNode(AC),
    masterLimiter = new WaveShaperNode(AC),
    masterOscilloscope = new AnalyserNode(AC),
    masterFFTAnalyser = new AnalyserNode(AC);

let noiseOsc = null;
let noiseBuf = null;

let chain1 = new FXChain(AC);
let openNode = null;

function get(id) {
    return document.getElementById(id);
}

function getMousePos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {x: e.clientX - rect.left, y: e.clientY - rect.top};
}

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

function initAudio() {
    AC = new AudioContext();

    masterFader = new GainNode(AC);
    masterLimiter = new WaveShaperNode(AC);
    masterFFTAnalyser = new AnalyserNode(AC);
    masterOscilloscope = new AnalyserNode(AC);

    masterFader.gain.value = 0;
    masterFFTAnalyser.fftSize = 4096;
    masterOscilloscope.fftSize = 512;
    masterLimiter.curve = new Float32Array([-1, 0, 1]); // Probably not meant to be used as a clipper but idc

    masterFader.connect(masterLimiter).connect(masterFFTAnalyser).connect(masterOscilloscope).connect(AC.destination);

    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);

    // White noise for now
    for(let i = 0; i < noiseBuf.length; i++)
        noiseBuf.getChannelData(0)[i] = Math.random() * 2 - 1;

    chain1 = new FXChain(AC);
    chain1.connect(masterFader);
}

function gainChanged(name) {
    if(AC === null) return;
    const val = get('fader_' + name).value;
    get("fadervalue_" + name).innerHTML = val + " db";
    openNode.gain.setValueAtTime(dbToRatio(val), AC.currentTime);
}

function drawGain() {
    const name = this.name;
    const val = Math.round(ratioToDB(openNode.gain.value) * 10) / 10;
    return {
        html: '<input type="range" id="fader_' + name + '" min="-40" max="3" step="0.1" value="' + val + '"' +
        'onchange="gainChanged(\'' + name + '\');" onmousemove="gainChanged(\'' + name + '\');"' +
        '/><span id="fadervalue_' + name + '">' + val + ' db</span><br>'
    };
}

function delayChanged(name) {
    if(AC === null) return;
    const val = get('delay_' + name).value;
    get("delayvalue_" + name).innerHTML = val + " ms";
    openNode.delayTime.setValueAtTime(val / 1000, AC.currentTime);
}

function drawDelay() {
    const name = this.name;
    const val = openNode.delayTime.value * 1000;
    return {
        html: '<input type="range" id="delay_' + name + '" min="0" max="500" step="0.1" value="' + val + '"' +
        'onchange="delayChanged(\'' + name + '\');" onmousemove="delayChanged(\'' + name + '\');"' +
        '/><span id="delayvalue_' + name + '">' + val + ' ms</span><br>'
    };
}

function drawDistortion() {
    const name = this.name;

    // TODO find a way to implement bitcrusher
    return {
        html: 'Curve <canvas id="waveshaper_' + name + '" width="200" height="200" ' +
        'onmousedown="updateDistortionCurve(event)" onmousemove="updateDistortionCurve(event);" onmouseup="updateDistortionCurve(event);"></canvas><br>' +
        'Symmetrical : <input type="checkbox" id="symmetry_' + name + '" checked></input><br>' +
        'Presets : <select id="distselect_' + name + '" onchange="setDistortion(this.value);">' +
        '<option value="" selected disabled hidden>Distortion shape</option>' +
        '<option value="overdrive">Overdrive</option>' +
        '<option value="clip">Hard clip</option>' +
        '<option value="sine">Sine x2</option>' +
        '<option value="fold">Triangle fold</option>' +
        '</select><br>' +
        'Arbitrary function (WARNING : USES EVAL) f(x) -> <input type="text" id="distf_' + name + '" onchange="distortionFunction(this.value, get(\'distfcount_' + name + '\').value);"></input> Points : <input type="number" id="distfcount_' + name + '"></input>' +
        'Oversampling : <select id="oversample_' + name + '" ' +
        'onchange="distortionChanged(\'' + name + '\');">' +
        '<option value="none">None</option>' +
        '<option value="2x">2x</option>' +
        '<option value="4x">4x</option>' +
        '</select><br>',
        canvas: updateDistortionCurve
    };
}

function setDistortion(preset) {
    let arr = null;
    switch(preset) {
        case "overdrive":
            distortionFunction("Math.tanh(Math.PI * x)", 40);
            break;
        case "clip":
            arr = new Float32Array([-1, -1, -1, -1, 0, 1, 1, 1, 1]);
            openNode.curve = arr;
            updateDistortionCurve();
            break;
        case "sine":
            distortionFunction("Math.sin(2 * Math.PI * x)", 151);
            break;
        case "fold":
            arr = new Float32Array([0, -1, 0, 1, 0]);
            openNode.curve = arr;
            updateDistortionCurve();
            break;
        default:
    }
}

function distortionFunction(func, n) {
    try {
        let arr = new Float32Array(n);
        for(let i = 0; i < n; i++) {
            let x = i * 2 / n - 1;
            arr[i] = eval(func);
            if(arr[i] > 1) arr[i] = 1;
            if(arr[i] < -1) arr[i] = -1;
        }
        openNode.curve = arr;
    } catch (e) {
        console.log("Your function was invalid : " + e);
    }
    updateDistortionCurve();
}

function distortionChanged(name) {
    if(AC === null) return;
    const val = get('oversample_' + name).value;
    openNode.oversample = val;
}

let mbuttons = [];

function createDistortionCurve(e, canvas) {
    let curve = openNode.curve;
    if(curve === null) curve = new Float32Array([-1, 0, 1]);
    const hh = canvas.height / 2, w = canvas.width;
    const pos = getMousePos(canvas, e);
    const idx = Math.round(pos.x / w * (curve.length - 1));
    const symmetry = get("symmetry_" + openNode.name).checked;
    switch(e.type) {
        case "mousemove":
            if(mbuttons[e.button] && e.button === 0) {
                curve[idx] = 1 - pos.y / hh;
                if(symmetry && idx != curve.length / 2 - .5)
                    curve[curve.length - idx - 1] = -curve[idx];
                return curve;
            }
            return null;
        case "mousedown":
            if(e.ctrlKey) {
                let newArr = null;
                if(e.button === 0) {
                    newArr = new Float32Array(curve.length + 1);
                    newArr[idx] = 1 - (pos.y / hh);
                    for(let i = 0; i < idx; i++)
                        newArr[i] = curve[i];
                    for(let i = idx + 1; i < newArr.length; i++)
                        newArr[i] = curve[i - 1];
                    if(symmetry) {
                        if(idx !== newArr.length / 2 - .5) newArr[newArr.length - idx - 1] = -newArr[idx];
                        for(let i = 0; i < newArr.length / 2; i++)
                            newArr[newArr.length - i - 1] = -newArr[i];
                    }
                } else if(e.button === 2) {
                    newArr = new Float32Array(curve.length - 1);
                    newArr[idx] = pos.y / hh - 1;
                    for(let i = 0; i < idx; i++)
                        newArr[i] = curve[i];
                    for(let i = idx + 1; i < curve.length; i++)
                        newArr[i - 1] = curve[i];
                    if(symmetry) {
                        for(let i = 0; i < newArr.length / 2; i++)
                            newArr[newArr.length - i - 1] = -newArr[i];
                    }
                }
                return newArr;
            } else if(e.button === 0) {
                mbuttons[e.button] = true;
                curve[idx] = 1 - pos.y / hh;
                if(symmetry && idx != curve.length / 2 - .5)
                    curve[curve.length - idx - 1] = -curve[idx];
                return curve;
            }
            return null;
        case "mouseup":
            mbuttons[e.button] = false;
            return null;
        default:
            return null;
    }
}

//TODO this should not handle mouse events
function updateDistortionCurve(e = null) {
    if(AC === null) return;

    const canvas = get("waveshaper_" + openNode.name);
    if(canvas === null) return;
    const hh = canvas.height / 2, h = canvas.height,
            w = canvas.width;
    if(e !== null) {
        const newArr = createDistortionCurve(e, canvas);
        if(newArr !== null) openNode.curve = newArr;
    }
    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();
    ctx.clearRect(0, 0, w, h);

    let curve = openNode.curve || new Float32Array([-1, 0, 1]);
    ctx.strokeStyle = "red";
    ctx.fillStyle = "red";
    ctx.beginPath();
    const y0 = h - (curve[0] * hh + hh);
    ctx.moveTo(0, y0);
    ctx.fillRect(0, y0-2, 2, 4);
    for(let i = 1; i < curve.length; i++) {
        const x = i * w / (curve.length - 1),
            y = h - (curve[i] * hh + hh);
        ctx.fillRect(x-2, y-2, 4, 4);
        ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function drawBFilter() {
    const name = this.name;
    const type = this.type;

    return {
        html: "Graphical eq <canvas id='beq_" + name +"' width='400' height='300' " +
            "onmousedown='updateBFilter(event);' onmousemove='updateBFilter(event);' onmouseup='updateBFilter(event);'></canvas><br>" +
            "Type : <select id='beqtype_" + name + "' onchange='updateBFilter();'>" +
            "<option value='allpass'" + (type == 'allpass' ? 'selected' : '') + ">All-pass</option>" +
            "<option value='bandpass'" + (type == 'bandpass' ? 'selected' : '') + ">Band-pass</option>" +
            "<option value='highpass'" + (type == 'highpass' ? 'selected' : '') + ">High-pass 12db</option>" +
            "<option value='lowpass'" + (type == 'lowpass' ? 'selected' : '') + ">Low-pass 12db</option>" +
            "<option value='highshelf'" + (type == 'highshelf' ? 'selected' : '') + ">High-shelf</option>" +
            "<option value='lowshelf'" + (type == 'lowshelf' ? 'selected' : '') + ">Low-shelf</option>" +
            "<option value='notch'" + (type == 'notch' ? 'selected' : '') + ">Notch</option>" +
            "<option value='peaking'" + (type == 'peaking' ? 'selected' : '') + ">Peak</option>" +
            "</select> - Freq : <em id='beqfreq_" + name + "'>" + this.frequency.value + "</em> Hz " +
            "- Gain : <em id='beqgain_" + name + "'>" + this.gain.value + "</em> db " +
            "- Q : <input type='range' id='beqfactor_" + name + "' " +
            "onchange='updateBFilter();' onmousemove='updateBFilter();' min='0.1' max='10' step='0.1' value='" + this.Q.value + "'></input> " +
            "<em id='beqfactorval_" + name + "'>" + this.Q.value + "</em>",
        canvas: drawBFilterEQ
    };
}

function updateBFilter(e = null) {
    if(AC === null) return;
    const name = openNode.name;

    if(e !== null) {
        const canvas = get("beq_" + name);
        const h = canvas.height,
            w = canvas.width;
        const pos = getMousePos(get("beq_" + name), e);
        if(e.type === 'mousedown' || (e.type === "mousemove" && mbuttons[0])) {
            mbuttons[e.button] = true;
            // One digit after decimal point
            openNode.frequency.value = Math.round(10 * (logToLinear(pos.x, 1, w) - 1) / 2 * AC.sampleRate / w) / 10;
            openNode.gain.value = Math.round(-10 * (pos.y / h * 80 - 40)) / 10;
            get("beqfreq_" + name).innerHTML = Math.round(openNode.frequency.value * 10) / 10;
            get("beqgain_" + name).innerHTML = Math.round(openNode.gain.value * 10) / 10;
        } else if(e.type === "mouseup")
            mbuttons[e.button] = false;
    }

    openNode.Q.value = get("beqfactor_" + name).value;
    get("beqfactorval_" + name).innerHTML = get("beqfactor_" + name).value;
    openNode.type = get("beqtype_" + name).value;
    drawBFilterEQ();
}

function drawBFilterEQ() {
    if(AC === null) return;

    const canvas = get("beq_" + openNode.name);
    if(canvas === null) return;
    const hh = canvas.height / 2, h = canvas.height,
            w = canvas.width;

    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "orange";
    ctx.strokeStyle = "rgb(151, 98, 0)";
    ctx.lineWidth = 3;
    const xF = linearToLog((openNode.frequency.value * w / AC.sampleRate * 2) + 1, 1, w),
            xLow = linearToLog(((openNode.frequency.value / 3.33) * w / AC.sampleRate * 2) + 1, 1, w), // Where a highpass would fall to -40
            xHigh = linearToLog(((openNode.frequency.value * 3.33) * w / AC.sampleRate * 2) + 1, 1, w);
    const gain = openNode.gain.value * 5; // 5px per db
    switch(openNode.type) {
        case "allpass":
            ctx.fillStyle = "cyan";
            ctx.strokeStyle = "blue";
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(0, hh);
            ctx.lineTo(xLow, hh);
            ctx.lineTo(xF, 0);
            ctx.lineTo(xF, h);
            ctx.lineTo(xHigh, hh);
            ctx.lineTo(w, hh);
            ctx.lineTo(w, h);
            ctx.fill();
            ctx.stroke();
            break;
        case "bandpass":
            ctx.beginPath();
            ctx.moveTo((xF + xLow) / 2, h);
            ctx.lineTo(xF, hh);
            ctx.lineTo((xF + xHigh) / 2, h);
            ctx.fill();
            ctx.stroke();
            break;
        case "highpass":
            ctx.beginPath();
            ctx.moveTo(xLow, h);
            ctx.lineTo(xF, hh);
            ctx.lineTo(w, hh);
            ctx.lineTo(w, h);
            ctx.fill();
            ctx.stroke();
            break;
        case "highshelf":
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(0, hh);
            ctx.lineTo((xF + xLow) / 2, hh);
            ctx.lineTo((xF + xHigh) / 2, hh - gain);
            ctx.lineTo(w, hh - gain);
            ctx.lineTo(w, h);
            ctx.fill();
            ctx.stroke();
            break;
        case "lowpass":
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(0, hh);
            ctx.lineTo(xF, hh);
            ctx.lineTo(xHigh, h);
            ctx.fill();
            ctx.stroke();
            break;
        case "lowshelf":
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(0, hh - gain);
            ctx.lineTo((xF + xLow) / 2, hh - gain);
            ctx.lineTo((xF + xHigh) / 2, hh);
            ctx.lineTo(w, hh);
            ctx.lineTo(w, h);
            ctx.fill();
            ctx.stroke();
            break;
        case "notch":
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(0, hh);
            ctx.lineTo((xF + xLow) / 2, hh);
            ctx.lineTo(xF, h);
            ctx.lineTo((xF + xHigh) / 2, hh);
            ctx.lineTo(w, hh);
            ctx.lineTo(w, h);
            ctx.fill();
            ctx.stroke();
            break;
        case "peaking":
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(0, hh);
            ctx.lineTo((xF + xLow) / 2, hh);
            ctx.lineTo(xF, hh - gain);
            ctx.lineTo((xF + xHigh) / 2, hh);
            ctx.lineTo(w, hh);
            ctx.lineTo(w, h);
            ctx.fill();
            ctx.stroke();
            break;
        default:
    }
}

function drawCompressor() {
    const name = this.name;
    const upd = "onchange='updateCompressor();' onmousemove='updateCompressor();'";

    return {
        html: "Current reduction : <canvas id='comgraph_" + name + "' width='70' height='200'></canvas><br>" +
        "Attack : <input " + upd + " id='comattack_" + name + "' type='range' min='0' max='1000' step='1' value='" + Math.round(this.attack.value * 1000) + "'></input><br>" +
        "Knee : <input " + upd + " id='comknee_" + name + "' type='range' min='0' max='40' step='.1' value='" + this.knee.value + "'></input><br>" +
        "Ratio : <input " + upd + " id='comratio_" + name + "' type='range' min='1' max='20' step='0.1' value='" + this.ratio.value + "'></input><br>" +
        "Release : <input " + upd + " id='comrelease_" + name + "' type='range' min='0' max='1000' step='1' value='" + Math.round(this.release.value * 1000) + "'></input><br>" +
        "Threshold : <input " + upd + " id='comthreshold_" + name + "' type='range' min='-40' max='0' step='0.1' value='" + this.threshold.value + "'></input><br>",
        canvas: () => { drawCompressorCanvas(); updateCompressorCanvas(name); }
    };
}

function updateCompressor() {
    if(AC === null) return;
    const name = openNode.name;

    openNode.attack.value = get('comattack_' + name).value / 1000;
    openNode.knee.value = get('comknee_' + name).value;
    openNode.ratio.value = get('comratio_' + name).value;
    openNode.release.value = get('comrelease_' + name).value / 1000;
    openNode.threshold.value = get('comthreshold_' + name).value;
}

function drawCompressorCanvas() {
    if(AC === null) return;
    const name = openNode.name;

    const canvas = get("comgraph_" + name);
    if(canvas === null) return;
    const h = canvas.height, w = canvas.width;

    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "black";
    ctx.strokeStyle = "black";
    ctx.fillRect(20, 0, w - 20, h);

    for(let i = 0; i < 10; i++) {
        const y = i / 10 * h;
        ctx.lineWidth = 1;
        ctx.strokeText("" + i, 5, y + 10);

        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(15, y);
        ctx.lineTo(20, y);
        ctx.stroke();
    }
}

function updateCompressorCanvas(name) {
    if(AC === null) return;
    if(openNode === null) return;
    if(openNode.name !== name) return;

    const canvas = get("comgraph_" + name);
    if(canvas === null) return;
    const h = canvas.height,
            w = canvas.width;

    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();

    ctx.clearRect(20, 20, w, h);
    ctx.fillStyle = "black";
    ctx.fillRect(20, 0, w - 20, h);

    const y = -openNode.reduction / 20 * h;
    ctx.fillStyle = "green";
    ctx.fillRect(20, 0, w - 20, y);

    setTimeout(() => updateCompressorCanvas(name), .2); // 5hz refresh rate
}

function panToText(pan) {
    if(pan == 0) return 'M';
    if(pan < 0) return Math.round(pan * -100) + '% L';
    return Math.round(pan * 100) + '% R';
}

function drawPanner() {
    if(AC === null) return;
    const name = this.name;

    return {
        html: "Pan : <input onchange='updatePanner()' onmousemove='updatePanner()'" +
        "type='range' min='-1' max='1' step='0.05' id='pan_" + name + "' value='" + this.pan.value + "'></input> <em id='panval_" + name + "'>" + panToText(this.pan.value) + "</em>"
    };
}

function updatePanner() {
    if(AC === null) return;

    const name = openNode.name;
    openNode.pan.value = get('pan_' + name).value;
    get('panval_' + name).innerHTML = panToText(openNode.pan.value);
}

function drawAnalyser() {
    if(AC === null) return;
    const name = this.name;

    const fftSize = this.fftSize;
    return {
        html: "<canvas id='analyser_" + name + "' width='600' height='450'></canvas>" +
        "Type : <select id='analysertype_" + name + "' onchange='updateAnalyser();'><option value='fft'>Spectrum</option><option value='oscilloscope'>Oscilloscope</option></select><br>" +
        "FFT size : 2^<input onchange='updateAnalyser();' type='number' id='analysersize_" + name + "' min='5' max='15' step='1' value='" + Math.round(Math.log2(fftSize)) + "'></input><br>" +
        "Db range : <input onchange='updateAnalyser();' type='number' id='analysermin_" + name + "' min='-100' max='0' value='" + this.minDecibels + "'></input> - " +
        "<input onchange='updateAnalyser();' type='number' min='-100' max='0' id='analysermax_" + name + "' value='" + this.maxDecibels + "'></input><br>" +
        "Smoothing <input onchange='updateAnalyser();' onmousemove='updateAnalyser()' id='analysersmooth_" + name + "' type='range' min='0' max='1' step='0.01' value='" + this.smoothingTimeConstant + "'></input><br>" +
        "Slope <input type='range' id='analyserslope_" + name + "' min='0' max='50' value='25'></input>",
        canvas: () => { drawAnalyserCanvas(); updateAnalyserCanvas(name); }
    };
}

function updateAnalyser() {
    if(AC === null) return;

    const name = openNode.name;
    openNode.fftSize = Math.pow(2, get("analysersize_" + name).value);
    openNode.minDecibels = get("analysermin_" + name).value;
    openNode.maxDecibels = get("analysermax_" + name).value;
    openNode.smoothingTimeConstant = get("analysersmooth_" + name).value;
    drawAnalyserCanvas();
}

function drawAnalyserCanvas() {
    if(AC === null) return;

    const canvas = get("analyser_" + openNode.name);
    if(canvas === null) return;
    const h = canvas.height,
           ww = canvas.width / 2, w = canvas.width;

    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();

    ctx.clearRect(0, h * .95, w, h);

    if(get("analysertype_" + openNode.name).value == 'fft') {
        const HZ_SCALE = [5, 12, 32, 55, 90, 140, 210, 310, 440, 610, 900, 1250, 1700, 2400, 3400, 4800, 6700, 9500, 13500, 19000];
        ctx.lineWidth = 1;
        ctx.strokeStyle = "black";
        ctx.strokeText("Hz", ww, h - 12);
        for(let i = 0; i < 20; i++) {
            let x = i * w / 20 + 10;
            ctx.strokeText("" + HZ_SCALE[i], x, h - 2);
        }
    } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "black";
        ctx.strokeText("ms", ww, h-12);
        for(let i = 0; i < 20; i++) {
            let x = i * w / 20 + 10;
            ctx.strokeText("" + Math.floor(i * (1000 / AC.sampleRate * openNode.fftSize)), x, h - 2);
        }
    }
}

function updateAnalyserCanvas(name) {
    if(AC === null) return;
    if(openNode === null) return;
    if(openNode.name !== name) return;

    const canvas = get("analyser_" + name);
    if(canvas === null) return;

    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();
    const hh = canvas.height / 2, h = canvas.height,
        w = canvas.width;

    ctx.clearRect(0, 0, w, h * .95);

    ctx.fillStyle = "grey";
    ctx.fillRect(0, 0, w, h * .9);
    const slope = get('analyserslope_' + name).value;
    if(get("analysertype_" + openNode.name).value == 'fft') {
        const arr = new Float32Array(openNode.frequencyBinCount);
        const width = w / arr.length;
        openNode.getFloatFrequencyData(arr);
        ctx.fillStyle = "red";
        for(let i = 0; i < arr.length; i++) {
            let y = -(arr[i] - openNode.minDecibels) / (openNode.maxDecibels - openNode.minDecibels) * h * .9 + h * .9;
            let x1 = linearToLog(i * width + 1, 1, w),
                x2 = linearToLog((i + 1) * width + 1, 1, w);
            y -= (x1 + x2) / w * h * .9 / (openNode.maxDecibels - openNode.minDecibels) * slope; // The higher frequencies' slope
            if(!isFinite(y) || y >= h * .9) y = h * .9;
            ctx.fillRect(x1, y, x2 - x1, h * .9 - y);
        }
    } else {
        const arr = new Float32Array(openNode.fftSize);
        openNode.getFloatTimeDomainData(arr);

        ctx.lineWidth = 2;
        ctx.strokeStyle = "yellow";
        ctx.beginPath();
        let y = arr[0] * hh * .9 + hh * .9;
        if(y >= h * .9) y = h * .9;
        ctx.moveTo(0, y);
        for(let i = 1; i < w; i++) {
            y = arr[Math.floor(arr.length * i / w)] * hh * .9 + hh * .9;
            if(y >= h * .9) y = h * .9
            ctx.lineTo(i, y);
        }
        ctx.stroke();
    }
    setTimeout(() => updateAnalyserCanvas(name), 1/30); // 30hz refresh rate
}

function drawConvolver() {
    if(AC === null) return;
    const name = this.name;

    return {
        html: "Convolution : <button onclick='updateConvolverBuffer()'>Choose Impulse Response</button><br>" +
        "Normalize ? <input onchange='updateConvolver()' type='checkbox' " + (this.normalize ? 'checked' : '') + " id='convnorm_" + name + "'>"
    };
}

async function updateConvolverBuffer() {
    if(AC === null) return;
    if(openNode === null) return;

    const pickerOpts = {
        types: [
            {
                description: "Audio wav file",
                accept: {
                    "audio/wav": [".wav"],
                },
            },
        ],
        excludeAcceptAllOption: true,
        multiple: false
    };

    const contents = await window.showOpenFilePicker(pickerOpts).then((handle) => {
        return handle[0].getFile().then((file) => file.arrayBuffer());
    });

    openNode.buffer = await AC.decodeAudioData(contents);
}

function updateConvolver() {
    if(AC === null) return;
    if(openNode === null) return;

    const name = openNode.name;
    openNode.normalize = get("convnorm_" + name).checked;
}

function addFx(type) {
    const FX_TYPES = {
        "gain": GainNode,
        "biquadfilter": BiquadFilterNode,
        //"filter": IIRFilterNode,
        "distortion": WaveShaperNode,
        "convolver": ConvolverNode,
        "delay": DelayNode,
        "compressor": DynamicsCompressorNode,
        "stereopanner": StereoPannerNode,
        "channelmerger": ChannelMergerNode,
        "channelsplitter": ChannelSplitterNode,
        "analyser": AnalyserNode
    },
    FX_DRAW = {
        "gain": drawGain,
        "delay": drawDelay,
        "distortion": drawDistortion,
        "biquadfilter": drawBFilter,
        "compressor": drawCompressor,
        "stereopanner": drawPanner,
        "analyser": drawAnalyser,
        "convolver": drawConvolver
    };
    let node = FX_TYPES[type];
    if(node === undefined) return;

    const body = get("FX").getElementsByTagName("tbody")[0];
    const row = body.insertRow();
    const uid = uidGen(10);
    row.insertCell().innerHTML = type;
    row.insertCell().innerHTML = "<button onclick='openFx(\"" + uid + "\")'>EDIT</button>";
    row.insertCell().innerHTML = "<button onclick='deleteFx(\"" + uid + "\");'>DEL</button>";

    const obj = new node(AC);
    obj.name = uid;
    if(type in FX_DRAW) obj.draw = FX_DRAW[type];
    chain1.push_back(obj);
}

function deleteFx(name) {
    if(AC === null) return;
    let num = null;
    for(let k in chain1.nodes) {
        if(chain1.nodes[k].name === name) {
            num = k;
            chain1.remove(k);
            break;
        }
    }
    if(num === null) return;
    const body = get("FX").getElementsByTagName("tbody")[0];
    body.deleteRow(Number(num) + 1);
}

function openFx(name) {
    openNode = null;
    for(let k in chain1.nodes) {
        if(chain1.nodes[k].name === name) {
            openNode = chain1.nodes[k];
            break;
        }
    }
    if(openNode === null) return;

    get('fxEditor').innerHTML = '';
    if('draw' in openNode) {
        const drawn = openNode.draw();
        get('fxEditor').innerHTML = drawn['html'];
        if(drawn['canvas'] !== undefined) drawn['canvas']();
    }
    get('fxEditor').innerHTML += '<br>';
    // TODO open channels editor see https://developer.mozilla.org/docs/Web/API/AudioNode
}

function lerp(val, start, end){
    return (1 - val) * start + val * end;
}

function linearToLog(val, min, max) {
    // TODO simplify or memoize
    let b = Math.log10(min / max) / (min - max),
        a = max / Math.pow(10, b * max);
    return Math.log10(val / a) / b;
}

function logToLinear(val, min, max) {
    // TODO simplify or memoize
    let b = Math.log10(min / max) / (min - max),
        a = max / Math.pow(10, b * max);
    return Math.pow(10, val * b) * a;
}

function dbToRatio(db) {
    return Math.pow(10, db / 20);
}

function ratioToDB(r) {
    return Math.log10(r) * 20;
}

const SEMITONE_PITCH = Math.pow(2, 1. / 12);
function getNoteFreq(midiPitch) {
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

let osc = {};
function playOsc(note = 69) {
    if(AC === null) return;
    if(osc[note] !== undefined) return;

    let g = AC.createGain();
    let o = AC.createOscillator();
    o.frequency.value = getNoteFreq(note);
    o.type = get("waveform").value;
    o.connect(g).connect(chain1.getInput());
    osc[note] = o;
    o.start();
}

function stopOsc(note = 69) {
    if(osc[note] === undefined) return;
    osc[note].stop();
    osc[note] = undefined;
}

function playNoise() {
    if(AC === null) return;
    if(noiseOsc !== null) return;
    noiseOsc = AC.createBufferSource();
    noiseOsc.buffer = noiseBuf;
    noiseOsc.loop = true;

    noiseOsc.connect(chain1.getInput());

    noiseOsc.start();
}

function stopNoise() {
    if(noiseOsc === null) return;
    noiseOsc.stop();
    noiseOsc = null;
}

let drawing = false;
async function mainloop() {
    setTimeout(mainloop, 1/20);

    if(AC === null) return;
    const canvas = get("oscilloscope");
    if(canvas === null) return;
    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();
    const h = canvas.height * .95, hh = Math.floor(canvas.height / 2 * .95),
        w = canvas.width, ww = Math.floor(canvas.width / 2);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, w, canvas.height);
    ctx.fillStyle = "grey";
    ctx.fillRect(0, 0, w, h);
    const dots = 20;
    {
        const arr = new Float32Array(masterOscilloscope.fftSize);
        masterOscilloscope.getFloatTimeDomainData(arr);

        ctx.lineWidth = 2;
        ctx.strokeStyle = "yellow";
        ctx.beginPath();
        ctx.moveTo(1, arr[1] * hh + hh);
        for(let i = 1; i < ww; i++)
            ctx.lineTo(i, arr[Math.floor(arr.length * i / ww)] * hh + hh);
        ctx.stroke();

        /* TODO toggleable lines for high frequency signals
        ctx.fillStyle = "yellow";
        for (let i = 0; i < ww; i++)
            ctx.fillRect(i, arr[Math.floor(arr.length * i / ww)] * hh + hh, 3, 3);*/

        ctx.lineWidth = 1;
        ctx.strokeStyle = "black";
        ctx.strokeText("ms", w * 1/4, canvas.height-12);
        for(let i = 0; i < dots; i++) {
            let x = i * ww / dots + 10;
            ctx.strokeText("" + Math.floor(i * (1000 / AC.sampleRate * arr.length)), x, canvas.height-2);
        }
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    ctx.beginPath();
    ctx.moveTo(ww, 0);
    ctx.lineTo(ww, canvas.height);
    ctx.stroke();
    {
        const arr = new Float32Array(masterFFTAnalyser.frequencyBinCount);
        const width = ww / arr.length;
        // TODO use byte values instead
        masterFFTAnalyser.getFloatFrequencyData(arr);
        ctx.fillStyle = "red";
        const MIN_DB = -40;
        for(let i = 0; i < arr.length; i++) {
            let y = arr[i] / MIN_DB * h + h;
            let x1 = ww + linearToLog(i * width + 1, 1, ww),
                x2 = ww + linearToLog((i + 1) * width + 1, 1, ww);
            y -= 2 * h;
            //y -= (x1 + x2) / ww * hh; // The higher frequencies' slope
            if(!isFinite(y) || y >= h) y = h;
            ctx.fillRect(x1, y, x2 - x1, h - y);
        }
        const HZ_SCALE = [5, 12, 32, 55, 90, 140, 210, 310, 440, 610, 900, 1250, 1700, 2400, 3400, 4800, 6700, 9500, 13500, 19000];
        ctx.lineWidth = 1;
        ctx.strokeStyle = "black";
        ctx.strokeText("Hz", w * 3/4, canvas.height-12);
        for(let i = 0; i < dots; i++) {
            let x = ww + i * ww / dots + 10;
            ctx.strokeText("" + HZ_SCALE[i], x, canvas.height-2);
        }
    }
}

//import Drawflow from "drawflow";

window.onload = () => {
    AC = null;

    let id = document.getElementById("drawflow");
    const editor = new Drawflow(id);
    editor.reroute = true;
    const dataToImport = {"drawflow":{"Home":{"data":{"1":{"id":1,"name":"welcome","data":{},"class":"welcome","html":"<div class=\"title-box\">👏 Welcome!!</div>","typenode": false, "inputs":{},"outputs":{},"pos_x":0,"pos_y":0}}}}};
    editor.start();
    editor.import(dataToImport);

    let fader = get("fader");
    fader.onmousemove = fader.onchange = function() {
        if(AC === null) return;
        get("fadervalue").innerHTML = this.value + " db";
        masterFader.gain.setValueAtTime(dbToRatio(this.value), AC.currentTime);
    };

    const KEYS = ['<', 'w', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', ',', ';', 'l', ':', 'm', '!'],
        KEY_START = 11;

    window.addEventListener("keydown", function(e) {
        if(KEYS.indexOf(e.key) !== -1)
            playOsc(KEY_START + KEYS.indexOf(e.key) + get("octave").value*12);
        if(e.key === ' ')
            playNoise();
    });

    window.addEventListener("keyup", function(e) {
        if(KEYS.indexOf(e.key) !== -1)
            stopOsc(KEY_START + KEYS.indexOf(e.key) + get("octave").value*12);
        if(e.key === ' ')
            stopNoise();
    });

    mainloop();
}