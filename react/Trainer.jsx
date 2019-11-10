import React from 'react'
import axios from 'axios'
import tinycolor from 'tinycolor2'
import { random } from './utils'
import { MicAI } from './MicAI.jsx'
import { FileAI } from './FileAI.jsx'


class Player extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isStarted: false,
            isRecording: false,
            hasRecording: false,
            playing: false,
            itemKey: null,
            loading: false,
        }
        this.recordedBlobs = [];
        this.tone = new Tone.Player({
            "loop" : false
        }).toMaster();
        this.start()
        document.querySelector("tone-player").bind(this.tone);
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
        this.setState({isRecording: true})
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
    }

    _computeRMS(buffer, width){
        const array = buffer.toArray(0)
        if (this.fileAI)
            this.fileAI.onLoaded(buffer, array)
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
        this._waveform = rmses.map(v => Math.scale(Math.pow(v, 0.8), 0, max, 0, 1))
    }

    onLoaded() {
        try {
            let {tone} = this
            this.togglePlay(null, false)

            const { buffer } = tone
            const {width, height} = this.wavCanvas
            const context = this.wavCanvas.getContext('2d')
            context.clearRect(0, 0, width, height)
            this._computeRMS(buffer, width)

            const loopStart = Math.scale(tone.loopStart, 0, buffer.duration, 0, width)
            let loopEnd = Math.scale(tone.loopEnd, 0, buffer.duration, 0, width)
            if (tone.loopEnd === 0) {
                loopEnd = width
            }
            this.color = '#0dd';
            context.fillStyle = this.color
            const lightened = tinycolor(this.color).setAlpha(0.2).toRgbString()
            this._waveform.forEach((val, i) => {
                const barHeight = val * height
                const x = tone.reverse ? width - i : i
                if (tone.loop) {
                    context.fillStyle = loopStart > x || x > loopEnd ? lightened : this.color
                }
                context.fillRect(x, height / 2 - barHeight / 2, 1, barHeight)
                context.fill()
            })
            this.setState({hasRecording: true})
            let {itemKey} = this.state
            axios.get(`/api/train_list/${itemKey}`)
                .then(response => {
                    console.log("Got train info:", itemKey, buffer.duration, response.data)
                    /*this.setState({
                        trainItems: response.data.items
                    })*/
                    this.setState({loading: false})
                })
                .catch(console.error)
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
        let itemIndex = Math.floor(random(0, this.props.trainItems.length))
        let itemKey = this.props.trainItems[itemIndex]
        console.log('next itemKey', itemIndex, itemKey)
        this.setState({itemKey, loading: true})
        this.loadUrl(`/static/LibriTTS/train-clean-100/${itemKey}.wav`)
    }

    render() {
        let { isStarted, isRecording, hasRecording, playing, itemKey, loading } = this.state
        return (
            <div>
                <MicAI />
                <FileAI ref={x => this.fileAI = x}/>
                <div className="card my-5">
                    <h5 className="card-header">
                        {loading ? <span><i className="fa fa-spin fa-spinner"></i> Loading...</span> : <span>Wave loader</span>}
                    </h5>
                    <div className="card-body">
                        <canvas id="my-wav" className="border border-primary" width="600" height="100" ref={wavCanvas => {this.wavCanvas = wavCanvas}}></canvas>
                    </div>
                    <div className="card-footer text-muted">
                        {isStarted && !isRecording && <button className="btn btn-warning" onClick={this.record.bind(this)}>Record</button>}
                        {isStarted && isRecording && <button className="btn btn-danger" onClick={this.stop.bind(this)}>Stop</button>}
                        {this.recordedBlobs.length > 0 && <button className="btn btn-secondary ml-1" onClick={this.download.bind(this)}>Download recording</button>}
                        {hasRecording && <button className="btn btn-success ml-1" onClick={this.togglePlay.bind(this)}>{playing ? "Stop" : "Play"}</button>}
                        <button className="btn btn-primary ml-1" onClick={this.loadNextItem.bind(this)}>Load next (currently: {itemKey})</button>
                    </div>
                </div>
            </div>
        )
    }

}


export default class App extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            trainItems: [],
            loading: true,
        }

        axios.get('/api/train_list/')
            .then(response => {
                console.log("Got train list:", response.data)
                this.setState({
                    trainItems: response.data.items,
                    loading: false,
                })
            })
            .catch(console.error)
    }

    render() {
        let {trainItems, loading} = this.state
        return (
            <div>
                <h1>GentleTrainer</h1>
                {loading ? <div className="alert alert-warning">Loading...</div> : <div className="alert alert-secondary">{trainItems.length} training items loaded.</div>}
                <Player trainItems={trainItems} />
            </div>
        )
    }
}