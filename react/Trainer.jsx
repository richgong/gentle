import React from 'react'
import axios from 'axios'
import tinycolor from 'tinycolor2'
import { random } from './utils'


class Player extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isStarted: false,
            isRecording: false,
            hasRecording: false,
            playing: false,
            itemIndex: -1,
        }
        this.tone = new Tone.Player({
            "loop" : true
        }).toMaster();
        this.start()
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

    togglePlay() {
        if (this.state.playing) {
            this.tone.stop()
        } else {
            this.tone.start()
        }
        this.setState({playing: !this.state.playing})
    }

    stop() {
        this.mediaRecorder.stop();
        this.setState({isRecording: false, hasRecording: true})

        const superBuffer = new Blob(this.recordedBlobs);
        let url = window.URL.createObjectURL(superBuffer)

        // Tone.js
        this.tone.load(url, this.onLoaded.bind(this))
        document.querySelector("tone-player").bind(this.tone);
    }

    _computeRMS(buffer, width){
        const array = buffer.toArray(0)
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
            const buffer = tone.buffer
            const canvas = document.getElementById('my-wav')
            const {width, height} = canvas
            const context = canvas.getContext('2d')
            context.clearRect(0, 0, width, height)
            this._computeRMS(buffer, width)

            const loopStart = Math.scale(tone.loopStart, 0, buffer.duration, 0, width)
            let loopEnd = Math.scale(tone.loopEnd, 0, buffer.duration, 0, width)
            if (tone.loopEnd === 0) {
                loopEnd = width
            }
            this.color = '#cff';
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
        console.log('itemIndex', itemIndex)
        this.setState({itemIndex})
    }

    render() {
        let { isStarted, isRecording, hasRecording, playing, itemIndex } = this.state
        return (
            <div className="card my-5">
                <h5 className="card-header">
                    Wave player
                </h5>
                <div className="card-body">
                    <canvas id="my-wav" className="border border-primary" width="600" height="100" ref={wavCanvas => {this.wavCanvas = wavCanvas}}></canvas>
                </div>
                <div className="card-footer text-muted">
                    {isStarted && !isRecording && <button className="btn btn-warning" onClick={this.record.bind(this)}>Record</button>}
                    {isStarted && isRecording && <button className="btn btn-danger" onClick={this.stop.bind(this)}>Stop</button>}
                    {hasRecording && <button className="btn btn-secondary ml-1" onClick={this.download.bind(this)}>Download recording</button>}
                    {hasRecording && <button className="btn btn-success ml-1" onClick={this.togglePlay.bind(this)}>{playing ? "Stop" : "Play"}</button>}
                    <button className="btn btn-primary ml-1" onClick={this.loadNextItem.bind(this)}>Load next (currently: {itemIndex})</button>
                </div>
            </div>
        )
    }

}


export default class App extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            trainItems: []
        }

        axios.get('/api/train_list/')
            .then(response => {
                console.log("Got train list:", response.data)
                this.setState({
                    trainItems: response.data.items
                })
            })
            .catch(error => console.error)
    }

    render() {
        let {trainItems} = this.state
        return (
            <div>
                <h1>GentleTrainer</h1>
                {trainItems ? <div className="alert alert-success">{trainItems.length} training items loaded.</div> : <div className="alert alert-secondary">Loading...</div>}
                <Player trainItems={trainItems} />
            </div>
        )
    }
}