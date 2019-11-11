import {clamp, flatten} from './utils'

/**
 * FFT extractor using browser's native FFT.
 *
 * See BrowserFftFeatureExtractor:
 * https://github.com/tensorflow/tfjs-models/blob/master/speech-commands/src/browser_fft_extractor.ts#L88
 */

class Drawer {
    constructor(canvas, fftSize) {
        this.canvas = canvas
        this.context = this.canvas.getContext('2d')
        this.width = canvas.width
        this.height = canvas.height
        this.incHeight = this.height / fftSize
        this.incWidth = 1
        this.min = null
        this.max = null
    }

    drawSlice(slice) {
        let crop = this.context.getImageData(0, 0, this.width - this.incWidth, this.height);
        this.context.putImageData(crop, this.incWidth, 0);
        this.context.clearRect(0, 0, this.incWidth, this.height)
        for (let i = 0; i < slice.length; ++i) {
            let v = slice[i]
            if (this.min === null || v < this.min) {
                this.min = v
                console.log("New min:", this.min)
            }
            if (this.max === null || v > this.max) {
                this.max = v
                console.log("New max:", this.max)
            }
            v = clamp(v, this.min, this.max)
            let c = Math.floor(Math.scale(v, this.min, this.max, 0, 1) * 255)
            this.context.fillStyle = `rgb(${c}, ${c}, ${c})`
            this.context.fillRect(0, this.height - (i + 1) * this.incHeight, this.incWidth, this.incHeight)
        }
    }
}

export class MicWavExtract {
    sampleRate = 44100
    fftSize = 1024
    constructor({
                    callback,
                    numFrames,
                    fftTruncate, // <= fftSize
                }) {
        this.callback = callback
        this.numFrames = numFrames
        this.fftTruncate = fftTruncate || this.fftSize
    }

    async start(fftCanvas) {
        if (this.onAudioFrameTimer != null)
            throw new Error('Cannot start already-started MicWavExtract')

        this.drawer = new Drawer(fftCanvas, this.fftSize)

        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        })

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
        if (this.audioContext.sampleRate !== this.sampleRate)
            console.warn(`Mismatch in sampling rate: Expected: ${this.sampleRate}; Actual: ${this.audioContext.sampleRate}`)

        const streamSource = this.audioContext.createMediaStreamSource(this.stream)
        this.analyser = this.audioContext.createAnalyser()
        this.analyser.fftSize = this.fftSize * 2
        this.analyser.smoothingTimeConstant = 0.0
        streamSource.connect(this.analyser)

        this.freqDataQueue = []
        this.freqData = new Float32Array(this.fftSize);
        this.onAudioFrameTimer = setInterval(this.onAudioFrame.bind(this), this.fftSize / this.sampleRate * 1000)
    }

    async onAudioFrame() {
        this.analyser.getFloatFrequencyData(this.freqData);
        if (this.freqData[0] === -Infinity)
            return

        this.drawer.drawSlice(this.freqData)

        this.freqDataQueue.push(this.freqData.slice(0, this.fftTruncate));
        if (this.freqDataQueue.length > this.numFrames)
            this.freqDataQueue.shift() // drop the oldest frame

        const freqData = flatten(this.freqDataQueue);
        const freqDataTensor = getInputTensorFromFrequencyData(
            freqData, [1, this.numFrames, this.fftTruncate, 1]);
        /*if (this.includeRawAudio) {
            this.analyser.getFloatTimeDomainData(this.timeData);
            this.timeDataQueue.push(this.timeData.slice());
            const timeData = flatten(this.timeDataQueue);
            timeDataTensor = getInputTensorFromFrequencyData(timeData, [1, this.numFrames * this.fftSize]);
        }*/
        await this.callback(freqDataTensor);
        tf.dispose([freqDataTensor]);
    }

    async stop() {
        if (this.onAudioFrameTimer == null)
            throw new Error('Cannot stop MicWavExtract when not started')
        clearInterval(this.onAudioFrameTimer)
        this.onAudioFrameTimer = null
        this.analyser.disconnect()
        this.audioContext.close()
        if (this.stream != null && this.stream.getTracks().length > 0) {
            this.stream.getTracks()[0].stop()
        }
    }
}

export function getInputTensorFromFrequencyData(freqData, shape) {
    const vals = new Float32Array(tf.util.sizeFromShape(shape))
    vals.set(freqData, vals.length - freqData.length) // if smaller than shape, pad
    return tf.tensor(vals, shape)
}
