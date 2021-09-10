

import Each from 'lodash/each'
import Map from 'lodash/map'
import Last from 'lodash/last'
import Get from 'lodash/get'
import Find from 'lodash/find'
import Includes from 'lodash/includes'
import Filter from 'lodash/filter'
import Debounce from 'lodash/debounce'
import axios from 'axios'
import moment from "moment";

import PolygonWebsockets from './websockets.js'

const BASE_URL = `https://api.polygon.io`
const POLL_INTERVAL = 15 // seconds

const SUPPORTED_RESOLUTIONS = ['1', '3', '5', '15', '30', '45', '60', '120', '180', '240', '1D', '1W', '1M', '12M']

class PolygonAdapter {


	/**
	 *  Polygon Adapter
	 *  @param  {Object} params 		Object containing { apikey }
	 *  @return {PolygonAdapter}        return created instance for chaining methods
	 */
	constructor( params ){
		this.subscriptions = []
		this.apikey = params.apikey
		this.realtimeEnabled = params.realtimeEnabled
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
		if( this.realtimeEnabled ){
			this.wsListeners()
		}else{
			setInterval( this.onInterval.bind( this ), POLL_INTERVAL * 1000 )
		}
		console.log('running callback?')
		cb()
	}


	/**
	 *  On each interval we loop through our subscriptions and request bars for the past 2min
	 *  @return {null}
	 */
	onInterval(){
		let now = Date.now()
		Each( this.subscriptions, ( sub ) => {
			this.getBars( sub.symbolInfo, sub.interval, {from : Math.round( ( now - 120*1000 ) / 1000 ), to :( ( now ) / 1000 )}, ( ticks ) => {
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
	_searchSymbols( userInput, exchange, symbolType, onResultReadyCallback ){
		axios({
			url: `${BASE_URL}/v3/reference/tickers?search=${userInput}&apikey=${this.apikey}`,
		}).then(( res ) => {
			onResultReadyCallback( Map( res.data.results, ( item ) => {
				return {
					symbol: item.ticker,
					ticker: item.ticker,
					full_name: item.name,
					description: `${item.name}`,
					exchange: item.primary_exchange,
					type: item.market,
					locale: item.locale,
				}
			}))
		}).catch(( err ) => {
			console.log('not found:', err)
			onResultReadyCallback([])
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
		let TickerTypeMap = {
			'STOCKS': 'stock',
			'FX': 'forex',
			'CRYPTO': 'bitcoin',
		}
		axios.get(`${BASE_URL}/v3/reference/tickers?ticker=${symbol}&active=true&sort=ticker&order=asc&limit=10&apiKey=${this.apikey}`).then(( data ) => {
			console.log('DATAAA', data)
			let c = Get( data, 'data.results', {} )
			let intFirst = false
			let dayFirst = false
			cb({
				name: c[0].ticker,
				full_name: c[0].name,
				description: c[0].name,
				ticker: c[0].ticker,
				type: TickerTypeMap[ c[0].market ] || 'stocks',
				exchange: c[0].primary_exchange,
				listed_exchange: c[0].primary_exchange,
				timezone: 'America/New_York',
				first_intraday: intFirst,
				has_intraday: true,
				first_daily: dayFirst,
				has_daily: true,
				minmov: 1,
				pricescale: 100,
				session: '0900-1630',
				supported_resolutions: SUPPORTED_RESOLUTIONS,
			})
		})
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
	getBars( symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback ){
		let {from, to, firstDataRequest} = periodParams;
		let multiplier = 1
		let timespan = 'minute'
		if( resolution == 'D' || resolution == '1D' ) timespan = 'day'
		if( Includes(['1', '3', '5', '15', '30', '45'], resolution) ){
			multiplier = parseInt( resolution )
			timespan = 'minute'
		}
		if( Includes(['60', '120', '180', '240'], resolution) ){
			timespan = 'hour'
			multiplier = parseInt( resolution ) / 60
		}
		axios({
			url: `${BASE_URL}/v2/aggs/ticker/${symbolInfo.ticker}/range/${multiplier}/${timespan}/${from*1000}/${to*1000}`,
			params: { apikey: this.apikey }
		}).then(( data ) => {
			let bars = []
			let nextTime = null;
			bars = Map( data.data.results, ( t ) => {
				nextTime = t.t;
				return {
					time: t.t,
					close: t.c,
					open: t.o,
					high: t.h,
					low: t.l,
					volume: t.v,
				}
			})
			if (firstDataRequest) {
				// console.log("failing here", bars)
				return onHistoryCallback(bars, {
					noData: false,
					nextTime: bars.length === 0 && timespan != "minute" && nextTime
				})
			}
			return onHistoryCallback(bars.length ? bars : bars[bars.length - 1])
		}).catch(onErrorCallback)

	}

	getBar( symbolInfo, resolution, periodParams, onRealtimeCallback, onErrorCallback ){
		let {from, to} = periodParams;
		let multiplier = 1
		let timespan = 'minute'
		axios({
			url: `${BASE_URL}/v2/aggs/ticker/${symbolInfo.ticker}/range/${multiplier}/${timespan}/${from*1000}/${to*1000}`,
			params: { apikey: this.apikey }
		}).then(( data ) => {
			let bars = []
			let nextTime = null;
			if (data.data.results !== undefined) {
				bars = Map(data.data.results, (t) => {
					nextTime = t.t;
					return {
						time: t.t,
						close: t.c,
						open: t.o,
						high: t.h,
						low: t.l,
						volume: t.v,
					}
				})
				return onRealtimeCallback(bars)
			}
		}).catch(onErrorCallback)

	}


	/**
	 *  Subscribe to future updates for this symbol
	 *  @param  {Object}   symbolInfo Object returned from `resolveSymbol`
	 *  @param  {String}   interval   Interval size for request
	 *  @param  {Function} cb         Callback when we have new bars
	 *  @param  {String}   key        Unique key for this subscription
	 *  @return {null}
	 */
	subscribeBars( symbolInfo, interval, onRealTimeCallback, key ){
		let sub = {
			key: `${key}`,
			symbolInfo: symbolInfo,
			interval: interval,
			callback: onRealTimeCallback,
		}
		// Currently only allow minute subscriptions:
		if( sub.interval != '1' ) return
		if( this.realtimeEnabled ) this.ws.subscribe(`AM.${symbolInfo.ticker}`)
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


	/**
	 *  Add the websocket listeners and start the connection:
	 *  @return {null}
	 */
	wsListeners(){
		if( !this.realtimeEnabled ) return
		this.ws = new PolygonWebsockets({ apiKey: this.apikey })
		this.ws.on('AM', ( aggMin ) => {
			Each( this.subscriptions, ( sub ) => {
				sub.callback( {
					open: aggMin.o,
					close: aggMin.c,
					high: aggMin.h,
					low: aggMin.l,
					volume: aggMin.v,
					time: aggMin.s,
				})
			})
		})
	}


}


export default PolygonAdapter