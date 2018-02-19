var BitcoinTrade = require("api-bitcoin-trade");
var _ = require('lodash');
var moment = require('moment');
var log = require('../core/log');
var util = require('../core/util');

var Trader = function (config) {
	_.bindAll(this);
	if (_.isObject(config)) {
		this.apiKey = config.key;
	}
	this.name = 'BitcoinTrade';
	this.BitcoinTrade = new BitcoinTrade(this.apikey);
}

// if the exchange errors we try the same call again after
// waiting 10 seconds
Trader.prototype.retry = function (method, args) {
	var wait = +moment.duration(10, 'seconds');
	log.debug(this.name, 'returned an error, retrying..');

	var self = this;

	// make sure the callback (and any other fn)
	// is bound to Trader
	_.each(args, function (arg, i) {
		if (_.isFunction(arg))
			args[i] = _.bind(arg, self);
	});

	// run the failed method again with the same
	// arguments after wait
	setTimeout(
		function () { method.apply(self, args) },
		wait
	);
}

// implemented/ not tested
Trader.prototype.getPortfolio = function (callback) {
	// var args = _.toArray(arguments);
	// var set = function (err, data) {

	// 	if (data && data.error) {
	// 		err = data.error;
	// 	}

	// 	if (err) {
	// 		if (err.meta && err.meta.reason === 'API key not found')
	// 			util.die('BitcoinTrade says this API keys is invalid..');

	// 		log.error('BitcoinTrade API ERROR:', err);
	// 		return this.retry(this.getPortfolio, args);
	// 	}

	// 	var portfolio = [];
	// 	_.each(data, function (amount, asset) {
	// 		if (asset.indexOf('available') !== -1) {
	// 			asset = asset.substr(0, 3).toUpperCase();
	// 			portfolio.push({ name: asset, amount: parseFloat(amount) });
	// 		}
	// 	});
	// 	callback(err, portfolio);
	// }.bind(this);

	this.BitcoinTrade.getWalletBalance().then(dat => {
		let data = [
			{
				"available_amount": 0,
				"locked_amount": 0,
				"currency_code": "BRL"
			},
			{
				"available_amount": 0,
				"locked_amount": 0.00277646,
				"currency_code": "BTC"
			}];
			let portfolio = [];
			data.forEach(wallet => {
				portfolio.push({ name: wallet.currency_code, amount: wallet.available_amount });
			});
			callback(false, portfolio);
	}).catch(err => {
		callback(err);
	});
}

// implemented: not tested
Trader.prototype.getTicker = function (callback) {
	this.BitcoinTrade.getTicketSummary().then(data => {
		let ticket = {
			ask: data.ticket.sell,
			bid: data.ticket.buy,
			last: data.ticket.last,
			high: data.ticket.high,
			low: data.ticket.low
		};
		callback(false, ticket);
	}).catch(err => {
		callback(err);
	});
}

// implemented: not tested
Trader.prototype.getFee = function (callback) {
	callback(false, 0.25 / 100);
}

// implemented: not tested
Trader.prototype.buy = function (amount, price, callback) {
	var args = _.toArray(arguments);
	var set = function (err, result) {
		if (err || !result) {
			log.error('unable to buy:', err,'retrying...');
			return this.retry(this.buy, args);
		}
		callback(null, result.id);
	}.bind(this);

	//Decrease amount by 1% to avoid trying to buy more than balance allows.
	amount -= amount / 100;

	amount *= 100000000;
	amount = Math.floor(amount);
	amount /= 100000000;

	// prevent:
	// 'Ensure that there are no more than 2 decimal places.'
	price *= 100;
	price = Math.floor(price);
	price /= 100;

	this.BitcoinTrade.createOrderToBuy(amount, price).then(data => {
		set(false, data);
	}).catch(err => {
		set(err);
	});
}

// implemented: not tested
Trader.prototype.sell = function (amount, price, callback) {
	var args = _.toArray(arguments);
	var set = function (err, result) {
		if (err || !result) {
			log.error('unable to sell:', err, 'retrying...');
			return this.retry(this.sell, args);
		}
		callback(null, result.id);
	}.bind(this);

	// prevent:
	// 'Ensure that there are no more than 8 decimal places.'
	amount *= 100000000;
	amount = Math.floor(amount);
	amount /= 100000000;

	// prevent:
	// 'Ensure that there are no more than 2 decimal places.'
	price *= 100;
	price = Math.ceil(price);
	price /= 100;

	this.BitcoinTrade.createOrderToSell(amount, price).then(data => {
		set(false, data);
	}).catch(err => {
		set(err);
	});
}

// implemented: not tested
Trader.prototype.getOrder = function (id, callback) {
	var args = _.toArray(arguments);
	var get = function (err, data) {
		if (!err && _.isEmpty(data) && _.isEmpty(data.orders))
			err = 'no data';

		else if (!err && !_.isEmpty(data.error))
			err = data.error;

		if (err) {
			log.error('Unable to get order', order, JSON.stringify(err));
			return this.retry(this.getOrder, args);
		}

		var order = _.find(data.orders, o => o.id === id);

		if (!order) {
			// if the order was cancelled we are unable
			// to retrieve it, assume that this is what
			// is happening.
			return callback(err, {
				price: 0,
				amount: 0,
				date: moment(0)
			});
		}

		var price = parseFloat(order.unit_price);
		var amount = Math.abs(parseFloat(order.remaining_amount));
		var date = moment(order.update_date);

		callback(err, { price, amount, date });
	}.bind(this);

	this.BitcoinTrade.getUserOrders(null).then(data => {
		get(false, data);
	}).catch(err => {
		get(err);
	});
}

// implemented: not tested
Trader.prototype.checkOrder = function (order, callback) {
	var check = function (err, result) {
		var stillThere = _.find(result, o => o.id === order);
		callback(err, !stillThere);
	}.bind(this);

	this.BitcoinTrade.getUserOrders(null).then(data => {
		check(false, data.orders);
	}).catch(err => {
		check(err);
	});
}

// implemented: not tested
Trader.prototype.cancelOrder = function (order, callback) {
	var args = _.toArray(arguments);
	var cancel = function (err, result) {
		if (err || !result) {
			log.error('unable to cancel order', order, '(', err, result, ')');
			return this.retry(this.cancelOrder, args);
		}
		callback();
	}.bind(this);

	this.BitcoinTrade.cancelOrder(order).then(data => {
		cancel(false, data);
	}).catch(err => {
		cancel(err);
	});
}

// implemented: not tested
Trader.prototype.getTrades = function (since, callback, descending) {
	var args = _.toArray(arguments);
	var process = function (err, trades) {
		if (err)
			return this.retry(this.getTrades, args);

		var result = _.map(trades, t => {
			return {
				date: moment(t.date).unix(),
				tid: +t.active_order_code,
				price: +t.unit_price,
				amount: +t.amount
			}
		})

		callback(null, result.reverse());
	}.bind(this);

	this.BitcoinTrade.getTrades().then(data => {
		process(false, data.trades);
	}).catch(err => {
		process(err);
	});
}

// implemented: not tested
Trader.getCapabilities = function () {
	return {
		name: 'BitcoinTrade',
		slug: 'bitcoin-trade',
		currencies: ['BRL'],
		assets: ['BTC'],
		maxTradesAge: 60,
		maxHistoryFetch: null,
		markets: [
			{ pair: ['BRL', 'BTC'], minimalOrder: { amount: 0.0003, unit: 'asset' } }
		],
		requires: ['key'],
		fetchTimespan: 60,
		tid: 'tid',
		tradable: true
	};
}

module.exports = Trader;
