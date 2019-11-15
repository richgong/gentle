import React from 'react'
import axios from 'axios'
import tinycolor from 'tinycolor2'
import { random, flatten, LoopList } from './utils'
import { MicAI } from './MicAI.jsx'
import {ExtractFFT, FRAME_SIZE} from "./ExtractFFT";
// import PHONE_MAP from './phones.json'
import PRESTONBLAIR_TO_OUTPUT from './prestonblair_to_output.json'
import GENTLE_TO_PRESTONBLAIR from './gentle_to_prestonblair.json'

export const NUM_FRAMES = 10
export const INPUT_SHAPE = [NUM_FRAMES, FRAME_SIZE, 1]
export const NUM_OUTPUT = Object.keys(PRESTONBLAIR_TO_OUTPUT).length

function getOutputFromGentlePhone(phone) {
    let prestonBlair = GENTLE_TO_PRESTONBLAIR[phone]
    if (!prestonBlair) {
        console.warn("Gentle phone not mapped to PrestonBlair:", phone)
        return -1
    }
    let output = PRESTONBLAIR_TO_OUTPUT[prestonBlair]
    if (!output) {
        console.warn("PrestonBlair not found:", prestonBlair)
        return -1
    }
    return output
}

const OUTPUT_TO_PRESTONBLAIR = [], PRESTONBLAIR_TO_IMG = {}
for (let [prestonBlair, index] of Object.entries(PRESTONBLAIR_TO_OUTPUT)) {
    OUTPUT_TO_PRESTONBLAIR[index] = prestonBlair
    let img = PRESTONBLAIR_TO_IMG[prestonBlair] = new Image()
    img.src = `/static/prestonblair/${prestonBlair}.jpg`
}

export default class App extends React.Component {
    constructor(props) {
        super(props)
        this.animate = this.animate.bind(this)
        this.state = {
            libraryItems: [],
            loadingLibrary: true,
            isStarted: false,
            isRecording: false,
            hasRecording: false,
            playing: false,
            itemKey: null,
            item: null,
            loading: false,
            dummy: 0,
        }
        this.recordedBlobs = [];
        this.tone = new Tone.Player({
            "loop" : false
        }).toMaster();
        this.start()
        document.querySelector("tone-player").bind(this.tone);
        this.wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: 'violet',
            progressColor: 'purple',
            loaderColor: 'purple',
            cursorColor: 'navy',
            plugins: [
                WaveSurfer.spectrogram.create({
                    container: '#spectrogram',
                    labels: true
                })
            ]
        })
        this.extractFFT = new ExtractFFT()

        axios.get('/api/train_list/')
            .then(response => {
                console.log("Got train list:", response.data)
                this.setState({
                    libraryItems: response.data.items,
                    loadingLibrary: false,
                })
            })
            .catch(console.error)

        this.model = this.buildModel()
        this.examples = []
        this.outputToCount = {}
        this.markers = []
    }

    componentDidMount() {
        this.animateContext = this.animateCanvas.getContext('2d')
    }

    /**
     * See:
     *   https://js.tensorflow.org/api/0.11.2/#layers.simpleRNN
     *   https://www.tensorflow.org/api_docs/python/tf/keras/layers/Reshape
     *   https://towardsdatascience.com/time-series-forecasting-with-tensorflow-js-1efd48ff2201
     */
    buildModel() {
        let kind = 'basic'
        if (kind == 'basic') {
            let model = tf.sequential();
            model.add(tf.layers.depthwiseConv2d({
                depthMultiplier: 8,
                kernelSize: [NUM_FRAMES, 3],
                activation: 'relu',
                inputShape: INPUT_SHAPE
            }));
            model.add(tf.layers.maxPooling2d({poolSize: [1, 2], strides: [2, 2]}));
            model.add(tf.layers.flatten());
            model.add(tf.layers.dense({units: NUM_OUTPUT, activation: 'softmax'}));
            const optimizer = tf.train.adam(0.01);
            model.compile({
                optimizer,
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });
            return model
        } else if (kind == 'rnn') {
            let model = tf.sequential();
            model.add(tf.layers.depthwiseConv2d({
                depthMultiplier: 8,
                kernelSize: [NUM_FRAMES, 3],
                activation: 'relu',
                inputShape: INPUT_SHAPE
            }));
            model.add(tf.layers.maxPooling2d({poolSize: [1, 2], strides: [2, 2]}));

            console.log("Pre RNN #1:", model.outputShape)
            model.add(tf.layers.reshape({targetShape: [19, 8]}));
            //console.log("Pre RNN #2:", model.outputShape)
            model.add(tf.layers.simpleRNN({ units: 30, returnSequences: true }))
            //model.add(tf.layers.flatten());
            console.log("Pre output:", model.outputShape)

            model.add(tf.layers.dense({units: NUM_OUTPUT, activation: 'softmax'}));
            const optimizer = tf.train.adam(0.01);
            model.compile({
                optimizer,
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });
            return model
        }
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false // { width: 1280, height: 720 },
            });
            console.log('getUserMedia() success:', this.stream);
            this.setState({ isStarted: true })
            // this.preview.srcObject = this.stream;

            this.mediaRecorder = new MediaRecorder(this.stream)
            this.mediaRecorder.ondataavailable = this.onRecordData.bind(this);
            console.log('Created MediaRecorder', this.mediaRecorder);
        } catch (e) {
            console.error('start() failed:', e);
        }
    }

    record() {
        this.recordedBlobs = [];
        this.mediaRecorder.start(10); // collect 10ms of data
        this.setState({isRecording: true, itemKey: null, item: null})
    }

    onRecordData(event) {
        if (event.data && event.data.size > 0) {
            this.recordedBlobs.push(event.data);
        }
    }

    togglePlay(e, playing=null) {
        if (playing === null)
            playing = !this.state.playing
        if (playing) {
            this.tone.start()
            // this.audio.play()
            this.markerIndex = 0
            this.startedAt = this.tone.context.currentTime
            this.animationId = requestAnimationFrame(this.animate);
        } else {
            this.tone.stop()
            //this.audio.paused()
            cancelAnimationFrame(this.animationId);
        }
        this.setState({playing})
    }

    animate() {
        //this.animationLooper(this.canvas.current);
        //this.analyser.getByteTimeDomainData(this.frequency_array);
        // Dirty hack: https://stackoverflow.com/questions/31644060/how-can-i-get-an-audiobuffersourcenodes-current-time
        let time = this.tone.context.currentTime - this.startedAt
        if (this.markers && this.markerIndex < this.markers.length) {
            if (time >= this.markers[this.markerIndex].start) {
                let { label, output } = this.markers[this.markerIndex]
                if (output !== -1) {
                    //console.log("NEW", time, label)
                    this.animateContext.drawImage(PRESTONBLAIR_TO_IMG[label], 0, 0)
                }
                this.markerIndex++
            }
        }
        //console.log("ANIMATE", time, this.markerIndex, this.markers.length)
        this.animationId = requestAnimationFrame(this.animate);
    }

    stop() {
        this.mediaRecorder.stop();
        this.setState({isRecording: false})

        const superBuffer = new Blob(this.recordedBlobs);
        let url = window.URL.createObjectURL(superBuffer)
        this.loadUrl(url);
    }

    loadUrl(url) {
        this.tone.load(url, this.onLoaded.bind(this));
        //this.audio = new Audio(url)
        this.wavesurfer.load(url)

        //this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        //this.audioSource = this.audioContext.createMediaElementSource(this.audio);
    }

    computeRMS(array, width){
        const length = 64
        const rmses = []
        for (let i = 0; i < width; i++){
            const offsetStart = Math.floor(Math.scale(i, 0, width, 0, array.length - length))
            const offsetEnd = offsetStart + length
            let sum = 0
            for (let s = offsetStart; s < offsetEnd; s++){
                sum += Math.pow(array[s], 2)
            }
            const rms = Math.sqrt(sum / length)
            rmses[i] = rms
        }
        const max = Math.max(...rmses)
        return rmses.map(v => Math.scale(Math.pow(v, 0.8), 0, max, 0, 1))
    }

    drawWave(tone, buffer, array) {
        const {width, height} = this.wavCanvas
        const context = this.wavCanvas.getContext('2d')
        context.clearRect(0, 0, width, height)
        let waveform = this.computeRMS(array, width)
        let loopStart = Math.scale(tone.loopStart, 0, buffer.duration, 0, width)
        let loopEnd = Math.scale(tone.loopEnd, 0, buffer.duration, 0, width)
        if (tone.loopEnd === 0) {
            loopEnd = width
        }
        let color = '#0dd';
        context.fillStyle = color
        const lightened = tinycolor(color).setAlpha(0.2).toRgbString()
        waveform.forEach((val, i) => {
            const barHeight = val * height
            const x = tone.reverse ? width - i : i
            if (tone.loop) {
                context.fillStyle = loopStart > x || x > loopEnd ? lightened : color
            }
            context.fillRect(x, height / 2 - barHeight / 2, 1, barHeight)
            context.fill()
        })
    }

    drawFft(tone, buffer, slices) {
        const {width, height} = this.fftCanvas
        const context = this.fftCanvas.getContext('2d')
        context.clearRect(0, 0, width, height)
        if (!slices.length)
            return

        let incWidth = width / slices.length
        let incHeight = height / slices[0].length
        let max = slices[0][0], min = slices[0][0]

        for (let i = 0; i < slices.length; ++i) {
            let slice = slices[i]
            for (let j = 0; j < slice.length; ++j) {
                let v = slice[j]
                max = Math.max(v, max)
                min = Math.min(v, min)
            }
        }
        console.log(`Range: min=${min} max=${max} incWidth=${incWidth} incHeight=${incHeight}`)

        for (let i = 0; i < slices.length; ++i) {
            let slice = slices[i]
            for (let j = 0; j < slice.length; ++j) {
                let v = slice[j]
                let c = Math.floor(Math.scale(v, min, max, 0, 1) * 255.0)
                context.fillStyle = `rgb(0, ${c}, ${c})`
                context.fillRect(i * incWidth, height - (j + 1) * incHeight, incWidth, incHeight)
            }
        }
    }

    onLoaded() {
        try {
            let {tone} = this
            this.togglePlay(null, false)

            const { buffer } = tone
            let array = buffer.toArray(0)
            this.drawWave(tone, buffer, array)

            let fftSlices = this.extractFFT.extract(array)
            console.log("extractFFT:", buffer._buffer, array.length, "=>", fftSlices.length)
            this.drawFft(tone, buffer, fftSlices)

            this.setState({hasRecording: true})
            let {itemKey} = this.state
            if (itemKey) {
                this.collectTrainingExamples(buffer, itemKey, fftSlices)
            } else {
                this.predict(buffer, itemKey, fftSlices)
            }
        } catch (error) {
            console.error(error)
        }
    }

    async predict(buffer, itemKey, fftSlices) {
        let {sampleRate} = buffer._buffer
        let queue = []
        let predictions = []
        for (let i = 0; i < fftSlices.length; ++i) {
            let slice = fftSlices[i]
            if (queue.length >= NUM_FRAMES)
                queue.shift()
            queue.push(slice)
            if (queue.length >= NUM_FRAMES) {
                const input = tf.tensor(flatten(queue), [1, ...INPUT_SHAPE]);
                const probs = this.model.predict(input);
                const predLabel = probs.argMax(1);
                const output = (await predLabel.data())[0];
                //console.warn("Prediction:", output, OUTPUT_TO_PRESTONBLAIR[output])
                predictions.push(output)
                tf.dispose([input, probs, predLabel])
            } else
                predictions.push(null)
        }
        // smooth over predictions
        let loopList = new LoopList(5)
        let modeMap = {}
        let smoothPred = []
        for (let i = 0; i < predictions.length; ++i) {
            let output = predictions[i]
            if (output != null) {
                modeMap[output] = (modeMap[output] || 0) + 1
                let old = loopList.push(output)
                if (old != null) {
                    modeMap[old] -= 1
                }
            }
            if (loopList.ready()) {
                console.warn("SHIT", modeMap)
                smoothPred[i - 2] = Object.keys(modeMap).reduce((a, b) => (modeMap[a] > modeMap[b] ? a : b));
            } else {
                smoothPred[i] = 0
            }
        }

        console.warn("Predictions / smoothPred:", predictions, smoothPred)

        let markers = []
        for (let i = 0; i < predictions.length; ++i) { // iterate over original "predictions" instead of smoothPred
            let start = (i * this.extractFFT.getStepSize()) / sampleRate
            let output = smoothPred[i] || 0
            if (!markers.length || (markers.length && output !== markers[markers.length - 1].output)) {
                markers.push({
                    start,
                    output,
                    label: OUTPUT_TO_PRESTONBLAIR[output],
                })
            }
        }
        this.markers = markers
        console.warn("Prediction markers", this.markers)
        this.rerender()
    }

    collectTrainingExamples(buffer, itemKey, fftSlices) {
        let {sampleRate} = buffer._buffer
        axios.get(`/api/train_list/${itemKey}`)
            .then(response => {
                let {item} = response.data
                console.log("NEW TRAIN ITEM:", buffer.duration, item)
                this.setState({loading: false, item})
                let markers = []
                let {words} = item
                let cursor = 0
                words.forEach(word => {
                    let {start, end, phones} = word
                    if (phones) {
                        if (cursor < start) {
                            markers.push({
                                start: cursor,
                                end: start,
                                output: 0,
                                label: 'rest',
                            })
                        }
                        cursor = start
                        phones.forEach(phone => {
                            let output = getOutputFromGentlePhone(phone.phone)
                            markers.push({
                                start: cursor,
                                end: cursor + phone.duration,
                                output,
                                label: output !== -1 ? OUTPUT_TO_PRESTONBLAIR[output] : 'rest',
                            })
                            cursor += phone.duration
                        })
                        cursor = end
                    }
                })
                markers.push({
                    start: cursor,
                    end: buffer.duration,
                    output: 0,
                    label: 'rest',
                })
                //console.warn("Markers:", markers)
                let markerIndex = 0
                let queue = []
                for (let i = 0; i < fftSlices.length; ++i) {
                    let slice = fftSlices[i]
                    let start = (i * this.extractFFT.getStepSize()) / sampleRate
                    while (markerIndex < markers.length && markers[markerIndex].end < start)
                        markerIndex++
                    if (queue.length >= NUM_FRAMES)
                        queue.shift()
                    queue.push(slice)
                    if (queue.length >= NUM_FRAMES && markerIndex < markers.length) {
                        // console.warn(start, markers[markerIndex])
                        // console.warn(queue.length, queue[0].length, queue)
                        let { output } = markers[markerIndex]
                        if (output !== -1) {
                            this.examples.push({input: flatten(queue), output});
                            this.outputToCount[output] = (this.outputToCount[output] || 0) + 1
                        }
                    }
                }
                this.markers = markers
                console.warn("outputToCount:", Object.keys(this.outputToCount).length, this.outputToCount)
                this.rerender()
            })
            .catch(console.error)
    }

    rerender() {
        this.setState({dummy: this.state.dummy + 1})
    }

    async train() {
        const ys = tf.oneHot(this.examples.map(e => e.output), NUM_OUTPUT);
        const xsShape = [this.examples.length, ...INPUT_SHAPE];
        const xs = tf.tensor(flatten(this.examples.map(e => e.input)), xsShape);

        await this.model.fit(xs, ys, {
            batchSize: 16,
            epochs: 10,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    console.warn(`Accuracy: ${(logs.acc * 100).toFixed(1)}% Epoch: ${epoch + 1}`);
                }
            }
        });
        tf.dispose([xs, ys]);
    }

    async save() {
        await this.model.save('downloads://my-model');
    }

    download() {
        let blob = new Blob(this.recordedBlobs);
        let url = window.URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'recording.webm';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    }

    loadNextItem() {
        let { libraryItems } = this.state
        let itemIndex = Math.floor(random(0, libraryItems.length))
        let itemKey = libraryItems[itemIndex]
        console.log('next itemKey', itemIndex, itemKey)
        this.setState({itemKey, loading: true})
        this.loadUrl(`/static/LibriTTS/train-clean-100/${itemKey}.wav`)
    }

    renderItem() {
        let {item} = this.state
        if (!item)
            return null
        let {transcript, words} = item
        return (
            <div className="my-2">
                <div className="alert alert-info">{transcript}</div>
                <table className="table">
                    <tbody>
                    {words.map((word, i) => {
                        let totalDuration = 0.
                        if (!word.phones)
                            return null
                        word.phones.forEach(x => {
                            totalDuration += x.duration
                        })

                        return <tr key={i}>
                            <td>
                                <div><b>{word.alignedWord}</b></div>
                                <div>{word.start} to {word.end} (duration = {totalDuration})</div>
                            </td>
                            <td>
                                {word.phones.map((phone, j) => (
                                    <div key={j}>{phone.phone} / {phone.duration}</div>
                                ))}
                            </td>
                        </tr>
                    })}
                    </tbody>
                </table>
            </div>
        )
    }

    render() {
        let {libraryItems, loadingLibrary, isStarted, isRecording, hasRecording, playing, itemKey, loading } = this.state
        return (
            <div>
                <MicAI />
                <h3>FileAI</h3>
                <canvas className="border border-info d-block mb-2" width="300" height="300" ref={x => {this.animateCanvas = x}}></canvas>
                <div className="card">
                    <h5 className="card-header">
                        {isStarted && !isRecording && <button className="btn btn-warning" onClick={this.record.bind(this)}>Record</button>}
                        {isStarted && isRecording && <button className="btn btn-danger" onClick={this.stop.bind(this)}>Stop</button>}
                        {this.recordedBlobs.length > 0 && <button className="btn btn-secondary m-1" onClick={this.download.bind(this)}>Download recording</button>}
                        {hasRecording && <button className="btn btn-success m-1" onClick={this.togglePlay.bind(this)}>{playing ? "Stop" : "Play"}</button>}
                        <button disabled={loadingLibrary || loading} className="btn btn-info m-1" onClick={this.loadNextItem.bind(this)}>
                            Load next (current: {itemKey || 'N/A'}) ({libraryItems.length} items)
                        </button>
                        <button className="btn btn-danger m-1" onClick={this.train.bind(this)}>Train on {this.examples.length} examples</button>
                        <button className="btn btn-danger m-1" onClick={this.save.bind(this)}>Save model</button>
                    </h5>
                    <div className="card-body">
                        Waveform:
                        <canvas className="border border-info d-block mb-2" width="600" height="100" ref={x => {this.wavCanvas = x}}></canvas>
                        Spectrogram:
                        <canvas className="border border-info d-block mb-2" width="600" height="100" ref={x => {this.fftCanvas = x}}></canvas>
                        {this.renderItem()}
                    </div>
                </div>
            </div>
        )
    }
}