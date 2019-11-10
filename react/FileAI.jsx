import React from 'react'
import {ExtractFFT} from './ExtractFFT';
import {NUM_FRAMES, FRAME_SIZE, INPUT_SHAPE, normalize, flatten} from './MicAI'
import {MicWavExtract} from "./MicWavExtract";

export class FileAI extends React.Component {
    constructor(props) {
        super(props)
        this.examples = [];
        this.buildModel()
        this.extractFFT = new ExtractFFT()
    }

    startExtract(callback) {
        this.extract = new MicWavExtract({
            spectrogramCallback: async (x, timeData) => {
                let data = await x.data()
                // based on hack above, we know frameSize = this.nonBatchInputShape[1] = FRAME_SIZE
                let frameSize = FRAME_SIZE
                callback({data, frameSize})
                // Trigger suppression via "return true" -- due to recognized word
                return true;
            },
            sampleRateHz: 44100,
            numFramesPerSpectrogram: NUM_FRAMES,
            columnTruncateLength: FRAME_SIZE, // frameSize
            suppressionTimeMillis: 0,
            overlapFactor: 0.999,
        })
        this.extract.start()
    }

    onLoaded(buffer, array) {
        console.warn("FileAI question:", buffer._buffer, array);
        console.warn("FileAI answer:", this.extractFFT.start(array))
    }

    isExtracting() {
        return this.extract != null
    }

    stopExtract() {
        this.extract.stop()
        this.extract = null
    }

    buildModel() {
        this.model = tf.sequential();
        this.model.add(tf.layers.depthwiseConv2d({
            depthMultiplier: 8,
            kernelSize: [NUM_FRAMES, 3],
            activation: 'relu',
            inputShape: INPUT_SHAPE
        }));
        this.model.add(tf.layers.maxPooling2d({poolSize: [1, 2], strides: [2, 2]}));
        this.model.add(tf.layers.flatten());
        this.model.add(tf.layers.dense({units: 3, activation: 'softmax'}));
        const optimizer = tf.train.adam(0.01);
        this.model.compile({
            optimizer,
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
    }

    collect(label) {
        if (this.isExtracting()) {
            return this.stopExtract();
        }
        if (label == null) {
            return;
        }
        this.startExtract(({frameSize, data}) => {
            let vals = normalize(data.subarray(-frameSize * NUM_FRAMES));
            console.log(`Collected data for ${label} (frameSize=${frameSize}) (length=${vals.length}):`, vals)
            this.examples.push({vals, label});
            console.log(`${this.examples.length} examples collected`);
        })
    }

    async train() {
        const ys = tf.oneHot(this.examples.map(e => e.label), 3);
        const xsShape = [this.examples.length, ...INPUT_SHAPE];
        const xs = tf.tensor(flatten(this.examples.map(e => e.vals)), xsShape);

        await this.model.fit(xs, ys, {
            batchSize: 16,
            epochs: 10,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    console.warn(`Accuracy: ${(logs.acc * 100).toFixed(1)}% Epoch: ${epoch + 1}`);
                }
            }
        });
        tf.dispose([xs, ys]);
    }

    async predict() {
        if (this.isExtracting()) {
            return this.stopExtract();
        }
        this.startExtract(async ({frameSize, data}) => {
            const vals = normalize(data.subarray(-frameSize * NUM_FRAMES));
            const input = tf.tensor(vals, [1, ...INPUT_SHAPE]);
            const probs = this.model.predict(input);
            const predLabel = probs.argMax(1);
            const label = (await predLabel.data())[0];
            tf.dispose([input, probs, predLabel]); // To clean up GPU memory it's important for us to manually call tf.dispose() on output Tensors
            console.log(label)
        })
    }

    render() {
        return (<div className="my-4">
            <h3>FileAI</h3>
            <button className="btn btn-warning" onMouseDown={() => this.collect(0)} onMouseUp={() => this.collect(null)}>Left</button>
            <button className="btn btn-warning" onMouseDown={() => this.collect(1)} onMouseUp={() => this.collect(null)}>Right</button>
            <button className="btn btn-warning" onMouseDown={() => this.collect(2)} onMouseUp={() => this.collect(null)}>Noise</button>
            <button className="btn btn-danger" onClick={this.train.bind(this)}>Train</button>
            <button className="btn btn-success" onClick={this.predict.bind(this)}>Listen</button>
        </div>)
    }

}
