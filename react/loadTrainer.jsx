import React from 'react'
import ReactDOM from 'react-dom'
import { AppContainer } from 'react-hot-loader'

import App from './Trainer.jsx'


function render() {
    ReactDOM.render(
        <AppContainer><App /></AppContainer>,
        document.getElementById('app')
    )
}

render()

if (module.hot)
    module.hot.accept('./Trainer.jsx', render)
