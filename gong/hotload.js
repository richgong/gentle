// https://webpack.js.org/configuration
// https://github.com/gaearon/react-hot-loader/tree/master/docs#migration-to-30
// https://github.com/gaearon/react-hot-loader/blob/d73e0acc5719dc840d78acd93d58b9cef31e9e03/docs/README.md

var path = require('path')
var webpack = require('webpack')
var express = require('express')
var path = require('path');

var config = require(path.join(process.cwd(), 'webpack.config'))

var entry = config.entry;
for (var key in entry) {
  if (key.startsWith('load')) {
    console.warn("hotLoading:", key)
    entry[key] = [
      'webpack-hot-middleware/client?path=http://localhost:3000/__webpack_hmr',
      'react-hot-loader/patch',
      entry[key]]
  }
}

var options = config.module.rules[0].use.options;
if (options.plugins)
  options.plugins.push('react-hot-loader/babel')
else
  options.plugins = ['react-hot-loader/babel']
config.plugins.push(new webpack.HotModuleReplacementPlugin())
config.plugins.push(new webpack.WatchIgnorePlugin([
  path.join(process.cwd(), './node_modules/')
]))

var publicPath = config.output.publicPath
config.output.publicPath = 'http://localhost:3000' + publicPath

var compiled = webpack(config)
var app = express()

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

app.use(require('webpack-dev-middleware')(compiled, {
  noInfo: true,
  publicPath: publicPath
}))

app.use(require('webpack-hot-middleware')(compiled))

app.listen(3000, 'localhost', function(err) {
  if (err)
    return console.error(err)
  console.log('HotLoader running...')
})
