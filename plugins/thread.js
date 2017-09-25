'use strict';

let datastore = require('../lib/datastore');

module.exports = function threadPlugin (req, res, next) {
	// parse out thread id
	// /a/url/123?a=query&b=query2
	// { "b": "body"}

	// 1. find cookie/sesion-id from header/or body
	// 2. go to db grab session object
	// 3. set session object to request
	// req.session = db.get('session-id')

	// req.params
	// req.body
	// req.query['a']

	// check session
	if (true) {
		// exists
		
		next();
	} else {
		// new
		res.status(500).send({
			status: 'unauthorized'
		})
	}
}