import time
import logging
from flask import Flask, render_template, jsonify, send_from_directory
import gentle
import multiprocessing


app = Flask(__name__)


def get_time():
    return time.time()


@app.context_processor
def inject_vars():
    return dict(get_time=get_time)


@app.route('/')
def home_view():
    return render_template('home.html')


@app.route('/run')
def run_view():
    disfluencies = set(['uh', 'um'])

    def on_progress(p):
        for k,v in p.items():
            logging.debug("%s: %s" % (k, v))

    text_file = 'gong/LibriTTS/train-clean-100/103/1241/103_1241_000000_000001.original.txt'
    audio_file = 'gong/LibriTTS/train-clean-100/103/1241/103_1241_000000_000001.wav'

    with open(text_file, encoding="utf-8") as fh:
        transcript = fh.read()

    resources = gentle.Resources()
    logging.info("converting audio to 8K sampled wav")

    with gentle.resampled(audio_file) as wavfile:
        logging.info("starting alignment")
        aligner = gentle.ForcedAligner(resources,
                                       transcript,
                                       nthreads=multiprocessing.cpu_count(),
                                       disfluency=True,  # include disfluencies (uh, um) in alignment
                                       conservative=False,
                                       disfluencies=disfluencies)
        result = aligner.transcribe(wavfile, progress_cb=on_progress, logging=logging)
    return jsonify(x=result.to_dict())


@app.route('/static/<path:path>')
def send_js(path):
    return send_from_directory('static', path)


@app.route('/about')
def about_view():
    return render_template('about.html')
