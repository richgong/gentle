import React from 'react'
import axios from 'axios'


export default class App extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            trainItems: null
        }

        axios.get('/api/train_list/')
            .then(response => {
                console.log("Got train list:", response.data)
                this.setState({
                    trainItems: response.data.items
                })
            })
            .catch(error => console.error)
    }

    render() {
        let {trainItems} = this.state
        return (
            <div>
                <h1>GentleTrainer</h1>
                {trainItems ? <div className="alert alert-success">{trainItems.length} training items loaded.</div> : <div className="alert alert-secondary">Loading...</div>}
            </div>
        )
    }
}