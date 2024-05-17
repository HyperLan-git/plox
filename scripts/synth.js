// TODO understand wtf is an audio worklet
// FIXME turn everything into modules!!!
let AC = new AudioContext();

let masterFader = new GainNode(AC),
    masterLimiter = new WaveShaperNode(AC),
    masterOscilloscope = new AnalyserNode(AC),
    masterFFTAnalyser = new AnalyserNode(AC);

let openNode = null;

const uiChange = .005; // 5ms

let constantSource = null, freqConstant = null, adsrConstant = null;
let osc1 = null, adsr = null;
let osc2 = null, fmfreq = null;
let osc = {};

function get(id) {
    return document.getElementById(id);
}

function getMousePos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {x: e.clientX - rect.left, y: e.clientY - rect.top};
}

function getAudioNode(name) {
    if(AC == null) return null;
    const mod = getModulationNodes();
    for(let k in mod) if(mod[k].name == name) return mod[k];
    return fx.getAudioNode(name);
}

function initAudio() {
    AC = new AudioContext();

    masterFader = new GainNode(AC);
    masterLimiter = new WaveShaperNode(AC);
    masterFFTAnalyser = new AnalyserNode(AC);
    masterOscilloscope = new AnalyserNode(AC);

    masterFader.gain.value = dbToRatio(-40);
    masterFFTAnalyser.fftSize = 4096;
    masterOscilloscope.fftSize = 512;
    masterLimiter.curve = new Float32Array([-1, 0, 1]); // Probably not meant to be used as a clipper but idc

    masterFader.connect(masterLimiter).connect(masterFFTAnalyser).connect(masterOscilloscope).connect(AC.destination);

    adsr = new FX(new GainNode(AC));
    osc1 = new FX(new OscillatorNode(AC));
    adsr.node.gain.value = 0;

    osc1.node.frequency.value = 0;
    osc1.connect(adsr);

    osc2 = new FX(new OscillatorNode(AC));
    fmfreq = new FX(new GainNode(AC));

    osc2.node.frequency.value = 0;
    osc2.connect(fmfreq);

    constantSource = new FX(new ConstantSourceNode(AC));
    constantSource.node.start();

    freqConstant = new FX(new ConstantSourceNode(AC));
    freqConstant.node.offset.setValueAtTime(0, AC.currentTime);
    freqConstant.node.start();

    adsrConstant = new FX(new ConstantSourceNode(AC));
    adsrConstant.node.offset.setValueAtTime(0, AC.currentTime);
    adsrConstant.node.start();

    osc1.label = "osc1";
    osc2.label = "osc2";
    adsr.label = "adsrGain"
    constantSource.label = "unit";
    freqConstant.label = "freq";
    adsrConstant.label = "env1";
    fmfreq.label = "fmcontrol";

    addMod(freqConstant, osc1, "frequency", "osc1_freq");
    addMod(freqConstant, osc2, "frequency", "osc2_freq");
    addMod(adsrConstant, adsr, "gain", "envelope1");
    addMod(freqConstant, fmfreq, "gain", "osc2_fm_amp");
    addMod(fmfreq, osc1, "frequency", "osc2_to_osc1_fm");

    fx = new FXGraph(AC, drawflow,
        [osc1, adsr,
        freqConstant, adsrConstant,
        osc2, fmfreq,
        constantSource]);
    fx.outputNode.label = "output_gain";

    adsr.connect(fx.getOutput());
    fx.connectGraphNode(adsr, fx.getOutput());
    fx.getOutput().node.connect(masterFader);
    updateModUI(fx.getAllNodes());
}

function addFx(type) {
    let node = FX_TYPES[type];
    if(node === undefined) return;

    fx.addNode(new node(AC));
    updateModUI(fx.getAllNodes());
}

function deleteFx(name) {
    if(AC === null) return;

    fx.deleteNode(name);
    updateModUI(fx.getAllNodes());
}

function openFx(name) {
    openNode = fx.getAudioNode(name);
    if(openNode === null) return;

    get('fxEditor').innerHTML = '';
    if(openNode.fxtype in FX_DRAW) {
        const drawn = openNode['draw']();
        const editName = "<input type='text' id='label_" + name + "' value='" + openNode.label + "' onchange='setNodeLabel(\"" + name + "\", this.value);'></input>";
        get('fxEditor').innerHTML = editName + "<br>" + drawn['html'];
        if(drawn['canvas'] !== undefined) setTimeout(() => drawn['canvas'](), 1);
    }
    get('fxEditor').innerHTML += '<br>';
    // TODO open channels editor see https://developer.mozilla.org/docs/Web/API/AudioNode
}

function setNodeLabel(name, label) {
    let node = getAudioNode(name);
    if(node === null) return;
    //TODO update all ui (names in mod matrix)
    node.label = label;
    const graphnode = fx.getNodes(name)[0];
    if(graphnode != undefined) {
        fx.getNode(graphnode).html = label;
    }
    updateModUI(fx.getAllNodes());
    let el = get("graph_" + name);
    if(el !== undefined) el.innerHTML = label;
}

function closeFx() {
    get('fxEditor').innerHTML = '';
    openNode = null;
}

function lerp(val, start, end) {
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

function playOsc(note = 69) {
    if(AC === null) return;
    if(osc[note] !== undefined) return;

    const nodes = copyFxs(fx.getAllNodes().concat(getModulationNodes()));

    const attack = Number(get("attack").value) / 1000,
        decay = Number(get("decay").value) / 1000,
        sustain = Number(get("sustain").value);
    nodes[adsrConstant.name].node.offset.setValueAtTime(0, AC.currentTime);
    nodes[adsrConstant.name].node.offset.setTargetAtTime(1, AC.currentTime, attack / 5);
    nodes[adsrConstant.name].node.offset.setTargetAtTime(sustain, AC.currentTime + attack, decay / 5);

    nodes[freqConstant.name].node.offset.value = getNoteFreq(note);

    const time = AC.currentTime;
    for(let k in nodes) {
        if(nodes[k].fxtype == 'oscillator') nodes[k].node.start(time);
        if(nodes[k].fxtype == 'constant') nodes[k].node.start(time);

        nodes[k].paramListener = (e) => {
            nodes[k].setParam(e.param, e.newValue, true);
        };
        getAudioNode(k).addEventListener('paramChange', nodes[k].paramListener);

        nodes[k].valueListener = (e) => {
            nodes[k].setValue(e.newValue);
        }
        getAudioNode(k).addEventListener('valueChange', nodes[k].valueListener);
    }

    nodes[fx.getOutput().name].node.connect(masterFader);

    osc[note] = nodes;
}

function stopOsc(note = 69) {
    if(osc[note] === undefined) return;
    const release = Number(get("release").value) / 1000; // s
    const nodes = osc[note];
    setTimeout(() => {
        for(let k in nodes) {
            nodes[k].disconnect();
        }
    }, release * 1000);
    osc[note][adsrConstant.name].node.offset.cancelScheduledValues(AC.currentTime);
    osc[note][adsrConstant.name].node.offset.setTargetAtTime(0, AC.currentTime, release / 5);
    for(let k in osc[note]) {
        if(osc[note][k].fxtype == 'oscillator') nodes[k].node.stop(AC.currentTime + release);

        getAudioNode(k).removeEventListener('paramChange', osc[note][k].paramListener);
        getAudioNode(k).removeEventListener('valueChange', osc[note][k].valueListener);
    }
    delete osc[note];
}

function updateADSR() {
    if(AC === null) return;

    get("attackval").innerHTML = get("attack").value;
    get("decayval").innerHTML = get("decay").value;
    get("sustainval").innerHTML = get("sustain").value;
    get("releaseval").innerHTML = get("release").value;
}

// XXX remove this
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

let fx = null;
let drawflow = null;

window.onload = () => {
    AC = null;

    let id = document.getElementById("drawflow");
    drawflow = new Drawflow(id);
    drawflow.reroute = true;
    drawflow.curvature = .25;
    drawflow.start();

    let fader = get("fader");
    fader.onmousemove = fader.onchange = function() {
        if(AC === null) return;
        get("fadervalue").innerHTML = this.value + " db";
        masterFader.gain.setTargetAtTime(dbToRatio(this.value), AC.currentTime, uiChange);
    };

    const KEYS = ['<', 'w', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', ',', ';', 'l', ':', 'm', '!'],
        KEY_START = 11;

    window.addEventListener("keydown", function(e) {
        if(KEYS.indexOf(e.key) !== -1)
            playOsc(KEY_START + KEYS.indexOf(e.key) + get("octave").value*12);
    });

    window.addEventListener("keyup", function(e) {
        if(KEYS.indexOf(e.key) !== -1)
            stopOsc(KEY_START + KEYS.indexOf(e.key) + get("octave").value*12);
    });

    mainloop();
}