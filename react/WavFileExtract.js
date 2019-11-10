import {AudioUtils, nextPowerOfTwo} from './audioUtils';

/**
 * * See BrowserFftFeatureExtractor:
 * https://github.com/tensorflow/tfjs-models/blob/master/speech-commands/src/browser_fft_extractor.ts#L88
 */
export class WavFileExtract {

    // targetSr = 16000; // Target sample rate.
    // duration = 1.0; // How long the total duration is.

    bufferLength = 480; // How long the buffer is.
    melCount = 40; // How many mel bins to use.
    hopLength = 160; // Number of samples to hop over for every new column.
    fftSize = 512;

    audioUtils = new AudioUtils();

    constructor() {
        /*// How many buffers to keep in the spectrogram.
        this.bufferCount = Math.floor(
            (this.duration * this.targetSr - this.bufferLength) /
            this.hopLength) +
            1;//*/

        if (this.hopLength > this.bufferLength) {
            console.error('Hop length must be smaller than buffer length.');
        }

        // The mel filterbank is actually half of the size of the number of samples,
        // since the FFT array is complex valued.
        this.fftSize = nextPowerOfTwo(this.bufferLength);

        // The mel filterbank (calculate it only once).
        this.melFilterbank = this.audioUtils.createMelFilterbank(
            this.fftSize / 2 + 1, this.melCount);
    }

    start(samples) {
        this.features = [];
        // Get buffer(s) out of the circular buffer. Note that there may be
        // multiple available, and if there are, we should get them all.
        const buffers = this.getFullBuffers(samples);

        for (const buffer of buffers) {
            // console.log(`Got buffer of length ${buffer.length}.`);
            // Extract the mel values for this new frame of audio data.
            const fft = this.audioUtils.fft(buffer);
            const fftEnergies = this.audioUtils.fftEnergies(fft);
            const melEnergies =
                this.audioUtils.applyFilterbank(fftEnergies, this.melFilterbank);
            const mfccs = this.audioUtils.cepstrumFromEnergySpectrum(melEnergies);

            //if (this.isMfccEnabled) {
            this.features.push(mfccs);
            //} else {
                // this.features.push(melEnergies);
            //}
        }
        return this.features;
    }

    /**
     * Get as many full buffers as are available in the circular buffer.
     */
    getFullBuffers(sample) {
        const out = [];
        let index = 0;
        // While we have enough data in the buffer.
        while (index <= sample.length - this.bufferLength) {
            // Get a buffer of desired size.
            const buffer = sample.slice(index, index + this.bufferLength);
            index += this.hopLength;
            out.push(buffer);
        }
        return out;
    }
}
