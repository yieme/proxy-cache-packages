'use strict';

var proxyCacheMultiDomain = require('./')
var urls = '/bootswatch@3/slate'

process.on('uncaughtException', function (err) {
	console.log('uncaughtExemption:', err)
	console.log('stack:', err.stack)
})

proxyCacheMultiDomain({url: urls}, function(err, data) {
	if (err) throw err
	console.log('headers:', data.headers)
	console.log('body:',    data.body.substr(0,55) + '...', data.body.length)
})
