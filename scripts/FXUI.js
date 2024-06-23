//XXX please actually get good scales and units
function drawParamUI(param, id, type, onchange, min, max, step = 0.1) {
    const baseVal = param;
    let val = null;
    let valText = null;
    switch(type) {
        case 'db':
            val = round(ratioToDB(baseVal), 1);
            if(!isFinite(val)) val = min;
            break;
        case 'ms':
            val = 1000 * round(baseVal, 3);
            break;
        case "ratio":
            val = baseVal;
            valText = "1 : " + val;
            break;
        case "panning":
            val = baseVal;
            valText = panToText(val);
            break;
        default:
            val = baseVal;
            break;
    }
    if(valText === null) valText = val;
    let str = '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"' +
        'onchange="' + onchange + '" onmousemove="' + onchange + '"' + ' ontouchmove="' + onchange + '"' +
        '/><em id="value_' + id + '">' + valText + '</em> ' + (type != null ? type : "");
    return str;
}

function round(val, digits) {
    const p = Math.pow(10, digits);
    return Math.round(val * p) / p;
}

function gainChanged(name) {
    if(AC === null) return;
    const val = get('fader_' + name).value;
    get("value_fader_" + name).innerHTML = round(val, 1);
    getAudioNode(name).setParam('gain', dbToRatio(val));
}

function drawGain(name) {
    const fx = getAudioNode(name);
    if(fx == null) return;
    const val = fx.node.gain.value;
    return { html: drawParamUI(val, "fader_" + name, 'db', 'gainChanged(\'' + name + '\');', -40, 6) + '<br>' };
}

function delayChanged(name) {
    if(AC === null) return;
    const val = get('delay_' + name).value;
    get("value_delay_" + name).innerHTML = 1000 * round(val, 3);
    getAudioNode(name).setParam('delayTime', val);
}

function drawDelay(name) {
    const fx = getAudioNode(name);
    const val = round(fx.node.delayTime.value, 3);
    return {
        html: drawParamUI(val, 'delay_' + name, "ms", "delayChanged('" + name + "')", 0, .5, .001) + '<br>'
    };
}

function drawDistortion(name) {
    return {
        html: 'Curve <canvas id="waveshaper_' + name + '" width="200" height="200" ' +
        'onmousedown="updateDistortionCurve(\'' + name + '\', event)" onmousemove="updateDistortionCurve(\'' + name + '\', event);" ' +
        'onmouseup="updateDistortionCurve(\'' + name + '\', event);"></canvas><br>' +
        'Symmetrical : <input type="checkbox" id="symmetry_' + name + '" checked></input><br>' +
        'Presets : <select id="distselect_' + name + '" onchange="setDistortion(\'' + name + '\', this.value);">' +
        '<option value="" selected disabled hidden>Distortion shape</option>' +
        '<option value="overdrive">Overdrive</option>' +
        '<option value="clip">Hard clip</option>' +
        '<option value="sine">Sine x2</option>' +
        '<option value="fold">Triangle fold</option>' +
        '</select><br>' +
        'Arbitrary function (don\'t put code in here) f(x) -> <input type="text" id="distf_' + name + '" ' +
        'onchange="distortionFunction(\'' + name + '\', this.value, get(\'distfcount_' + name + '\').value);"></input> ' +
        'Points : <input type="number" id="distfcount_' + name + '"></input>' +
        'Oversampling : <select id="oversample_' + name + '" ' +
        'onchange="distortionChanged(\'' + name + '\');">' +
        '<option value="none">None</option>' +
        '<option value="2x">2x</option>' +
        '<option value="4x">4x</option>' +
        '</select><br>',
        canvas: () => updateDistortionCurve(name)
    };
}

function setDistortion(name, preset) {
    const fx = getAudioNode(name);
    let arr = null;
    switch(preset) {
        case "overdrive":
            distortionFunction(name, "Math.tanh(Math.PI * x)", 40);
            break;
        case "clip":
            arr = new Float32Array([-1, -1, -1, -1, 0, 1, 1, 1, 1]);
            fx.setValue('curve', arr);
            updateDistortionCurve(name);
            break;
        case "sine":
            distortionFunction(name, "Math.sin(2 * Math.PI * x)", 151);
            break;
        case "fold":
            arr = new Float32Array([0, -1, 0, 1, 0]);
            fx.setValue('curve', arr);
            updateDistortionCurve(name);
            break;
        default:
    }
}

function distortionFunction(name, func, n) {
    const fx = getAudioNode(name);
    try {
        let arr = new Float32Array(n);
        for(let i = 0; i < n; i++) {
            let x = i * 2 / n - 1;
            //TODO use Function() instead of eval
            arr[i] = eval(func);
            if(arr[i] > 1) arr[i] = 1;
            if(arr[i] < -1) arr[i] = -1;
        }
        fx.setValue('curve', arr);
    } catch (e) {
        console.log("Your function was invalid : " + e);
    }
    updateDistortionCurve(name);
}

function distortionChanged(name) {
    if(AC === null) return;
    const val = get('oversample_' + name).value;
    getAudioNode(name).setValue('oversample', val);
}

let mbuttons = [];

function createDistortionCurve(name, e, canvas) {
    const fx = getAudioNode(name);
    let curve = fx.node.curve;
    if(curve === null) curve = new Float32Array([-1, 0, 1]);
    const hh = canvas.height / 2, w = canvas.width;
    const pos = getCanvasPos(canvas, e);
    const idx = Math.round(pos.x / w * (curve.length - 1));
    const symmetry = get("symmetry_" + name).checked;
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
function updateDistortionCurve(name, e = null) {
    if(AC === null) return;

    const fx = getAudioNode(name);
    const canvas = get("waveshaper_" + name);
    if(canvas === null) return;
    const hh = canvas.height / 2, h = canvas.height,
            w = canvas.width;
    if(e !== null) {
        const newArr = createDistortionCurve(name, e, canvas);
        
        if(newArr !== null) fx.setValue('curve', newArr);
    }
    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();
    ctx.clearRect(0, 0, w, h);

    let curve = fx.node.curve || new Float32Array([-1, 0, 1]);
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

function drawBFilter(name) {
    const fx = getAudioNode(name);
    const type = fx.node.type;

    return {
        html: "Graphical eq <canvas id='beq_" + name +"' width='400' height='300' " +
            "onmousedown='updateBFilter(\"" + name + "\", event);' onmousemove='updateBFilter(\"" + name + "\", event);' " +
            "onmouseup='updateBFilter(\"" + name + "\", event);'></canvas><br>" +
            "Type : <select id='beqtype_" + name + "' onchange='updateBFilter(\"" + name + "\");'>" +
            "<option value='allpass'" + (type == 'allpass' ? 'selected' : '') + ">All-pass</option>" +
            "<option value='bandpass'" + (type == 'bandpass' ? 'selected' : '') + ">Band-pass</option>" +
            "<option value='highpass'" + (type == 'highpass' ? 'selected' : '') + ">High-pass 12db</option>" +
            "<option value='lowpass'" + (type == 'lowpass' ? 'selected' : '') + ">Low-pass 12db</option>" +
            "<option value='highshelf'" + (type == 'highshelf' ? 'selected' : '') + ">High-shelf</option>" +
            "<option value='lowshelf'" + (type == 'lowshelf' ? 'selected' : '') + ">Low-shelf</option>" +
            "<option value='notch'" + (type == 'notch' ? 'selected' : '') + ">Notch</option>" +
            "<option value='peaking'" + (type == 'peaking' ? 'selected' : '') + ">Peak</option>" +
            "</select> - Freq : <em id='beqfreq_" + name + "'>" + fx.node.frequency.value + "</em> Hz " +
            "- Gain : <em id='beqgain_" + name + "'>" + fx.node.gain.value + "</em> db " +
            "- Q : " + drawParamUI(fx.node.Q.value, "beqfactor_" + name, "", "updateBFilter('" + name + "')", 0.01, 10, 0.01),
        canvas: () => drawBFilterEQ(name)
    };
}

function updateBFilter(name, e = null) {
    if(AC === null) return;
    const fx = getAudioNode(name);

    if(e !== null) {
        const canvas = get("beq_" + name);
        const h = canvas.height,
            w = canvas.width;
        const pos = getCanvasPos(get("beq_" + name), e);
        if(e.type === 'mousedown' || (e.type === "mousemove" && mbuttons[0])) {
            mbuttons[e.button] = true;
            // One digit after decimal point
            fx.setParam('frequency', Math.round(10 * (logToLinear(pos.x, 1, w) - 1) / 2 * AC.sampleRate / w) / 10);
            fx.setParam('gain', Math.round(-10 * (pos.y / h * 80 - 40)) / 10);
            get("beqfreq_" + name).innerHTML = Math.round(fx.node.frequency.value * 10) / 10;
            get("beqgain_" + name).innerHTML = Math.round(fx.node.gain.value * 10) / 10;
        } else if(e.type === "mouseup")
            mbuttons[e.button] = false;
    }

    fx.setParam('Q', get("beqfactor_" + name).value);
    get("value_beqfactor_" + name).innerHTML = get("beqfactor_" + name).value;
    fx.setValue('type', get("beqtype_" + name).value);
    drawBFilterEQ(name);
}

function drawBFilterEQ(name) {
    if(AC === null) return;
    const fx = getAudioNode(name);

    const canvas = get("beq_" + name);
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
    fx.node.getFrequencyResponse(freq, mag, phase);

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

function drawCompressor(name) {
    const fx = getAudioNode(name);
    return {
        html: "Current reduction : <canvas id='comgraph_" + name + "' width='70' height='200'></canvas><br>" +
        "Attack : " + drawParamUI(fx.node.attack.value, "comattack_" + name, "ms", "updateCompressor('" + name + "')", 0, 1, .001) + "<br>" +
        "Knee : " + drawParamUI(fx.node.knee.value, "comknee_" + name, "", "updateCompressor('" + name + "')", 0, 40) + "<br>" +
        "Ratio : " + drawParamUI(fx.node.ratio.value, "comratio_" + name, "ratio", "updateCompressor('" + name + "')", 1, 20) + "<br>" +
        "Release : " + drawParamUI(fx.node.release.value, "comrelease_" + name, "ms", "updateCompressor('" + name + "')", 0, 1, .001) + "<br>" +
        "Threshold : " + drawParamUI(fx.node.threshold.value, "comthreshold_" + name, "db", "updateCompressor('" + name + "')", -40, 0) + "<br>",
        canvas: () => { drawCompressorCanvas(name); updateCompressorCanvas(name); }
    };
}

function updateCompressor(name) {
    if(AC === null) return;
    const fx = getAudioNode(name);

    const att = get('comattack_' + name).value,
        knee = get('comknee_' + name).value,
        ratio = get('comratio_' + name).value,
        rel = get('comrelease_' + name).value,
        thresh = get('comthreshold_' + name).value;

    fx.setParam('attack', att);
    fx.setParam('knee', knee);
    fx.setParam('ratio', ratio);
    fx.setParam('release', rel);
    fx.setParam('threshold', thresh);

    get('value_comattack_' + name).innerHTML = round(att, 3);
    get('value_comknee_' + name).innerHTML = round(knee, 1);
    get('value_comratio_' + name).innerHTML = round(ratio, 1);
    get('value_comrelease_' + name).innerHTML = round(rel, 3);
    get('value_comthreshold_' + name).innerHTML = round(thresh, 1);
}

function drawCompressorCanvas(name) {
    if(AC === null) return;

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

    let fx = getAudioNode(name);

    let max = -1;// highest note playing
    for(let k in osc) {
        if(max < k) max = k;
    }
    if(max != -1) fx = osc[max][name];
    if(fx === null || openNode === null || openNode.name != name) return;

    const canvas = get("comgraph_" + name);
    if(canvas === null) return;
    const h = canvas.height,
            w = canvas.width;

    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();

    ctx.clearRect(20, 20, w, h);
    ctx.fillStyle = "black";
    ctx.fillRect(20, 0, w - 20, h);

    const y = -fx.node.reduction / 20 * h;
    ctx.fillStyle = "green";
    ctx.fillRect(20, 0, w - 20, y);

    setTimeout(() => updateCompressorCanvas(name), .2); // 5hz refresh rate
}

function panToText(pan) {
    if(pan == 0) return 'M';
    if(pan < 0) return Math.round(pan * -100) + '% L';
    return Math.round(pan * 100) + '% R';
}

function drawPanner(name) {
    if(AC === null) return;
    const fx = getAudioNode(name);

    return {
        html: "Pan : " + drawParamUI(fx.node.pan.value, "pan_" + name, "panning", "updatePanner('" + name + "')", -1, 1, 0.05)
    };
}

function updatePanner(name) {
    if(AC === null) return;

    let fx = getAudioNode(name);
    const pan = get('pan_' + name).value;

    fx.setParam('pan', pan);
    get('value_pan_' + name).innerHTML = panToText(pan);
}

function drawAnalyser(name) {
    if(AC === null) return;
    const fx = getAudioNode(name);

    const fftSize = fx.node.fftSize;
    return {
        html: "<canvas id='analyser_" + name + "' width='600' height='450'></canvas>" +
        "Type : <select id='analysertype_" + name + "' onchange='updateAnalyser(\"" + name + "\");'>" +
        "<option value='fft' " + (fx.node.type == 'fft' ? 'selected':'') + ">Spectrum</option>" +
        "<option value='oscilloscope'" + (fx.node.type == 'oscilloscope' ? 'selected':'') + ">Oscilloscope</option>" +
        "</select><br>" +
        "FFT size : 2^<input onchange='updateAnalyser(\"" + name + "\");' type='number' id='analysersize_" + name + "' min='5' max='15' step='1' value='" + Math.round(Math.log2(fftSize)) + "'></input><br>" +
        "Db range : <input onchange='updateAnalyser(\"" + name + "\");' type='number' id='analysermin_" + name + "' min='-100' max='-31' value='" + fx.node.minDecibels + "'></input> - " +
        "<input onchange='updateAnalyser(\"" + name + "\");' type='number' min='-100' max='0' id='analysermax_" + name + "' value='" + fx.node.maxDecibels + "'></input><br>" +
        "Smoothing " + drawParamUI(fx.node.smoothingTimeConstant, "analysersmooth_" + name, null, "updateAnalyser('" + name + "')", 0, 1, 0.01) + "<br>" +
        "Slope " + drawParamUI(25, "analyserslope_" + name, null, "updateAnalyser('" + name + "')", 0, 50, 1),
        canvas: () => { drawAnalyserCanvas(name); updateAnalyserCanvas(name); }
    };
}

function updateAnalyser(name) {
    if(AC === null) return;
    const fx = getAudioNode(name);

    fx.setValue('type', get("analysertype_" + name).value);
    fx.setValue('fftSize', Math.pow(2, get("analysersize_" + name).value));
    fx.setValue('minDecibels', get("analysermin_" + name).value);
    fx.setValue('maxDecibels', get("analysermax_" + name).value);
    fx.setValue('smoothingTimeConstant', get("analysersmooth_" + name).value);
    get("value_analysersmooth_" + name).innerHTML = fx.node.smoothingTimeConstant;
    get("value_analyserslope_" + name).innerHTML = get("analyserslope_" + name).value;
    drawAnalyserCanvas(name);
}

function drawAnalyserCanvas(name) {
    if(AC === null) return;
    let fx = getAudioNode(name);

    let max = -1;// highest note playing
    for(let k in osc) {
        if(max < k) max = k;
    }
    if(max != -1) fx = osc[max][name];

    const canvas = get("analyser_" + name);
    if(canvas === null) return;
    const h = canvas.height,
           ww = canvas.width / 2, w = canvas.width;

    let ctx = canvas.getContext("2d");
    //let ctx = new CanvasRenderingContext2D();

    ctx.clearRect(0, h * .95, w, h);

    if(fx.node.type == 'fft') {
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
            ctx.strokeText("" + Math.floor(i * (1000 / AC.sampleRate * fx.node.fftSize)), x, h - 2);
        }
    }
}

function updateAnalyserCanvas(name) {
    if(AC === null) return;
    let fx = getAudioNode(name);

    let max = -1;// highest note playing
    for(let k in osc) {
        if(max < k) max = k;
    }
    if(max != -1) fx = osc[max][name];
    if(fx === null || openNode === null || openNode.name != name) return;

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
    if(get("analysertype_" + name).value == 'fft') {
        const arr = new Float32Array(fx.node.frequencyBinCount);
        const width = w / arr.length;
        fx.node.getFloatFrequencyData(arr);
        ctx.fillStyle = "red";
        for(let i = 0; i < arr.length; i++) {
            let y = -(arr[i] - fx.node.minDecibels) / (fx.node.maxDecibels - fx.node.minDecibels) * h * .9 + h * .9;
            let x1 = linearToLog(i * width + 1, 1, w),
                x2 = linearToLog((i + 1) * width + 1, 1, w);
            y -= (x1 + x2) / w * h * .9 / (fx.node.maxDecibels - fx.node.minDecibels) * slope; // The higher frequencies' slope
            if(!isFinite(y) || y >= h * .9) y = h * .9;
            ctx.fillRect(x1, y, x2 - x1, h * .9 - y);
        }
        setTimeout(() => updateAnalyserCanvas(name), 1/30); // 30hz refresh rate
        return;
    }
    // else it is an oscilloscope
    const arr = new Float32Array(fx.node.fftSize);
    fx.node.getFloatTimeDomainData(arr);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "yellow";
    ctx.beginPath();
    let y = arr[0] * hh * .9 + hh * .9;
    if(y >= h * .9) y = h * .9;
    ctx.moveTo(0, y);
    if(w > arr.length) {
        for(let i = 0; i < arr.length; i++) {
            y = -arr[i] * hh * .9 + hh * .9;
            if(y >= h * .9) y = h * .9;
            ctx.lineTo(i * w / arr.length, y);
        }
    } else for(let i = 1; i < w; i++) {
        y = -arr[Math.floor(arr.length * i / w)] * hh * .9 + hh * .9;
        if(y >= h * .9) y = h * .9
        ctx.lineTo(i, y);
    }
    ctx.stroke();
    setTimeout(() => updateAnalyserCanvas(name), 1/30); // 30hz refresh rate
}

function drawConvolver(name) {
    if(AC === null) return;
    const fx = getAudioNode(name);

    return {
        html: "Convolution : <button onclick='updateNodeBuffer(\"" + name + "\")'>Choose Impulse Response</button><br>" +
        "Normalize ? <input onchange='updateConvolver(\"" + name + "\")' onclick='updateConvolver(\"" + name + "\")' type='checkbox' " + (fx.node.normalize ? 'checked' : '') + " id='convnorm_" + name + "'>"
    };
}

function updateConvolver(name) {
    if(AC === null) return;

    getAudioNode(name).setValue('normalize', get("convnorm_" + name).checked);
}

function drawOscillator(name) {
    const fx = getAudioNode(name);
    const type = fx.node.type;
    return {
        html: 'Waveform <select onchange="updateOscillator(\'' + name + '\')" id="osctype_' + name + '">' +
        '<option value="sine" ' + (type == 'sine' ? 'selected' : '') + '>Sine</option>' +
        '<option value="triangle"' + (type == 'triangle' ? 'selected' : '') + '>Triangle</option>' +
        '<option value="square"' + (type == 'square' ? 'selected' : '') + '>Square</option>' +
        '<option value="sawtooth"' + (type == 'sawtooth' ? 'selected' : '') + '>Sawtooth</option>' +
        //TODO get a fucking logarithmic scale in there
        "</select><br>Frequency : " + drawParamUI(fx.node.frequency.value, "oscfreq_" + name, "hz", "updateOscillator('" + name + "')", 0, 20000, 1) +
        "<br>Detune : " + drawParamUI(fx.node.detune.value, "oscdetune_" + name, "cent", "updateOscillator('" + name + "')", -200, 200, 1)
    };
}

function updateOscillator(name) {
    if(AC === null) return;

    const fx = getAudioNode(name);
    if(fx == null) return;

    fx.setValue('type', get("osctype_" + name).value);
    fx.setParam('frequency', get("oscfreq_" + name).value);
    fx.setParam('detune', get("oscdetune_" + name).value);

    get("value_oscfreq_" + name).innerHTML = fx.node.frequency.value;
    get("value_oscdetune_" + name).innerHTML = fx.node.detune.value;
}

function drawConstant(name) {
    const fx = getAudioNode(name);
    const type = fx.node.type;
    const typeoptions = CONST_NODE_TYPE.map((e) => ('<option value="' + e + '" ' + (type == e ? 'selected' : '') + '>' + e + '</option>')).join("");
    return {
        html: 'Type : <select onchange="updateConstant(\'' + name + '\')" id="consttype_' + name + '">' +
                typeoptions +
                "</select><br>" +
                "<div id='constdata_" + name + "'>" +
                drawConstantData(name, type, fx) +
                "</div>"
    };
}

function drawConstantData(name, type, fx) {
    const data = fx.node.data;
    const upd = 'onmousemove="updateConstant(\'' + name + '\')" onchange="updateConstant(\'' + name + '\')"';
    switch(type) {
        case "CONSTANT":
            return "Value : " + drawParamUI(round(fx.node.offset.value, 2), "constoffset_" + name, null, "updateConstant('" + name + "')", 0, 1, .01);
        case "EXT_PARAM":
            return "<select onchange='updateConstant(\"" + name + "\")' id='constparam_" + name + "'>" +
                    CONST_EXTERNAL_PARAM.map((e) => "<option value='" + e + "' " + (fx.node.data == e ? 'selected' : '') + ">" + e + "</option>").join('') +
                    "</select>";
        case "ENVELOPE":
            return 'Attack <input type="range" id="attack_' + name + '" min="0" max="4000" step="1" value="' + data.attack + '" ' + upd + '></input><span id="attackval_' + name + '">' + data.attack + '</span> ms<br>' +
                'Decay <input type="range" id="decay_' + name + '" min="0" max="4000" step="1" value="' + data.decay + '" ' + upd + '></input><span id="decayval_' + name + '">' + data.decay + '</span> ms<br>' +
                'Sustain <input type="range" id="sustain_' + name + '" min="0" max="1" step="0.01" value="' + data.sustain + '" ' + upd + '></input><span id="sustainval_' + name + '">' + data.sustain + '</span><br>' +
                'Release <input type="range" id="release_' + name + '" min="0" max="4000" step="1" value="' + data.release + '" ' + upd + '></input><span id="releaseval_' + name + '">' + data.release + '</span> ms<br>';
        case "MIDI_CC":
            return "CC number <input type='number' min='0' max='127' id='constmidicc_" + name + "' onchange='updateConstant(\"" + name + "\")' value='" + data + "'></input>&nbsp;" +
                "Auto-bind : <input type='checkbox' onclick='bindMIDICC(\"" + name + "\")' id='autobindcc_" + name + "'></input>";
    }
}

function updateConstant(name) {
    if(AC === null) return;

    const fx = getAudioNode(name);
    if(fx == null) return;
    const newtype = get("consttype_" + name).value;
    if(newtype != fx.node.type) {
        switch(newtype) {
            case "CONSTANT":
                fx.node.data = null;
                break;
            case "EXT_PARAM":
                if(!(fx.node.data instanceof String))
                    fx.node.data = "FREQUENCY";
                break;
            case "ENVELOPE":
                if(!(fx.node.data instanceof Envelope))
                    fx.node.data = new Envelope(10, 0, 1, 25);
                break;
            case "MIDI_CC":
                if(!(fx.node.data instanceof Number))
                    fx.node.data = 0;
                break;
        }
        get("constdata_" + name).innerHTML = drawConstantData(name, newtype, fx);
        fx.node.type = newtype;
        return;
    }
    switch(fx.node.type) {
        case "CONSTANT":
            fx.setParam('offset', get("constoffset_" + name).value);
            get("value_constoffset_" + name).innerHTML = round(fx.node.offset.value, 2);
            break;
        case "EXT_PARAM":
            fx.node.data = get("constparam_" + name).value;
            break;
        case "ENVELOPE":
            fx.node.data = new Envelope(get('attack_' + name).value, get('decay_' + name).value, get('sustain_' + name).value, get('release_' + name).value);
            get("attackval_" + name).innerHTML = get('attack_' + name).value;
            get("decayval_" + name).innerHTML = get('decay_' + name).value;
            get("sustainval_" + name).innerHTML = get('sustain_' + name).value;
            get("releaseval_" + name).innerHTML = get('release_' + name).value;
            break;
        case "MIDI_CC":
            fx.node.data = Number(get("constmidicc_" + name).value);
            break;
    }
}

function drawBufferSource(name) {
    const fx = getAudioNode(name);
    return {
        html: "Sample : <button onclick='updateNodeBuffer(\"" + name + "\")'>Choose Sample</button><br>" +
            "Detune : " + drawParamUI(fx.node.detune.value, "bufdetune_" + name, "cent", "updateBufferSource('" + name + "')", -1200, 1200, 1) +
            "<br>Playback rate : " + drawParamUI(fx.node.playbackRate.value, "bufrate_" + name, "", "updateBufferSource('" + name + "')", 0, 1, .01) +
            "<br>Loop? <input type='checkbox' onchange='updateBufferSource(\"" + name + "\")' onclick='updateBufferSource(\"" + name + "\")' id='bufloop_" + name + "' " + (fx.node.loop ? "checked" : "") + "></input>" +
            "<br>Loop start : " + drawParamUI(fx.node.loopStart, "bufstart_" + name, "", "updateBufferSource('" + name + "')", 0, 1, .01) +
            "<br>Loop end : " + drawParamUI(fx.node.loopEnd, "bufend_" + name, "", "updateBufferSource('" + name + "')", 0, 1, .01)
    };
}

async function updateNodeBuffer(name) {
    if(AC === null) return;
    const fx = getAudioNode(name);
    if(fx == null) return;

    const pickerOpts = {
        types: [
            {
                description: "Audio wav file",
                accept: {
                    "audio/wav": [".wav"],
                    "audio/mp3": [".mp3"],
                    "audio/aac": [".m4a"]
                },
            },
        ],
        excludeAcceptAllOption: true,
        multiple: false
    };

    const contents = await window.showOpenFilePicker(pickerOpts).then((handle) => {
        return handle[0].getFile().then((file) => file.arrayBuffer());
    });

    fx.setValue('buffer', await AC.decodeAudioData(contents));
}

function updateBufferSource(name) {
    if(AC === null) return;

    const fx = getAudioNode(name);
    if(fx == null) return;

    const detune = get("bufdetune_" + name).value,
        rate = get("bufrate_" + name).value,
        start = get("bufstart_" + name).value,
        end = get("bufend_" + name).value;

    fx.setParam("detune", detune);
    fx.setParam("playbackRate", rate);
    fx.setValue("loop", get("bufloop_" + name).checked);
    fx.setValue("loopStart", start);
    fx.setValue("loopEnd", end);

    get("value_bufdetune_" + name).innerHTML = detune;
    get("value_bufrate_" + name).innerHTML = rate;
    get("value_bufstart_" + name).innerHTML = start;
    get("value_bufend_" + name).innerHTML = end;
}

function drawWorklet(name) {
    return {
        html: ""
    };
}

const FX_DRAW = {
    "gain": drawGain,
    "delay": drawDelay,
    "distortion": drawDistortion,
    "biquadfilter": drawBFilter,
    "compressor": drawCompressor,
    "stereopanner": drawPanner,
    "analyser": drawAnalyser,
    "convolver": drawConvolver,
    "oscillator": drawOscillator,
    "constant": drawConstant,
    "audiobuffersource": drawBufferSource,
    "worklet": drawWorklet
};