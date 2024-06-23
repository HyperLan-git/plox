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

let midi = null;

function get(id) {
    return document.getElementById(id);
}

function getCanvasPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {x: e.clientX - rect.left, y: e.clientY - rect.top};
}

function getAudioNode(name) {
    if(AC == null) return null;
    const mod = getModulationNodes();
    for(let k in mod) if(mod[k].name == name) return mod[k];
    return fx.getAudioNode(name);
}

function getAllNodes() {
    return fx.getAllNodes().concat(getModulationNodes());
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
    constantSource.node.type = "CONSTANT";
    constantSource.node.data = null;
    constantSource.node.start();

    freqConstant = new FX(new ConstantSourceNode(AC));
    freqConstant.node.type = "EXT_PARAM";
    freqConstant.node.data = "FREQUENCY";
    freqConstant.node.offset.setValueAtTime(0, AC.currentTime);
    freqConstant.node.start();

    adsrConstant = new FX(new ConstantSourceNode(AC));
    adsrConstant.node.type = "ENVELOPE";
    adsrConstant.node.data = new Envelope(10, 0, 1, 25);
    adsrConstant.node.offset.setValueAtTime(0, AC.currentTime);
    adsrConstant.node.start();

    osc1.label = "osc1";
    osc2.label = "osc2";
    adsr.label = "adsrGain"
    constantSource.label = "unit";
    freqConstant.label = "freq";
    adsrConstant.label = "env1";
    fmfreq.label = "fmcontrol";

    fx = new FXGraph(AC, drawflow,
        [osc1, adsr,
        freqConstant, adsrConstant,
        osc2, fmfreq,
        constantSource]);
    fx.outputNode.label = "output_gain";

    const nodes = fx.getAllNodes();
    addMod(nodes, freqConstant, osc1, "frequency", "osc1_freq");
    addMod(nodes, freqConstant, osc2, "frequency", "osc2_freq");
    addMod(nodes, adsrConstant, adsr, "gain", "envelope1");
    addMod(nodes, freqConstant, fmfreq, "gain", "osc2_fm_amp");
    addMod(nodes, fmfreq, osc1, "frequency", "osc2_to_osc1_fm");

    adsr.connect(fx.getOutput());
    fx.connectGraphNode(adsr, fx.getOutput());
    //fx.getOutput().node.connect(masterFader);
    updateModUI(fx.getAllNodes());

    drawSynth();

    AC.audioWorklet.addModule("scripts/worklet.js");
}

function initMIDI() {
    navigator.requestMIDIAccess().then((access) => {
        midi = access;
        access.inputs.forEach((e) => {
            e.onmidimessage = onMIDIMessage;
        });
    });
}

let midiCCbind = null;

function bindMIDICC(name) {
    midiCCbind = name;
}

function onMIDIMessage(event) {
    let str = `MIDI message received at timestamp ${event.timeStamp}[${event.data.length} bytes]: `;
    for (const character of event.data) {
        str += `0x${character.toString(16)} `;
    }
    console.log(str);

    const nodes = fx.getAllNodes();
    // MIDI CC
    if(event.data[0] == 0xB0) {
        if(midiCCbind != null) {
            get("constmidicc_" + midiCCbind).value = event.data[1];
            get("autobindcc_" + midiCCbind).checked = false;
            midiCCbind = null;
        }
        for(let k in nodes) {
            if(nodes[k].fxtype == "constant" && nodes[k].node.type == "MIDI_CC" && nodes[k].node.data == event.data[1]) {
                nodes[k].setParam("offset", event.data[2] / 127.);
            }
        }
    }

    // Pitch bend
    if((event.data[0] & 0xF0) == 0xE0) {
        let value = (event.data[1] | (event.data[1] << 7) - 0x2000);
        if(value > 0) value /= 0x1FFF;
        else value /= 0x2000;
        for(let k in nodes) {
            if(nodes[k].fxtype == "constant" && nodes[k].node.type == "PITCH_BEND" && nodes[k].node.data == event.data[1]) {
                nodes[k].setParam("offset", value);
            }
        }
    }

    if((event.data[0] & 0xF0) == 0x90) {
        if(event.data[2] == 0)
            stopNote(event.data[1]);
        else
            playNote(event.data[1], event.data[2]);
    } else if((event.data[0] & 0xF0) == 0x80) {
        stopNote(event.data[1]);
    }
}

function drawSynth() {
    if(AC === null) return;
    const canvas = get("synth");
    if(canvas === null) return;
    let ctx = canvas.getContext("2d");
    // let ctx = new CanvasRenderingContext2D();

    const notes = ["C", "D", "E", "F", "G", "A", "B"];
    const sharps = [0, 1, 3, 4, 5];
    const noteSize = 50;
    const octave = get('octave').value;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    ctx.fillStyle = "black";
    let i = 0;
    for(let x = 0; x < canvas.width; x += noteSize) {
        const note = notes[i % 7];
        ctx.fillText(note + String(Number(octave) + Math.floor(i / 7)), x + 18, canvas.height * .95);
        ctx.moveTo(x + noteSize, 0);
        ctx.lineTo(x + noteSize, canvas.height);
        if (sharps.includes(i % 7)) {
            ctx.fillRect(x + noteSize * 3 / 4, 0, noteSize / 2, canvas.height * .7);
            ctx.fill();
        }
        ctx.stroke();
        i++;
    }

    let down = false, pressed = 0;
    canvas.onmousedown = (e) => {
        const pos = getCanvasPos(canvas, e);
        const note = Math.floor(pos.x / noteSize);
        let n = 0;
        for (let i = 0; i < note; i++, n++) if(sharps.includes(i % 7)) n++;
        if (e.button == 0) {
            if(pos.y < canvas.height * .7) {
                if(sharps.includes((note - 1) % 7) && pos.x % noteSize < noteSize *.25) n--;
                else if(sharps.includes(note % 7) && pos.x % noteSize > noteSize * .75) n++;
            }
            playNote(get('octave').value * 12 + 12 + n);
            pressed = n;
        }
        down = true;
    };
    canvas.onmousemove = (e) => {
        const pos = getCanvasPos(canvas, e);
        const note = Math.floor(pos.x / noteSize);
        let n = 0;
        for (let i = 0; i < note; i++, n++) if(sharps.includes(i % 7)) n++;
        if(pos.y < canvas.height * .7) {
            if(sharps.includes((note - 1) % 7) && pos.x % noteSize < noteSize *.25) n--;
            else if(sharps.includes(note % 7) && pos.x % noteSize > noteSize * .75) n++;
        }
        if(down && n != pressed) {
            stopNote(get('octave').value * 12 + 12 + pressed);
            playNote(get('octave').value * 12 + 12 + n);
            pressed = n;
        }
    };
    canvas.onmouseleave = (e) => {
        for(let k in osc) stopNote(Number(k));
        down = false;
    };
    canvas.onmouseup = (e) => {
        if (e.button == 0) {
            for(let k in osc) stopNote(Number(k));
            down = false;
        }
    };
    let touches = {};
    canvas.ontouchstart = (e) => {
        for(let touch = 0; touch < e.changedTouches.length; touch++) {
            const t = e.changedTouches.item(touch);
            const pos = getCanvasPos(canvas, t);
            const note = Math.floor(pos.x / noteSize);
            let n = 0;
            for (let i = 0; i < note; i++, n++) if(sharps.includes(i % 7)) n++;
            if(pos.y < canvas.height * .7) {
                if(sharps.includes((note - 1) % 7) && pos.x % noteSize < noteSize *.25) n--;
                else if(sharps.includes(note % 7) && pos.x % noteSize > noteSize * .75) n++;
            }
            playNote(get('octave').value * 12 + 12 + n);
            touches[t.identifier] = get('octave').value * 12 + 12 + n;
        }
    };
    canvas.ontouchmove = (e) => {
        for(let touch = 0; touch < e.changedTouches.length; touch++) {
            const t = e.changedTouches.item(touch);
            const pos = getCanvasPos(canvas, t);
            const note = Math.floor(pos.x / noteSize);
            let n = 0;
            for (let i = 0; i < note; i++, n++) if(sharps.includes(i % 7)) n++;
            if(pos.y < canvas.height * .7) {
                if(sharps.includes((note - 1) % 7) && pos.x % noteSize < noteSize *.25) n--;
                else if(sharps.includes(note % 7) && pos.x % noteSize > noteSize * .75) n++;
            }
            const val = get('octave').value * 12 + 12 + n;
            if(touches[t.identifier] != val) {
                stopNote(touches[t.identifier]);
                playNote(val);
                touches[t.identifier] = val;
            }
        }
    };
    canvas.ontouchend = (e) => {
        for(let touch = 0; touch < e.changedTouches.length; touch++) {
            const t = e.changedTouches.item(touch);
            stopNote(touches[t.identifier]);
            delete touches[t.identifier];
        }
    };
}

function addFx(type) {
    let node = FX_TYPES[type];
    if(node === undefined) return;

    const audioNode = new node(AC);
    if(type === "constant") audioNode.type = "CONSTANT";
    if(type === "analyser") audioNode.type = "fft";
    fx.addNode(audioNode);
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
        // XXX wtf
        if(drawn['canvas'] !== undefined) setTimeout(() => drawn['canvas'](), 1);
    }
    get('fxEditor').innerHTML += '<br>';
    // TODO open channels editor see https://developer.mozilla.org/docs/Web/API/AudioNode
}

function setNodeLabel(name, label) {
    let node = getAudioNode(name);
    if(node === null) return;
    node.setLabel(label);
    updateModUI(fx.getAllNodes());
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

function playNote(note = 69, vel = 90) {
    if(AC === null) return;
    if(osc[note] !== undefined) return;

    const nodes = copyFxs(fx.getAllNodes().concat(getModulationNodes()));

    const time = AC.currentTime;
    for(let k in nodes) {
        if(nodes[k].fxtype == 'oscillator' || nodes[k].fxtype == 'audiobuffersource') nodes[k].node.start(time);
        else if(nodes[k].fxtype == 'constant') {
            switch(nodes[k].node.type) {
                case "CONSTANT":
                case "MIDI_CC":
                    break;
                case "EXT_PARAM":
                    switch(nodes[k].node.data) {
                        case "FREQUENCY":
                            nodes[k].setParam("offset", getNoteFreq(note));
                            break;
                        case "NOTE":
                            nodes[k].setParam("offset", note);
                            break;
                        case "VELOCITY":
                            nodes[k].setParam("offset", vel);
                            break;
                    }
                    break;
                case "ENVELOPE":
                    nodes[k].node.data.start(AC.currentTime, nodes[k].node.offset);
                    break;
            }
            nodes[k].node.start(time);
        }

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

function stopNote(note = 69) {
    if(osc[note] === undefined) return;
    const nodes = osc[note];
    let maxEnv = 0;
    for(let k in nodes) {
        if(nodes[k].fxtype == 'constant') {
            if(nodes[k].node.type == "ENVELOPE") {
                if(maxEnv < nodes[k].node.data.release) maxEnv = nodes[k].node.data.release;
                nodes[k].node.data.end(AC.currentTime, nodes[k].node.offset);
            }
        }
    }
    setTimeout(() => {
        for(let k in nodes) {
            if(nodes[k].fxtype == "worklet")
                nodes[k].node.port.postMessage({type: "stop"});
            nodes[k].disconnect();
        }
    }, maxEnv);
    for(let k in osc[note]) {
        if(osc[note][k].fxtype == 'oscillator' || osc[note][k].fxtype == 'audiobuffersource')
            nodes[k].node.stop(AC.currentTime + maxEnv / 1000);

        getAudioNode(k).removeEventListener('paramChange', osc[note][k].paramListener);
        getAudioNode(k).removeEventListener('valueChange', osc[note][k].valueListener);
    }
    delete osc[note];
}

let drawOscilloscope = true;

// XXX remove this
async function mainloop() {
    setTimeout(mainloop, 1/20);

    if(AC === null) {
        document.body.scrollTop = document.documentElement.scrollTop = 0;
        return;
    }
    const canvas = get("oscilloscope");
    if(canvas === null) return;
    const dots = 20;
    if (drawOscilloscope) {
        let ctx = canvas.getContext("2d");
        //let ctx = new CanvasRenderingContext2D();
        const h = canvas.height * .95, hh = Math.floor(canvas.height / 2 * .95),
            w = canvas.width, ww = Math.floor(canvas.width / 2);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, canvas.height);
        ctx.fillStyle = "grey";
        ctx.fillRect(0, 0, w, h);
        const arr = new Float32Array(masterOscilloscope.fftSize);
        masterOscilloscope.getFloatTimeDomainData(arr);

        ctx.lineWidth = 2;
        ctx.strokeStyle = "yellow";
        ctx.beginPath();
        ctx.moveTo(1, -arr[1] * hh + hh);
        for(let i = 1; i < w; i++)
            ctx.lineTo(i, -arr[Math.floor(arr.length * i / w)] * hh + hh);
        ctx.stroke();

        /* TODO toggleable lines for high frequency signals
        ctx.fillStyle = "yellow";
        for (let i = 0; i < ww; i++)
            ctx.fillRect(i, arr[Math.floor(arr.length * i / ww)] * hh + hh, 3, 3);*/

        ctx.lineWidth = 1;
        ctx.strokeStyle = "black";
        ctx.strokeText("ms", ww, canvas.height-12);
        for(let i = 0; i < dots; i++) {
            let x = i * w / dots + 10;
            ctx.strokeText("" + Math.floor(i * (1000 / AC.sampleRate * arr.length)), x, canvas.height-2);
        }
    }

    {
        const spectrum = get("spectrum");
        if(spectrum === null) return;
        let ctx = spectrum.getContext("2d");
        //let ctx = new CanvasRenderingContext2D();
        const h = spectrum.height * .95,
            w = spectrum.width;
        ctx.lineWidth = 1;
        ctx.strokeStyle = "black";
        const arr = new Float32Array(masterFFTAnalyser.frequencyBinCount);
        const width = w / arr.length;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, spectrum.height);
        ctx.fillStyle = "grey";
        ctx.fillRect(0, 0, w, h);
        // XXX use byte values instead
        masterFFTAnalyser.getFloatFrequencyData(arr);
        ctx.fillStyle = "red";
        const MIN_DB = -40;
        for(let i = 0; i < arr.length; i++) {
            let y = arr[i] / MIN_DB * h - h * .35;
            if(!isFinite(y) || y >= h) continue;
            let x1 = linearToLog(i * width + 1, 1, w),
                x2 = linearToLog((i + 1) * width + 1, 1, w);
            //y -= (x1 + x2) / w * h; // The higher frequencies' slope
            ctx.fillRect(x1, y, x2 - x1, h - y);
        }
        const HZ_SCALE = [5, 12, 32, 55, 90, 140, 210, 310, 440, 610, 900, 1250, 1700, 2400, 3400, 4800, 6700, 9500, 13500, 19000];
        ctx.lineWidth = 1;
        ctx.strokeStyle = "black";
        ctx.strokeText("Hz", w / 2, spectrum.height-12);
        for(let i = 0; i < dots; i++) {
            let x = i * w / dots + 10;
            ctx.strokeText("" + HZ_SCALE[i], x, spectrum.height-2);
        }
    }
}

let fx = null;
let drawflow = null;

window.onload = () => {
    hljs.highlightAll();
    /*get("workletcode").addEventListener("input", () => {
        delete get("workletcodedisplay").dataset.highlighted;
        get("workletcodedisplay").innerText = get("workletcode").value;
        hljs.highlightAll();
    });*/
    AC = null;

    let id = document.getElementById("drawflow");
    drawflow = new Drawflow(id);
    drawflow.reroute = true;
    drawflow.curvature = .25;
    drawflow.start();

    get("synth").ontouchend = (e) => {
        e.preventDefault();
        get("synth").onmouseup();
    };

    let fader = get("fader");
    fader.onmousemove = fader.onchange = fader.ontouchmove = function() {
        if(AC === null) return;
        get("fadervalue").innerHTML = this.value + " db";
        masterFader.gain.setTargetAtTime(dbToRatio(this.value), AC.currentTime, uiChange);
    };

    const KEYS = ['IntlBackslash', 'KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM',
                'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'],
        KEY_START = 11;

    window.addEventListener("keydown", function(e) {
        if(KEYS.indexOf(e.code) !== -1)
            playNote(KEY_START + KEYS.indexOf(e.code) + get("octave").value*12);
    });

    window.addEventListener("keyup", function(e) {
        if(KEYS.indexOf(e.code) !== -1)
            stopNote(KEY_START + KEYS.indexOf(e.code) + get("octave").value*12);
    });

    mainloop();
}