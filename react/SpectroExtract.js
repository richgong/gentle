/**
 * Audio feature extractor based on Browser-native FFT.
 *
 * Uses AudioContext and analyser node.
 *
 * See BrowserFftFeatureExtractor:
 * https://github.com/tensorflow/tfjs-models/blob/master/speech-commands/src/browser_fft_extractor.ts#L88
 */
export class SpectroExtract {
    constructor({
                    spectrogramCallback,
                    numFramesPerSpectrogram, // > 0
                    suppressionTimeMillis, // >= 0
                    overlapFactor, // [0, 1)
                    // optional
                    sampleRateHz,
                    fftSize,
                    columnTruncateLength, // <= fftSize
                    includeRawAudio,
                }) {
        /**
         * Suppression period in milliseconds.
         *
         * How much time to rest (not call the spectrogramCallback) every time
         * a word with probability score above threshold is recognized.
         */
        this.suppressionTimeMillis = suppressionTimeMillis;
        /**
         * A callback that is invoked every time a full spectrogram becomes
         * available.
         *
         * `x` is a single-example tf.Tensor instance that includes the batch
         * dimension.
         * The return value is assumed to be whether a flag for whether the
         * suppression period should initiate, e.g., when a word is recognized.
         */
        this.spectrogramCallback = spectrogramCallback;
        this.numFrames = numFramesPerSpectrogram;
        this.sampleRateHz = sampleRateHz || 44100;
        this.fftSize = fftSize || 1024;
        this.frameDurationMillis = this.fftSize / this.sampleRateHz * 1e3;
        /**
         * Truncate each spectrogram column at how many frequency points.
         *
         * If `null` or `undefined`, will do no truncation.
         */
        this.columnTruncateLength = columnTruncateLength || this.fftSize;
        /**
         * Overlap factor. Must be >=0 and <1.
         * For example, if the model takes a frame length of 1000 ms,
         * and if overlap factor is 0.4, there will be a 400ms
         * overlap between two successive frames, i.e., frames
         * will be taken every 600 ms.
         */
        this.overlapFactor = overlapFactor;

        /**
         * Whether to collect the raw time-domain audio waveform in addition to the
         * spectrogram.
         *
         * Default: `false`.
         */
        this.includeRawAudio = includeRawAudio;
    }

    isListening() {
        return this.frameIntervalTask != null
    }

    async start() {
        if (this.isListening()) {
            throw new Error('Cannot start already-started SpectroExtract');
        }

        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (this.audioContext.sampleRate !== this.sampleRateHz) {
            console.warn(
                `Mismatch in sampling rate: ` +
                `Expected: ${this.sampleRateHz}; ` +
                `Actual: ${this.audioContext.sampleRate}`);
        }
        const streamSource = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.fftSize * 2;
        this.analyser.smoothingTimeConstant = 0.0;
        streamSource.connect(this.analyser);
        // Reset the queue.
        this.freqDataQueue = [];
        this.freqData = new Float32Array(this.fftSize);
        if (this.includeRawAudio) {
            this.timeDataQueue = [];
            this.timeData = new Float32Array(this.fftSize);
        }
        const period =
            Math.max(1, Math.round(this.numFrames * (1 - this.overlapFactor)));
        this.tracker = new Tracker(
            period,
            Math.round(this.suppressionTimeMillis / this.frameDurationMillis));
        this.frameIntervalTask = setInterval(
            this.onAudioFrame.bind(this), this.fftSize / this.sampleRateHz * 1e3);
    }

    async onAudioFrame() {
        this.analyser.getFloatFrequencyData(this.freqData);
        if (this.freqData[0] === -Infinity) {
            return;
        }

        this.freqDataQueue.push(this.freqData.slice(0, this.columnTruncateLength));
        if (this.includeRawAudio) {
            this.analyser.getFloatTimeDomainData(this.timeData);
            this.timeDataQueue.push(this.timeData.slice());
        }
        if (this.freqDataQueue.length > this.numFrames) {
            // Drop the oldest frame (least recent).
            this.freqDataQueue.shift();
        }
        const shouldFire = this.tracker.tick();
        if (shouldFire) {
            const freqData = flattenQueue(this.freqDataQueue);
            const freqDataTensor = getInputTensorFromFrequencyData(
                freqData, [1, this.numFrames, this.columnTruncateLength, 1]);
            let timeDataTensor;
            if (this.includeRawAudio) {
                const timeData = flattenQueue(this.timeDataQueue);
                timeDataTensor = getInputTensorFromFrequencyData(
                    timeData, [1, this.numFrames * this.fftSize]);
            }
            const shouldRest =
                await this.spectrogramCallback(freqDataTensor, timeDataTensor);
            if (shouldRest) {
                this.tracker.suppress();
            }
            tf.dispose([freqDataTensor, timeDataTensor]);
        }
    }

    async stop() {
        if (this.frameIntervalTask == null) {
            throw new Error(
                'Cannot stop because there is no ongoing streaming activity.');
        }
        clearInterval(this.frameIntervalTask);
        this.frameIntervalTask = null;
        this.analyser.disconnect();
        this.audioContext.close();
        if (this.stream != null && this.stream.getTracks().length > 0) {
            this.stream.getTracks()[0].stop();
        }
    }
}

export function flattenQueue(queue) {
    const frameSize = queue[0].length;
    const freqData = new Float32Array(queue.length * frameSize);
    queue.forEach((data, i) => freqData.set(data, i * frameSize));
    return freqData;
}

export function getInputTensorFromFrequencyData(freqData, shape) {
    const vals = new Float32Array(tf.util.sizeFromShape(shape));
    // If the data is less than the output shape, the rest is padded with zeros.
    vals.set(freqData, vals.length - freqData.length);
    return tf.tensor(vals, shape);
}

/**
 * A class that manages the firing of events based on periods
 * and suppression time.
 */
export class Tracker {
    /**
     * Constructor of Tracker.
     *
     * @param period The event-firing period, in number of frames.
     * @param suppressionPeriod The suppression period, in number of frames.
     */
    constructor(period, suppressionPeriod) {
        this.period = period; // > 0
        this.suppressionTime = suppressionPeriod == null ? 0 : suppressionPeriod;
        this.counter = 0;
    }

    /**
     * Mark a frame.
     *
     * @returns Whether the event should be fired at the current frame.
     */
    tick() {
        this.counter++;
        const shouldFire = (this.counter % this.period === 0) &&
            (this.suppressionOnset == null ||
                this.counter - this.suppressionOnset > this.suppressionTime);
        return shouldFire;
    }

    /**
     * Order the beginning of a supression period.
     */
    suppress() {
        this.suppressionOnset = this.counter;
    }
}
