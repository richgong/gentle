import {AudioUtils, nextPowerOfTwo} from './audioUtils';

export const FRAME_SIZE = 40

/**
 * Derived from BrowserFftFeatureExtractor:
 * https://github.com/tensorflow/tfjs-models/blob/master/speech-commands/src/browser_fft_extractor.ts#L88
 */
export class ExtractFFT {
    // This size is related to how fast we want to step through the wave form (true also in MicWaveExtract)
    fftSize = 512
    audioUtils = new AudioUtils();

    constructor() {
        // mel filterbank's fftSize is half the size of the number of samples, since it's complex valued.
        this.melFilterbank = this.audioUtils.createMelFilterbank(this.fftSize / 2 + 1, FRAME_SIZE);
    }

    extract(samples) {
        this.features = []
        for (let slice of this.getSlices(samples)) {
            const fft = this.audioUtils.fft(slice)
            const fftEnergies = this.audioUtils.fftEnergies(fft)
            const melEnergies = this.audioUtils.applyFilterbank(fftEnergies, this.melFilterbank)
            // const mfccs = this.audioUtils.cepstrumFromEnergySpectrum(melEnergies)
            this.features.push(melEnergies)
        }
        return this.features
    }

    getStepSize() {
        return this.fftSize
    }

    getSlices(sample) {
        const slices = []
        let index = 0
        let stepSize = this.getStepSize()
        while (index <= sample.length - stepSize) {
            const slice = sample.slice(index, index + stepSize)
            slices.push(slice)
            index += stepSize
        }
        return slices
    }
}
