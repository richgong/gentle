/**
 * FFT extractor using browser's native FFT.
 *
 * See BrowserFftFeatureExtractor:
 * https://github.com/tensorflow/tfjs-models/blob/master/speech-commands/src/browser_fft_extractor.ts#L88
 */

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

    async start() {
        if (this.onAudioFrameTimer != null)
            throw new Error('Cannot start already-started MicWavExtract')

        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (this.audioContext.sampleRate !== this.sampleRate) {
            console.warn(`Mismatch in sampling rate: Expected: ${this.sampleRate}; Actual: ${this.audioContext.sampleRate}`);
        }
        const streamSource = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.fftSize * 2;
        this.analyser.smoothingTimeConstant = 0.0;
        streamSource.connect(this.analyser);

        this.freqDataQueue = [];
        this.freqData = new Float32Array(this.fftSize);
        this.onAudioFrameTimer = setInterval(this.onAudioFrame.bind(this), this.fftSize / this.sampleRate * 1e3);
    }

    async onAudioFrame() {
        this.analyser.getFloatFrequencyData(this.freqData);
        if (this.freqData[0] === -Infinity)
            return

        this.freqDataQueue.push(this.freqData.slice(0, this.fftTruncate));
        if (this.freqDataQueue.length > this.numFrames)
            this.freqDataQueue.shift() // drop the oldest frame

        const freqData = flattenQueue(this.freqDataQueue);
        const freqDataTensor = getInputTensorFromFrequencyData(
            freqData, [1, this.numFrames, this.fftTruncate, 1]);
        /*if (this.includeRawAudio) {
            this.analyser.getFloatTimeDomainData(this.timeData);
            this.timeDataQueue.push(this.timeData.slice());
            const timeData = flattenQueue(this.timeDataQueue);
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

export function flattenQueue(queue) {
    const frameSize = queue[0].length
    const freqData = new Float32Array(queue.length * frameSize)
    queue.forEach((data, i) => freqData.set(data, i * frameSize))
    return freqData
}

export function getInputTensorFromFrequencyData(freqData, shape) {
    const vals = new Float32Array(tf.util.sizeFromShape(shape))
    vals.set(freqData, vals.length - freqData.length) // if smaller than shape, padd with zeros.
    return tf.tensor(vals, shape)
}
