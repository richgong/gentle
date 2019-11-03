from flask import Flask, render_template
app = Flask(__name__)


@app.route('/')
def home_view():
    return render_template('home.html')


@app.route('/about')
def about_view():
    return render_template('about.html')
