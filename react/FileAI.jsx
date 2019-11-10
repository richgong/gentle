import React from 'react'
import {WavFileExtract} from './WavFileExtract';
import {NUM_FRAMES, FRAME_SIZE, INPUT_SHAPE} from './MicAI'

class Dataset {
    xs
    ys
    constructor(numClasses) {
        this.numClasses = numClasses
    }

    /**
     * Adding data pair to the dataset, examples and labels should have the
     * matching shape. For example, if the input shape is [2, 20, 20], 2 is the
     * batch size, the labels shape should be [2,10] (num of classes is 10).
     *
     * @param examples Batch of inputs
     * @param labels Matching labels for inputs
     */
    addExamples(examples, labels) {
        if (this.xs == null) {
            // For the first example that gets added, keep example and y so that the
            // Dataset owns the memory of the inputs. This makes sure that
            // if addExample() is called in a tf.tidy(), these Tensors will not get
            // disposed.
            this.xs = tf.keep(examples);
            this.ys = tf.keep(labels);
        } else {
            const oldX = this.xs;
            this.xs = tf.keep(this.xs.concat(examples, 0));

            const oldY = this.ys;
            this.ys = tf.keep(oldY.concat(labels, 0));
            oldX.dispose();
            oldY.dispose();
        }
    }
}

/**
 * Audio Model that creates tf.Model for a fix amount of labels. It requires a
 * feature extractor to convert the audio stream into input tensors for the
 * internal tf.Model.
 * It provide datasets loading, training, and model saving functions.
 */
export class FileAI extends React.Component {
    /**
     *
     * @param inputShape Input tensor shape.
     * @param labels Audio command label list
     * @param dataset Dataset class to store the loaded data.
     * @param featureExtractor converter to extractor features from audio stream
     * as input tensors
     */
    constructor(props) {
        super(props)
        this.labels = [0, 1, 2]
        this.dataset = new Dataset(this.labels.length)
        this.extractor = new WavFileExtract()
    }

    createModel() {
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

    /**
     * Load all dataset for the root directory, all the subdirectories that have
     * matching name to the entries in model label list, contained audio files
     * will be converted to input tensors and stored in the dataset for training.
     * @param dir The root directory of the audio dataset
     * @param callback Callback function for display training logs
     */
    async loadAll(dir, callback) {
        const promises = [];
        this.labels.forEach(async (label, index) => {
            callback(`loading label: ${label} (${index})`);
            promises.push(
                this.loadDataArray(path.resolve(dir, label), callback).then(v => {
                    callback(`finished loading label: ${label} (${index})`, true);
                    return [v, index];
                }));
        });

        let allSpecs = await Promise.all(promises);
        allSpecs = allSpecs
            .map((specs, i) => {
                const index = specs[1];
                return specs[0].map(spec => [spec, index]);
            })
            .reduce((acc, currentValue) => acc.concat(currentValue), []);

        tf.util.shuffle(allSpecs);
        const specs = allSpecs.map(spec => spec[0]);
        const labels = allSpecs.map(spec => spec[1]);
        this.dataset.addExamples(
            this.melSpectrogramToInput(specs),
            tf.oneHot(labels, this.labels.length));
    }

    /**
     * Load one dataset from directory, all contained audio files
     * will be converted to input tensors and stored in the dataset for training.
     * @param dir The directory of the audio dataset
     * @param label The label for the audio dataset
     * @param callback Callback function for display training logs
     */
    /*async loadData(dir, label, callback) {
        const index = this.labels.indexOf(label);
        const specs = await this.loadDataArray(dir, callback);
        this.dataset.addExamples(
            this.melSpectrogramToInput(specs),
            tf.oneHot(tf.fill([specs.length], index, 'int32'), this.labels.length));
    }

    loadDataArray(dir, callback) {
        return new Promise((resolve, reject) => {
            fs.readdir(dir, (err, filenames) => {
                if (err) {
                    reject(err);
                }
                let specs = [];
                filenames.forEach((filename) => {
                    callback('decoding ' + dir + '/' + filename + '...');
                    const spec = this.splitSpecs(this.decode(dir + '/' + filename));
                    if (!!spec) {
                        specs = specs.concat(spec);
                    }
                    callback('decoding ' + dir + '/' + filename + '...done');
                });
                resolve(specs);
            });
        });
    }

    decode(filename) {
        const result = wav.decode(fs.readFileSync(filename));
        return this.extractor.start(result.channelData[0]);
    }*/

    /**
     * Train the model for stored dataset. The method call be called multiple
     * times.
     * @param epochs iteration of the training
     * @param trainCallback
     */
    async train(epochs, trainCallback) {
        return this.model.fit(this.dataset.xs, this.dataset.ys, {
            batchSize: 64,
            epochs: epochs || 100,
            shuffle: true,
            validationSplit: 0.1,
            callbacks: trainCallback
        });
    }

    splitSpecs(spec) {
        if (spec.length >= 98) {
            const output = [];
            for (let i = 0; i <= (spec.length - 98); i += 32) {
                output.push(spec.slice(i, i + 98));
            }
            return output;
        }
        return undefined;
    }

    melSpectrogramToInput(specs) {
        // Flatten this spectrogram into a 2D array.
        const batch = specs.length;
        const times = specs[0].length;
        const freqs = specs[0][0].length;
        const data = new Float32Array(batch * times * freqs);
        console.log(data.length);
        for (let j = 0; j < batch; j++) {
            const spec = specs[j];
            for (let i = 0; i < times; i++) {
                const mel = spec[i];
                const offset = j * freqs * times + i * freqs;
                data.set(mel, offset);
            }
        }
        // Normalize the whole input to be in [0, 1].
        const shape = [batch, times, freqs, 1];
        // this.normalizeInPlace(data, 0, 1);
        return tf.tensor4d(data, shape);
    }

    render() {
        return (<div className="my-4">
            <h3>FileAI</h3>
        </div>)
    }
}
