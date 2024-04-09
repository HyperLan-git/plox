// TODO understand wtf is an audio worklet
// FIXME turn everything into modules!!!
let AC = new AudioContext();

let masterFader = new GainNode(AC),
    masterLimiter = new WaveShaperNode(AC),
    masterOscilloscope = new AnalyserNode(AC),
    masterFFTAnalyser = new AnalyserNode(AC);

let noiseOsc = null;
let noiseBuf = null;

let openNode = null;

const uiChange = .005; // 5ms

let osc1 = null, adsr = null;
let osc2 = null, fmfreq = null, fma = null;
let osc = {};

function get(id) {
    return document.getElementById(id);
}

function getMousePos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {x: e.clientX - rect.left, y: e.clientY - rect.top};
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

    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);

    // White noise for now
    for(let i = 0; i < noiseBuf.length; i++)
        noiseBuf.getChannelData(0)[i] = Math.random() * 2 - 1;

    fx = new FXGraph(AC, drawflow);
    fx.getOutput().node.connect(masterFader);

    adsr = new FX(new GainNode(AC));
    osc1 = new FX(new OscillatorNode(AC));
    adsr.node.gain.value = 0;

    osc1.connect(adsr);

    osc2 = new FX(new OscillatorNode(AC));
    fmfreq = new FX(new GainNode(AC));
    fma = new FX(new GainNode(AC));

    osc2.connect(fmfreq).connect(fma).connectParam(osc1, "frequency");
}

function addFx(type) {
    let node = FX_TYPES[type];
    if(node === undefined) return;

    fx.addNode(new node(AC));
}

function deleteFx(name) {
    if(AC === null) return;

    fx.deleteNode(name);
}

function openFx(name) {
    openNode = fx.getAudioNode(name);
    if(openNode === null) return;

    get('fxEditor').innerHTML = '';
    if(openNode.fxtype in FX_DRAW) {
        const drawn = openNode.draw();
        get('fxEditor').innerHTML = drawn['html'];
        if(drawn['canvas'] !== undefined) setTimeout(() => drawn['canvas'](), 1);
    }
    get('fxEditor').innerHTML += '<br>';
    // TODO open channels editor see https://developer.mozilla.org/docs/Web/API/AudioNode
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

    const nodes = copyFxs(osc1, adsr, osc2, fmfreq, fma);
    let o = nodes[osc1.name];
    o.adsr = nodes[adsr.name];
    o.osc2 = nodes[osc2.name];
    o.fmfreq = nodes[fmfreq.name];
    o.fma = nodes[fma.name];

    o.node.frequency.value = getNoteFreq(note);
    o.node.type = get("waveform").value;

    o.adsr.connect(fx.getInput());

    const attack = Number(get("attack").value) / 1000,
        decay = Number(get("decay").value) / 1000,
        sustain = Number(get("sustain").value);
    o.adsr.node.gain.setValueAtTime(0, AC.currentTime);
    o.adsr.node.gain.setTargetAtTime(1, AC.currentTime, attack / 2);
    o.adsr.node.gain.setTargetAtTime(sustain, AC.currentTime + attack, decay / 2);

    o.osc2.node.frequency.value = o.node.frequency.value;
    o.osc2.node.type = get("waveform2").value;

    o.fmfreq.node.gain.value = o.node.frequency.value;
    o.fma.node.gain.value = get("fm").value / 100;

    o.osc2.node.start();
    o.node.start();
    osc[note] = o;
}

function stopOsc(note = 69) {
    if(osc[note] === undefined) return;
    const release = Number(get("release").value) / 1000; // s
    const o = osc[note];
    setTimeout(() => {
        o.osc2.node.stop();

        o.osc2.disconnect();
        o.fmfreq.disconnect();
        o.fma.disconnect();
        o.adsr.disconnect();
        o.disconnect();
    }, release * 1000);
    o.adsr.cancelScheduledValues(AC.currentTime);
    o.adsr.node.gain.setTargetAtTime(-100, AC.currentTime, release / 2);
    o.node.stop(AC.currentTime + release);
    delete osc[note];
}

function playNoise() {
    if(AC === null) return;
    if(noiseOsc !== null) return;
    noiseOsc = AC.createBufferSource();
    noiseOsc.buffer = noiseBuf;
    noiseOsc.loop = true;

    noiseOsc.connect(fx.getInput().node);

    noiseOsc.start();
}

function stopNoise() {
    if(noiseOsc === null) return;
    noiseOsc.stop();
    noiseOsc = null;
}

function updateADSR() {
    if(AC === null) return;

    get("attackval").innerHTML = get("attack").value;
    get("decayval").innerHTML = get("decay").value;
    get("sustainval").innerHTML = get("sustain").value;
    get("releaseval").innerHTML = get("release").value;
}

function updateFM() {
    if(AC === null) return;
    get('fmval').innerHTML = get("fm").value;
    for(const [, o] of Object.entries(osc))
        o.fma.node.gain.setTargetAtTime(Number(get("fm").value) / 100, AC.currentTime, uiChange);
}

// XXX redesign this
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