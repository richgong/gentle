var path = require('path')
var IS_PROD = process.env.NODE_ENV == 'production'

module.exports = {
    entry: {
        loadTrainer: './react/loadTrainer',
    },
    output: {
        path: path.resolve(__dirname, './gong/static/compiled'),
        publicPath: '/static/compiled/',
        filename: '[name].js',
        library: '[name]'
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [ // order matters (runs last to first)
                            "@babel/preset-env",
                            "@babel/preset-react",
                        ],
                        plugins: [
                            "@babel/plugin-proposal-class-properties",
                        ],
                    }
                }
            },
        ]
    },
    /*externals: {
      'react': 'React',
      'react-dom': 'ReactDOM'
    },*/
    resolve: {
        modules: [
            path.resolve(__dirname, 'node_modules')
        ],
        extensions: ['.js', '.jsx']
    },
    mode: IS_PROD ? 'production' : 'development',
    plugins: []
}
