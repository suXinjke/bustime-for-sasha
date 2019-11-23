import React from 'react'
import { hot } from 'react-hot-loader'
import io from 'socket.io-client'

import './App.scss'

function retrieveUserId() {
    return fetch( 'https://cors-anywhere.herokuapp.com/https://www.bustime.ru/norilsk/' )
    .then( res => res.text() )
    .then( html_string => {
        return html_string.match( /us_id\s*=\s*([^;\s]+)/ )[1]
    } )
}

function retrieveStopsAndBuses() {
    return fetch( 'https://cors-anywhere.herokuapp.com/https://www.bustime.ru/static/js/city-20-10.js' )
        .then( res => res.text() )
        .then( js_string => {
            const stops_string = js_string.match( /stops=([^\;]+);/ )[1]
            const buses_string = js_string.match( /BUSES=([^\;]+);/ )[1]

            const stops = new Function( `return ${stops_string}` )()
            const buses = new Function( `return ${buses_string}` )()

            const parsed_stops = {}
            for ( const { value, ids } of stops ) {
                for ( const id of ids ) {
                    parsed_stops[id] = value
                }
            }

            const parsed_buses = {}
            Object.keys( buses ).forEach( bus_id => {
                const bus = buses[bus_id]
                parsed_buses[bus_id] = bus.name
            } )

            return {
                stops: parsed_stops,
                buses: parsed_buses
            }
        } )
}

function formatStreet( ids = [] ) {
    return ids.map( id => typeof id === 'object' ? id : { id } ).reverse()
}

const streets = {
    'Ленина': {
        up: formatStreet( [ 22411, 22344, 22340, 22341, 22342, 22345, { id: 22369, border: true }, 22370, 22371, 22372, 22373, 22374, { id: 22413, border: true }, 22331, 22332 ] ),
        down: formatStreet( [ 22392, 22393, 22394, 22395, { id: 22356, border: true }, 22357, 22376, { id: 22377, border: true }, 22436, 22379, 22380, 22381, 22382, 22383, { id: 22346, border: true } ] )
    },
    'Талнахская': {
        up: formatStreet( [ 22411, 22344, 22383, 22346, { id: 22347, border: true }, 22348, 22349, 22350, 22351, 22352, 22353, { id: 22354, border: true }, 22355, 22356 ] ),
        down: formatStreet( [ 22392, 22393, 22394, 22395, { id: 22332, border: true }, 22333, 22334, { id: 22335, border: true }, 22336, 22337, 22338, 22339, 22340, 22341, 22342, { id: 22343, border: true } ] )
    },
    'Комсомольская': {
        up: formatStreet( [ 22345, 22326, 22327, 22328, 22329, 22330, 22331, 22332 ] ),
        down: formatStreet( [ 22356, 22357, 22358, 22359, 22360, 22361, 22346 ] )
    },
    'Кайеркан': {
        up: formatStreet( [ 22613, 22614, 22615, 22616, 37128, 37129, 37130, 37131, 22617, 22618, 22619, 22621 ] ),
        down: formatStreet( [ 22613, 22614, 22615, 22616, 37128, 37129, 37130, 37131, 22617, 22618, 22619, 22621 ] ),
        one_direction: true
    }
}

const preferredBuses = [ 2227, 2228, 2229, 2230, 2246, 3465 ]

class App extends React.Component {

    constructor( props ) {
        super( props )

        let retrievedState = {}

        if ( window.localStorage ) {
            const stateItem = window.localStorage.getItem( 'bus_settings' )
            if ( stateItem ) {
                retrievedState = JSON.parse( stateItem )
            }
        }

        this.state = {
            street: 'Талнахская',
            stopIds: {},
            busIds: {},
            buses: {},
            us_id: undefined,

            upward: true,
            show_nums: true,
            ...retrievedState
        }
    }

    componentDidMount() {

        let us_id

        retrieveUserId().then( retrieved_us_id => {
            us_id = retrieved_us_id

            return retrieveStopsAndBuses()
        } ).then( dat => {
            const { stops: stopIds, buses: busIds } = dat

            this.setState( {
                stopIds,
                busIds
            } )

            const wsuri = 'https://www.bustime.ru/'
            const socket = io( wsuri )

            const originalOnevent = socket.onevent;
            socket.onevent = function( packet ) {
                const args = packet.data || []
                originalOnevent.call( this, packet )
                packet.data = [ '*' ].concat( args )
                originalOnevent.call( this, packet )
            }

            socket.on( 'connect', function() {
                socket.emit( 'authentication', {
                    username: us_id,
                    password: '',
                    os: 'web'
                } )

                preferredBuses.forEach( bus_id => {
                    socket.emit( 'join', `ru.bustime.bus_mode1__${bus_id}` )
                } )
            } )

            socket.on( '*', ( ev, data ) => {
                if ( !ev.startsWith( 'ru.bustime.bus_mode1__' ) ) {
                    return
                }

                const { bdata_mode1 } = data
                if ( !bdata_mode1 ) {
                    return
                }

                const updatedBuses = {}

                Object.keys( bdata_mode1 ).forEach( stop_id => {
                    const buses = bdata_mode1[stop_id]

                    buses.forEach( bus => {
                        updatedBuses[bus.g] = {
                            bus: busIds[bus.id],
                            stop_id,
                            stop_name: stopIds[stop_id] || 'unknown_stop'
                        }
                    } )
                } )

                this.setState( {
                    buses: { ...this.state.buses, ...updatedBuses }
                } )
            } )
        } )
    }

    setSavedState( newState ) {
        this.setState( newState, () => {
            if ( !window.localStorage ) {
                return
            }

            const { street, upward, show_nums } = this.state
            window.localStorage.setItem( 'bus_settings', JSON.stringify( {
                street,
                upward,
                show_nums
            } ) )
        } )
    }

    render() {
        const { street, stopIds, show_nums, direction, buses } = this.state

        const stop_ids = streets[street][direction ? 'up' : 'down']
        const { one_direction = false } = streets[street]

        const street_rows = [
            Object.keys( streets ).slice( 0, 2 ),
            Object.keys( streets ).slice( 2, 4 )
        ]

        return (
            <div>
            { street_rows.map( ( row, index ) => (
                <div key={index} className="button-container">
                { row.map( street_name => (
                    <button key={ street_name } className={ street_name === street ? 'active' : '' } onClick={ () => {
                        this.setSavedState( { street: street_name } )
                    } }><span>{ street_name }</span></button>
                ) ) }
                </div>
            ) ) }
                <div className="button-container">
                    <button onClick={ () => this.setSavedState( { direction: !direction } ) } disabled={ one_direction }><span>Развернуть</span></button>
                    <button onClick={ () => this.setSavedState( { show_nums: !show_nums } ) }><span>{ show_nums ? 'Скрыть номера' : 'Показать номера' }</span></button>
                </div>

            { Object.keys( stopIds ).length === 0 ?
                <div style={{ textAlign: 'center' }}>Загрузка остановок...</div>
            :
                <table className="display">
                    <thead>
                        <tr>
                            <th>Остановка</th>
                            <th>Автобусы</th>
                        </tr>
                    </thead>
                        <tbody>
                    { stop_ids.map( ( { id: stop_id, border = false } ) => (
                        <tr key={stop_id} className={`stop ${border ? 'stop_border' : ''}`}>
                            <td>
                                { stopIds[stop_id] }
                            </td>
                            <td>
                            { Object.keys( buses ).filter( bus_num => {
                                return stop_id == buses[bus_num].stop_id
                            } ).map( bus_num => {
                                const { bus } = buses[bus_num]
                                return <span key={`${stop_id}_${bus_num}`} className="bus">{ show_nums ? `${bus} (${bus_num})` : bus }</span>
                            } ) }
                            </td>
                        </tr>
                    ) ) }
                    </tbody>
                </table>

            }

                <h6 style={{ textAlign: 'center' }}>это неофициальная штука, когда сломается - неизвестно | <a href="https://www.bustime.ru/norilsk/">bustime</a></h6>
            </div>
        )
    }
}

export default hot( module )( App )