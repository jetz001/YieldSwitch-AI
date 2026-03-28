const ccxt = require('ccxt');
const exchange = new ccxt.bitget();

const methods = Object.keys(exchange).filter(m => m.toLowerCase().includes('order') && m.toLowerCase().includes('place'));
console.log('METHODS:', methods);
