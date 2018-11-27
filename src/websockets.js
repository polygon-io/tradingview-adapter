

import Flatten from 'lodash/flatten'
import EventEmitter from 'eventemitter3'


class PolygonWebsockets extends EventEmitter {
	constructor( params ){
		super()
		this.subscriptions = []
		this.ws = null
		console.log('Polygon WebSocket class initialized..')
		this.apiKey = params.apiKey
		this.connect()
	}
	subscribe( channels ){
		// Add to our list of subscriptions:
		this.subscriptions.push([ channels ])
		this.subscriptions = Flatten( this.subscriptions )
		// If these are additional subscriptions, only send the new ones:
		if( this.connected ) this.sendSubscriptions(Flatten([ channels ]))
	}
	connect(){
		this.connected = false
		this.ws = new WebSocket('wss://socket.polygon.io/stocks')
		this.ws.onopen = this.onOpen.bind( this )
		this.ws.onclose = this.onDisconnect.bind( this )
		this.ws.onerror = this.onError.bind( this )
		this.ws.onmessage = this.onMessage.bind( this )
	}
	onOpen(){
		// Authenticate:
		this.ws.send(`{"action":"auth","params":"${this.apiKey}"}`)
		this.connected = true
		// Subscribe to Crypto Trades and SIP:
		this.sendSubscriptions( this.subscriptions )
	}
	sendSubscriptions( subscriptions ){
		if( subscriptions.length == 0 ) return
		this.ws.send(`{"action":"subscribe","params":"${subscriptions.join(',')}"}`)
	}
	onDisconnect(){
		setTimeout( this.connect.bind( this ), 2000 )
	}
	onError( e ){
		console.log('Error:', e)
	}
	onMessage( msg ){
		let data = msg.data
		data = JSON.parse( data )
		data.map(( msg ) => {
			if( msg.ev === 'status' ){
				console.log('Status Update:', msg.message)
			}
			this.emit(msg.ev, msg)
		})
	}
}


export default PolygonWebsockets
