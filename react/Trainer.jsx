import React from 'react'
import axios from 'axios'


let mediaRecorder;
let recordedBlobs;
let sourceBuffer;


/*const playButton = document.querySelector('button#play');
playButton.addEventListener('click', () => {
    const superBuffer = new Blob(recordedBlobs, {type: 'video/webm'});
    recordedVideo.src = null;
    recordedVideo.srcObject = null;
    let url = window.URL.createObjectURL(superBuffer)
    recordedVideo.src = url;
    recordedVideo.controls = true;
    recordedVideo.play();

    // GONG) Tone.js
    console.log("URL:", url)
    var player = new Tone.Player({
        "url" : url,
        "loop" : true,
        "loopStart" : 0.5,
        "loopEnd" : 0.7,
    }).toMaster();

    document.querySelector("tone-player").bind(player);
    document.querySelector("tone-play-toggle").bind(player);
});*/

/*const downloadButton = document.querySelector('button#download');
downloadButton.addEventListener('click', () => {
    const blob = new Blob(recordedBlobs, {type: 'video/webm'});
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'test.webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
});*/


/*function handleDataAvailable(event) {
    if (event.data && event.data.size > 0) {
        recordedBlobs.push(event.data);
    }
}

function startRecording() {
    recordedBlobs = [];
    let options = {mimeType: 'audio/webm;codecs=vp9'};
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.error(`${options.mimeType} is not Supported`);
        errorMsgElement.innerHTML = `${options.mimeType} is not Supported`;
        options = {mimeType: 'video/webm;codecs=vp8'};
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.error(`${options.mimeType} is not Supported`);
            errorMsgElement.innerHTML = `${options.mimeType} is not Supported`;
            options = {mimeType: 'video/webm'};
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                console.error(`${options.mimeType} is not Supported`);
                errorMsgElement.innerHTML = `${options.mimeType} is not Supported`;
                options = {mimeType: ''};
            }
        }
    }

    try {
        mediaRecorder = new MediaRecorder(window.stream, options);
    } catch (e) {
        console.error('Exception while creating MediaRecorder:', e);
        errorMsgElement.innerHTML = `Exception while creating MediaRecorder: ${JSON.stringify(e)}`;
        return;
    }

    console.log('Created MediaRecorder', mediaRecorder, 'with options', options);
    recordButton.textContent = 'Stop Recording';
    playButton.disabled = true;
    downloadButton.disabled = true;
    mediaRecorder.onstop = (event) => {
        console.log('Recorder stopped: ', event);
    };
    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.start(10); // collect 10ms of data
    console.log('MediaRecorder started', mediaRecorder);
}

function stopRecording() {
    mediaRecorder.stop();
    console.log('Recorded Blobs: ', recordedBlobs);
}

*/


class Recorder extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isStarted: false,
        }
        this.mediaSource = new MediaSource();
        this.mediaSource.addEventListener('sourceopen', event => {
            console.log('MediaSource opened');
            sourceBuffer = this.mediaSource.addSourceBuffer('video/webm; codecs="vp8"');
            console.log('Source buffer: ', sourceBuffer);
        }, false);
    }

    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: {exact: false}
                },
                video: { width: 1280, height: 720 }
            });
            console.log('getUserMedia() success:', stream);
            this.setState({ isStarted: true })
            window.stream = stream;
            this.preview.srcObject = stream;
        } catch (e) {
            console.error('start() failed:', e);
        }
    }

    render() {
        return (
            <div className="card my-5">
                <h5 className="card-header">
                    Recorder
                </h5>
                <div className="card-body">
                    <video className="border border-secondary" playsinline autoPlay muted ref={preview => {this.preview = preview}}></video>
                </div>
                <div className="card-footer text-muted">
                    <button className="btn btn-secondary" onClick={this.start.bind(this)}>Start</button>
                </div>
            </div>

        )
    }

}


export default class App extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            trainItems: null
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
                <Recorder />
            </div>
        )
    }
}