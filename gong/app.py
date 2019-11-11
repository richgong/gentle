import time
import logging
from flask import Flask, render_template, jsonify, send_from_directory, current_app, Markup
import gentle
import multiprocessing
import os
import glob
import json
from gong.utils import TRAIN_PATH


app = Flask(__name__)


def get_time():
    return time.time()


def load_js(filename):
    if current_app.debug:
        url = f'http://localhost:3000/static/compiled/{filename}?v={get_time()}'
    else:
        url = f'/static/compiled/{filename}?v={get_time()}'
    return Markup('<script type="text/javascript" src="%s"></script>' % url)


app.template_filter()(load_js)


@app.context_processor
def inject_vars():
    return dict(get_time=get_time)


@app.route('/')
def home_view():
    return render_template('home.html')


resources = gentle.Resources()


def run_gentle(key='103/1241/103_1241_000000_000001'):
    text_file = f'{TRAIN_PATH}/{key}.normalized.txt'
    audio_file = f'{TRAIN_PATH}/{key}.wav'
    json_file = f'{TRAIN_PATH}/{key}.json'

    if os.path.isfile(json_file):
        with open(json_file) as r:
            return json.loads(r.read())

    with open(text_file, encoding="utf-8") as fh:
        transcript = fh.read()

    logging.info("converting audio to 8K sampled wav")

    def on_progress(p):
        return
        # for k,v in p.items():
        #    logging.debug("%s: %s" % (k, v))
    with gentle.resampled(audio_file) as wavfile:
        # logging.info("starting alignment")
        aligner = gentle.ForcedAligner(resources,
                                       transcript,
                                       nthreads=multiprocessing.cpu_count(),
                                       disfluency=False,  # include disfluencies (uh, um) in alignment
                                       conservative=False,
                                       disfluencies=set(['uh', 'um']))
        result = aligner.transcribe(wavfile, progress_cb=None, logging=logging)
        result_dict = result.to_dict()
        with open(json_file, 'w') as f:
            f.write(json.dumps(result_dict, indent=2))
        return result_dict


@app.route('/api/train_list/')
def train_list_api():
    items = []
    for filepath in glob.glob(f'{TRAIN_PATH}/*/*/*.wav'):
        if not os.path.isfile(filepath):
            continue
        item = os.path.relpath(filepath, TRAIN_PATH)[:-4]
        items.append(item)
    return jsonify(items=items)


@app.route('/api/train_list/<path:key>')
def train_item_info_api(key):
    return jsonify(item=run_gentle(key))


@app.route('/run')
def run_view():
    return jsonify(x=run_gentle())


@app.route('/static/<path:subpath>')
def static_view(subpath):
    return send_from_directory('static', subpath)


@app.route('/about')
def about_view():
    return render_template('about.html')


if __name__ == '__main__':
    app.run(debug=True, port=8080)
