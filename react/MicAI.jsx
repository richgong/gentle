import React from 'react'
import {MicWavExtract} from './MicWavExtract'


export const NUM_FRAMES = 3; // One frame is ~23ms of audio.
export const FRAME_SIZE = 232;
export const INPUT_SHAPE = [NUM_FRAMES, FRAME_SIZE, 1];

export function flatten(tensors) {
    const size = tensors[0].length;
    const result = new Float32Array(tensors.length * size);
    tensors.forEach((arr, i) => result.set(arr, i * size));
    return result;
}

export function normalize(x) {
    const mean = -100;
    const std = 10;
    return x.map(x => (x - mean) / std);
}

export class MicAI extends React.Component {
    constructor(props) {
        super(props)
        this.examples = [];
        this.model = this.buildModel()
    }

    startExtract(callback) {
        this.extract = new MicWavExtract({
            callback: async (x) => {
                let data = await x.data()
                callback({data, frameSize: FRAME_SIZE})
            },
            numFrames: NUM_FRAMES,
            fftTruncate: FRAME_SIZE,
        })
        this.extract.start(this.fftCanvas)
    }

    isExtracting() {
        return this.extract != null
    }

    stopExtract() {
        this.extract.stop()
        this.extract = null
    }

    buildModel() {
        let model = tf.sequential();
        model.add(tf.layers.depthwiseConv2d({
            depthMultiplier: 8,
            kernelSize: [NUM_FRAMES, 3],
            activation: 'relu',
            inputShape: INPUT_SHAPE
        }));
        model.add(tf.layers.maxPooling2d({poolSize: [1, 2], strides: [2, 2]}));
        model.add(tf.layers.flatten());
        model.add(tf.layers.dense({units: 3, activation: 'softmax'}));
        const optimizer = tf.train.adam(0.01);
        model.compile({
            optimizer,
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        return model
    }

    collect(label) {
        if (this.isExtracting()) {
            return this.stopExtract()
        }
        if (label == null) {
            return
        }
        this.startExtract(({frameSize, data}) => {
            let vals = normalize(data.subarray(-frameSize * NUM_FRAMES));
            // console.log(`Collected data for ${label} (frameSize=${frameSize}) (length=${vals.length}):`, vals)
            this.examples.push({vals, label});
            console.log(`${this.examples.length} examples collected for label=${label}`);
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
            <h3>MicAI</h3>
            <canvas className="border border-primary d-block my-2" width="600" height="100" ref={x => {this.fftCanvas = x}}></canvas>
            <button className="btn btn-warning mr-2" onMouseDown={() => this.collect(0)} onMouseUp={() => this.collect(null)}>Left</button>
            <button className="btn btn-warning mr-1" onMouseDown={() => this.collect(1)} onMouseUp={() => this.collect(null)}>Right</button>
            <button className="btn btn-warning mr-1" onMouseDown={() => this.collect(2)} onMouseUp={() => this.collect(null)}>Noise</button>
            <button className="btn btn-danger mr-1" onClick={this.train.bind(this)}>Train</button>
            <button className="btn btn-success mr-1" onClick={this.predict.bind(this)}>Listen</button>
        </div>)
    }

}

