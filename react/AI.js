const NUM_FRAMES = 3; // One frame is ~23ms of audio.
const INPUT_SHAPE = [NUM_FRAMES, 232, 1];

function flatten(tensors) {
    const size = tensors[0].length;
    const result = new Float32Array(tensors.length * size);
    tensors.forEach((arr, i) => result.set(arr, i * size));
    return result;
}

function normalize(x) {
    const mean = -100;
    const std = 10;
    return x.map(x => (x - mean) / std);
}

export class AI {
    constructor() {
        this.recognizer = speechCommands.create('BROWSER_FFT');
        this.examples = [];
        this.buildModel()
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
        if (this.recognizer.isListening()) {
            return this.recognizer.stopListening();
        }
        if (label == null) {
            return;
        }
        this.recognizer.listen(async ({spectrogram: {frameSize, data}}) => {
            let vals = normalize(data.subarray(-frameSize * NUM_FRAMES));
            console.log(`Collected data for ${label} (frameSize=${frameSize}) (length=${vals.length}):`, vals)
            this.examples.push({vals, label});
            console.log(`${this.examples.length} examples collected`);
        }, {
            overlapFactor: 0.999,
            includeSpectrogram: true,
            invokeCallbackOnNoiseAndUnknown: true
        });
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
        if (this.recognizer.isListening()) {
            this.recognizer.stopListening();
            return;
        }
        this.recognizer.listen(async ({spectrogram: {frameSize, data}}) => {
            const vals = normalize(data.subarray(-frameSize * NUM_FRAMES));
            const input = tf.tensor(vals, [1, ...INPUT_SHAPE]);
            const probs = this.model.predict(input);
            const predLabel = probs.argMax(1);
            const label = (await predLabel.data())[0];
            tf.dispose([input, probs, predLabel]); // To clean up GPU memory it's important for us to manually call tf.dispose() on output Tensors
        }, {
            overlapFactor: 0.999,
            includeSpectrogram: true,
            invokeCallbackOnNoiseAndUnknown: true
        });
    }

}

