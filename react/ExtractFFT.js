import {AudioUtils, nextPowerOfTwo} from './audioUtils';

/**
 * Derived from BrowserFftFeatureExtractor:
 * https://github.com/tensorflow/tfjs-models/blob/master/speech-commands/src/browser_fft_extractor.ts#L88
 */
export class ExtractFFT {
    bufferLength = 480
    hopLength = 160
    audioUtils = new AudioUtils();

    constructor() {
        const fftSize = nextPowerOfTwo(this.bufferLength)
        const melCount = 40 // How many mel bins to use.
        console.warn("FFT SIZE via nextPowerOfTwo:", fftSize)
        // The mel filterbank is half the size of the number of samples, since the FFT array is complex valued.
        this.melFilterbank = this.audioUtils.createMelFilterbank(fftSize / 2 + 1, melCount);
    }

    start(samples) {
        this.features = [];
        for (let slice of this.getSlices(samples)) {
            const fft = this.audioUtils.fft(slice);
            const fftEnergies = this.audioUtils.fftEnergies(fft);
            const melEnergies = this.audioUtils.applyFilterbank(fftEnergies, this.melFilterbank);
            // const mfccs = this.audioUtils.cepstrumFromEnergySpectrum(melEnergies);
            this.features.push(melEnergies);
        }
        return this.features;
    }

    getSlices(sample) {
        const slices = [];
        let index = 0;
        while (index <= sample.length - this.bufferLength) {
            const slice = sample.slice(index, index + this.bufferLength);
            slices.push(slice);
            index += this.hopLength;
        }
        return slices;
    }
}
