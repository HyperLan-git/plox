
function gainChanged(name) {
    if(AC === null) return;
    const val = get('fader_' + name).value;
    get("fadervalue_" + name).innerHTML = val + " db";
    openNode.gain.setTargetAtTime(dbToRatio(val), AC.currentTime, uiChange);
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
    openNode.delayTime.setTargetAtTime(val / 1000, AC.currentTime, uiChange);
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
    ctx.lineWidth = 3;
    const points = 400;
    let freq = new Float32Array(points),
        mag = new Float32Array(points),
        phase = new Float32Array(points);
    for(let i = 0; i < points; i++)
        freq[i] = (logToLinear(i * w / points, 1, w) - 1) / 2 * AC.sampleRate / w;
    openNode.getFrequencyResponse(freq, mag, phase);

    ctx.fillStyle = "orange";
    ctx.strokeStyle = "rgb(151, 98, 0)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    for(let i = 0; i < points; i++)
        ctx.lineTo(i * w / points, hh - (ratioToDB(mag[i]) / 40) * hh);
    ctx.lineTo(w, h);
    ctx.stroke();
    ctx.fill();

    ctx.fillStyle = "rgba(43, 250, 250, .2)";
    ctx.strokeStyle = "rgba(0, 0, 250, .2)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    for(let i = 0; i < points; i++)
        ctx.lineTo(i * w / points, phase[i] * hh / Math.PI + hh);
    ctx.lineTo(w, h);
    ctx.stroke();
    ctx.fill();
}

function drawCompressor() {
    const name = this.name;
    const upd = "onchange='updateCompressor();' onmousemove='updateCompressor();'";

    return {
        html: "Current reduction : <canvas id='comgraph_" + name + "' width='70' height='200'></canvas><br>" +
        "Attack : <input " + upd + " id='comattack_" + name + "' type='range' min='0' max='1000' step='1' value='" + Math.round(this.attack.value * 1000) + "'></input>" +
        "<span id='comattackval_" + name + "'>" + Math.round(this.attack.value * 1000) + "</span> ms<br>" +
        "Knee : <input " + upd + " id='comknee_" + name + "' type='range' min='0' max='40' step='.1' value='" + this.knee.value + "'></input>" +
        "<span id='comkneeval_" + name + "'>" + this.knee.value + "</span> db<br>" +
        "Ratio : <input " + upd + " id='comratio_" + name + "' type='range' min='1' max='20' step='0.1' value='" + this.ratio.value + "'></input>" +
        "1 : <span id='comratioval_" + name + "'>" + this.ratio.value + "</span><br>" +
        "Release : <input " + upd + " id='comrelease_" + name + "' type='range' min='0' max='1000' step='1' value='" + Math.round(this.release.value * 1000) + "'></input>" +
        "<span id='comreleaseval_" + name + "'>" + Math.round(this.release.value * 1000) + "</span> ms<br>" +
        "Threshold : <input " + upd + " id='comthreshold_" + name + "' type='range' min='-40' max='0' step='0.1' value='" + this.threshold.value + "'></input>" +
        "<span id='comthresholdval_" + name + "'>" + this.threshold.value + "</span> db<br>",
        canvas: () => { drawCompressorCanvas(); updateCompressorCanvas(name); }
    };
}

function updateCompressor() {
    if(AC === null) return;
    const name = openNode.name;

    const att = get('comattack_' + name).value,
        knee = get('comknee_' + name).value,
        ratio = get('comratio_' + name).value,
        rel = get('comrelease_' + name).value,
        thresh = get('comthreshold_' + name).value;

    openNode.attack.value = att / 1000;
    openNode.knee.value = knee;
    openNode.ratio.value = ratio;
    openNode.release.value = rel / 1000;
    openNode.threshold.value = thresh;

    get('comattackval_' + name).innerHTML = att;
    get('comkneeval_' + name).innerHTML = Math.round(knee * 10) / 10;
    get('comratioval_' + name).innerHTML = Math.round(ratio * 10) / 10;
    get('comreleaseval_' + name).innerHTML = rel;
    get('comthresholdval_' + name).innerHTML = Math.round(thresh * 10) / 10;
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
        setTimeout(() => updateAnalyserCanvas(name), 1/30); // 30hz refresh rate
        return;
    }
    // else it is an oscilloscope
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

const FX_DRAW = {
    "gain": drawGain,
    "delay": drawDelay,
    "distortion": drawDistortion,
    "biquadfilter": drawBFilter,
    "compressor": drawCompressor,
    "stereopanner": drawPanner,
    "analyser": drawAnalyser,
    "convolver": drawConvolver
};