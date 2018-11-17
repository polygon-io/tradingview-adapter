

import Each from 'lodash/each'
import Map from 'lodash/map'
import Last from 'lodash/last'
import Filter from 'lodash/filter'
import Debounce from 'lodash/debounce'
import axios from 'axios'

const BASE_URL = `https://api.polygon.io`
const POLL_INTERVAL = 15 // seconds

class PolygonAdapter {


	/**
	 *  Polygon Adapter
	 *  @param  {Object} params 		Object containing { apikey }
	 *  @return {PolygonAdapter}        return created instance for chaining methods
	 */
	constructor( params ){
		this.subscriptions = []
		this.apikey = params.apikey
		this.searchSymbols = Debounce( this._searchSymbols, 250, { trailing: true })
		return this
	}


	/**
	 *  onReady method for TV lib
	 *  @param  {Function} cb Callback when we are ready
	 *  @return {null}
	 */
	onReady( cb ){
		console.log('Polygon Adapter Ready')
		setInterval( this.onInterval.bind( this ), POLL_INTERVAL * 1000 )
		cb()
	}


	/**
	 *  On each interval we loop through our subscriptions and request bars for the past 2min
	 *  @return {null}
	 */
	onInterval(){
		let now = Date.now()
		Each( this.subscriptions, ( sub ) => {
			this.getBars( sub.symbolInfo, sub.interval, ( ( now - 120*1000 ) / 1000 ), ( now / 1000 ), ( ticks ) => {
				if( ticks.length == 0 ) return
				sub.callback( ticks )
			})
		})
	}


	/**
	 *  Debounced searchSymbols method for TV lib
	 *  @param  {String}   input      Users search input
	 *  @param  {String}   exchange   Exchange search input
	 *  @param  {String}   symbolType Symbol type ( `stock`, `bitcoing`, `forex`)
	 *  @param  {Function} cb         Callback for returning results
	 *  @return {null}
	 */
	_searchSymbols( input, exchange, symbolType, cb ){
		axios.get(`${BASE_URL}/v1/meta/symbols/${input}/company?apiKey=${this.apikey}`).then(( res ) => {
			cb([{
				symbol: res.data.symbol,
				full_name: res.data.name,
				description: res.data.description,
				exchange: res.data.exchangeSymbol,
				ticker: res.data.symbol,
				type: 'stock'
			}])
		}).catch(( err ) => {
			cb([])
		})
	}

	
	/**
	 *  Resolving a symbol simply gets the company info for this symbol
	 *  @param  {String}   symbol Symbol string we are requesting
	 *  @param  {Function} cb     Callback for symbol info
	 *  @param  {Function}   cberr  Callback for errors occured
	 *  @return {null}
	 */
	resolveSymbol( symbol, cb, cberr ){
		symbol = Last( symbol.split(':') ) // Get rid of exchange prefix
		axios.get(`${BASE_URL}/v1/meta/symbols/${symbol}/company?apiKey=${this.apikey}`).then(( data ) => {
			let c = data.data
			let obj = {
				name: c.symbol,
				ticker: c.symbol,
				type: 'stock',
				exchange: c.exchangeSymbol,
				timezone: 'America/New_York',
				has_intraday: true,
				has_daily: true,
				sector: c.industry,
				supported_resolutions: ['1', '1D']
			}
			cb( obj )
		}).catch( cberr )
	}


	/**
	 *  Get aggregate bars for our symbol
	 *  @param  {Object}   symbolInfo   Object returned from `resolveSymbol`
	 *  @param  {String}   resolution   Interval size for request ( `1`, `1D`, etc )
	 *  @param  {Int}   from         Unix timestamp to search from
	 *  @param  {Int}   to           Unix timestamp to search to
	 *  @param  {Function} cb           Callback with resolved bars
	 *  @param  {Function}   cberr        Callback for errors
	 *  @param  {Boolean}   firstRequest If this is the first request for this symbol
	 *  @return {null}
	 */
	getBars( symbolInfo, resolution, from, to, cb, cberr, firstRequest ){
		let type = 'minute'
		if( resolution == 'D' || resolution == '1D' ) type = 'day'
		axios.get(`${BASE_URL}/v1/historic/agg/${type}/${symbolInfo.ticker}?from=${from*1000}&to=${to*1000}&apiKey=${this.apikey}`).then(( data ) => {
			let bars = Map( data.data.ticks, ( t ) => {
				return {
					time: t.t,
					close: t.c, 
					open: t.o, 
					high: t.h, 
					low: t.l, 
					volume: t.v,
				}
			})
			return cb( bars, { noData: ( !bars ) })
		}).catch( cberr )
	}

	
	/**
	 *  Subscribe to future updates for this symbol
	 *  @param  {Object}   symbolInfo Object returned from `resolveSymbol`
	 *  @param  {String}   interval   Interval size for request
	 *  @param  {Function} cb         Callback when we have new bars
	 *  @param  {String}   key        Unique key for this subscription
	 *  @return {null}
	 */
	subscribeBars( symbolInfo, interval, cb, key ){
		let sub = {
			key: `${key}`,
			symbolInfo: symbolInfo,
			interval: interval,
			callback: cb,
		}
		// Currently only allow minute subscriptions:
		if( sub.interval != '1' ) return
		this.subscriptions.push( sub )
	}

	
	/**
	 *  Unsubscribe from future updates for a symbol
	 *  @param  {String} key Unique key for this subscription
	 *  @return {null}
	 */
	unsubscribeBars( key ){
		this.subscriptions = Filter( this.subscriptions, ( s ) => s.key != key )
	}


}


export default PolygonAdapter