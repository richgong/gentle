import React from 'react'
import axios from 'axios'
import tinycolor from 'tinycolor2'
import { random, flatten } from './utils'
import { MicAI } from './MicAI.jsx'
import {ExtractFFT, FRAME_SIZE} from "./ExtractFFT";

export const NUM_FRAMES = 3
export const INPUT_SHAPE = [NUM_FRAMES, FRAME_SIZE, 1]


export default class App extends React.Component {
    constructor(props) {
        super(props)
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
    }

    buildModel() {
        let model = tf.sequential();
        model.add(tf.layers.depthwiseConv2d({
            depthMultiplier: 8,
            kernelSize: [NUM_FRAMES, 3],
            activation: 'relu',
            inputShape: INPUT_SHAPE
        }));
        model.add(tf.layers.maxPooling2d({poolSize: [1, 2], strides: [2, 2]}));
        model.add(tf.layers.flatten());
        model.add(tf.layers.dense({units: 3, activation: 'softmax'}));
        const optimizer = tf.train.adam(0.01);
        model.compile({
            optimizer,
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        return model
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
        } else {
            this.tone.stop()
        }
        this.setState({playing})
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
        this.wavesurfer.load(url)
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
                context.fillStyle = `rgb(${c}, ${c}, ${c})`
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
                axios.get(`/api/train_list/${itemKey}`)
                    .then(response => {
                        let {item} = response.data
                        console.log("GOT TRAIN ITEM:", buffer.duration, item)
                        this.setState({loading: false, item})
                    })
                    .catch(console.error)
            }
        } catch (error) {
            console.error(error)
        }
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
                                    <div>{phone.phone} / {phone.duration}</div>
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
                {loadingLibrary ? <div className="alert alert-warning">Loading...</div> : <div className="alert alert-secondary">{libraryItems.length} training items loaded.</div>}
                <MicAI />
                <h3>FileAI</h3>
                <div className="card">
                    <h5 className="card-header">
                        {loading ? <span><i className="fa fa-spin fa-spinner"></i> Loading...</span> : <span>Wave loader</span>}
                    </h5>
                    <div className="card-body">
                        Wave:
                        <canvas className="border border-primary d-block mb-2" width="600" height="100" ref={x => {this.wavCanvas = x}}></canvas>
                        Spectrogram:
                        <canvas className="border border-primary d-block mb-2" width="600" height="100" ref={x => {this.fftCanvas = x}}></canvas>
                        {this.renderItem()}
                    </div>
                    <div className="card-footer text-muted">
                        {isStarted && !isRecording && <button className="btn btn-warning" onClick={this.record.bind(this)}>Record</button>}
                        {isStarted && isRecording && <button className="btn btn-danger" onClick={this.stop.bind(this)}>Stop</button>}
                        {this.recordedBlobs.length > 0 && <button className="btn btn-secondary ml-1" onClick={this.download.bind(this)}>Download recording</button>}
                        {hasRecording && <button className="btn btn-success ml-1" onClick={this.togglePlay.bind(this)}>{playing ? "Stop" : "Play"}</button>}
                        {!loadingLibrary && <button className="btn btn-primary ml-1" onClick={this.loadNextItem.bind(this)}>Load next (current: {itemKey || 'N/A'})</button>}
                    </div>
                </div>
            </div>
        )
    }
}