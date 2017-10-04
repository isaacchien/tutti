'use strict';


let datastore = require('../lib/datastore');
var request = require('request');

var client_id = '37c50fb2e74848a6841ddea2b1e195f2';
var client_secret = '397cd71cbb2d45f7a9c7b848e162f706';


function hello (){
	console.log('hi')
}
function renewToken(psid, refreshToken){
	console.log('renewToken');
	var options = {
      url: 'https://accounts.spotify.com/api/token',
 	  headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))},
      form: {
      	grant_type: 'refresh_token',
      	refresh_token: refreshToken
 		}
    };
    var promise = new Promise(function (resolve, reject){
    	
	    request.post(options, function (error, response, body){
	    	// REFRESHED now get the user's old details
	    	var accessToken = JSON.parse(body)['access_token'];

	    	const refreshedUser = {
				access_token: accessToken,
				refresh_token: refreshToken
			};

			const userKey = datastore.key(['User', psid]);

			const entity = {
				key: userKey,
				data: refreshedUser
			}

			datastore.update(entity)
			  .then(() => {
			    // Task inserted successfully.
			    console.log('refreshed');
			    resolve(accessToken);
		    });
	    });

    })
    return promise;
}

function playSongForUser(uri, psid, accessToken, refreshToken) {
	console.log('playSongForUser');
	var options = {
      url: 'https://api.spotify.com/v1/me/player/play',
      headers: { 'Authorization': 'Bearer ' + accessToken },
      body: {'uris': [uri]},
      json: true
    };
	return request.put(options, function (error, response, body){
    	if (response.statusCode == 401){ // invalid token must renew
    		renewToken(psid, refreshToken)
    		.then(function(newAccessToken){
    			console.log("playing again with ", newAccessToken)
    			user["access_token"] = newAccessToken;
	            return playSongForUser(uri, psid, newAccessToken, refreshToken);
	    	});
    	} else {
    		return response.statusCode;
    	}
	});
}

function checkCurrentlyPlaying(originPSID, updatedThread){
	console.log('check if playing');
	const userKey = datastore.key(['User', originPSID]);
	const query = datastore.createQuery('User')
	  .filter('__key__ ', '=', userKey)
	  .limit(1);
	
	var promise = new Promise(function (resolve, reject){
		datastore.runQuery(query)
		.then((results) => {
			// Task entities found.
			const user = results[0][0];
			var accessToken = user["access_token"];
			var options = {
			  url: 'https://api.spotify.com/v1/me/player/currently-playing',
				  headers: { 
				  	'Authorization': 'Bearer ' + accessToken,
				  	'Accept': 'application/json',
				  	'Content-Type': 'application/json'
				  }
			};
			request.get(options, function (error, response, body){
				// check if spotify is open
				console.log('response: ', response.statusCode);
				resolve(response.statusCode);
			});
		});
	});
	return promise;
}

module.exports = function (router) {

	router.post('/play', function (req, res, next) {
		var originPSID = JSON.parse(req.body)['psid'];
		var tid = JSON.parse(req.body)['tid'];
		var duration = JSON.parse(req.body)['duration'];
		var uri = JSON.parse(req.body)['uri'];
		var id = JSON.parse(req.body)['id'];
		var image = JSON.parse(req.body)['image'];
		var artist = JSON.parse(req.body)['artist'];
		var name = JSON.parse(req.body)['name'];
		// get user IDs

		var promises = [];

		var updatedThread;

    	const threadKey = datastore.key(['Thread', tid]);
		datastore.get(threadKey)
		.then((threadResults) => {
			updatedThread = threadResults[0];
			const users = threadResults[0]['users'];
			users.forEach((psid) => {
				console.log('new promise');
				promises.push(new Promise((resolve, reject) => { // new promise for each user
			    	const userKey = datastore.key(['User', psid]);
					datastore.get(userKey)
					.then((userResults) => { // got the user
					  	return playSongForUser(uri, psid, userResults[0]["access_token"], userResults[0]["refresh_token"]);
				  	}).then(function(){
				  		resolve();
				  	});
			  	}));	
			})
			// all requests are ready to be sent back
			Promise.all(promises)
			.then((results) => {
				// update tid with current song, current time, and song length
				console.log('all promises: ', promises);

				updatedThread['now_playing'] = {
					uri: uri,
					duration: duration,
					start: Date.now(),
					id: id,
					image: image,
					artist: artist,
					name: name
				};
				const entity = {
				  key: threadKey,
				  data: updatedThread
				};
				datastore.upsert(entity) // update thread
				checkCurrentlyPlaying(originPSID, updatedThread)
				.then((statusCode) => {
					res.send(statusCode);
				});
			})
			.catch(next)
		});
	});

	router.post('/join', function (req, res, next){
		console.log('/join');
		var tid = JSON.parse(req.body)['tid'];
		var psid = JSON.parse(req.body)['psid'];
		var accessToken = JSON.parse(req.body)['access_token'];
		var refreshToken = JSON.parse(req.body)['refresh_token'];

		console.log('body: ', JSON.parse(req.body));

    	const threadKey = datastore.key(['Thread', tid]);
		datastore.get(threadKey)
		  .then((threadResults) => {
		  	var nowPlaying = threadResults[0]['now_playing'];
		  	var start = nowPlaying['start'];
		  	var duration = nowPlaying['duration'];
		  	var uri = nowPlaying['uri'];

		  	console.log(Date.now());
		  	var offset = (Date.now()) - start;
		  	console.log('offset: ', offset);
		  	console.log('d: ', duration);

		  	console.log('offset < duration: ', (offset < duration));


		  	if (offset < duration) {
		  		// play song for user
		  		// check if playing. if not, send response
		  		// if it is playing, seek to offset.


				new Promise((resolve, reject) => {
					playSongForUser(uri, psid, accessToken, refreshToken);
					resolve();
				}).then(function(){
					console.log("offset: ", offset);
					var seekOptions = {
				      url: 'https://api.spotify.com/v1/me/player/seek?position_ms=' + offset,
				      headers: { 'Authorization': 'Bearer ' + accessToken }
				    };
		    		request.put(seekOptions, function (error, response, body){
	    				console.log('JOINED');
						res.send(200, {now_playing: nowPlaying});
		    		});
				});
		    					
		  	}
		  	next();
		});

	    // });

		// if it's not the user's current song
		// make user play thread's song
	});

	router.get('/nowplaying/:tid', function(req, res, next){
		var tid = req.params['tid'];
		console.log('/nowplaying');
    	const threadKey = datastore.key(['Thread', tid]);
    	console.log('threadKey: ', threadKey);
		datastore.get(threadKey)
		  .then((threadResults) => {
		  	console.log('threadResults: ', threadResults);
			var nowPlaying = threadResults[0]['now_playing'];
			console.log('nowPlaying: ', nowPlaying);
			res.send(200, {now_playing: nowPlaying});
		  });
		next();
	});

	router.get('/user/:psid', function(req, res, next){
		console.log('/user');
		var psid = req.params['psid'];

		const userKey = datastore.key(['User', psid]);

		const query = datastore.createQuery('User')
		  .filter('__key__ ', '=', userKey)
		  .limit(1);
		datastore.runQuery(query)
		  .then((results) => {
		    // Task entities found.
		    const user = results[0][0];
		    if (user != null) {
				res.send(200,user);
				console.log('found user');
		    } else {
		    	res.status(404)
		    	res.send({message: "user not found"});
		    	console.log('user not found');
		    }

		  });
		next();
	});

	router.post('/thread/:tid', function (req, res, next) {
		// The kind for the new entity
		const kind = 'Thread';
		// The name/ID for the new entity
		const name = req.params['tid'];
		// The Cloud Datastore key for the new entity
		const threadKey = datastore.key([kind, name]);

		// Prepares the new entity
		const thread = {
		  key: threadKey,
		  data: {
		    spotifyToken: 'hereisatoken234',
		    psid: req.body['psid']
		  }
		};

		// Saves the entity
		datastore.save(thread)
		  .then(() => {
		    res.send('hi');
		  })
		  .catch((err) => {
		    console.error('ERROR:', err);
		  });
		next();

	});

	router.get('/threads', function (req, res, next) {
		console.log('get all threads');
		const query = datastore.createQuery('Thread');		
		datastore.runQuery(query)
		  .then((results) => {
		    // Task entities found.
		    const threads = results[0];

		    threads.forEach((thread) => console.log(thread));
		    res.send(threads);
		  });
		next();
	});

	router.get('/thread/:tid', function (req, res, next) {
		console.log('get threads with id');
		var tid = req.params['tid'];
		const query = datastore.createQuery('Thread')
			.filter('__key__', '=', datastore.key(['Thread', tid]));		
		datastore.runQuery(query)
		  .then((results) => {
		    // Task entities found.
		    const threads = results[0];

		    threads.forEach((thread) => console.log(thread));
		    res.send(threads);
		  });
		next();
	});


	router.post('/refresh', function(req, res, next){
		var refreshToken = JSON.parse(req.body)['refresh_token'];
		var psid = JSON.parse(req.body)['psid'];
		renewToken(psid, refreshToken)
		.then((accessToken)=>{
		    res.send(200, {access_token: accessToken});
		});

	    next();
	});


	// gets the token and then stores user to db
	router.post('/callback', function (req, res, next){

		console.log('callback');
		var code = JSON.parse(req.body)['code'];
		var psid = JSON.parse(req.body)['psid'];
		var tid = JSON.parse(req.body)['tid'];
		// get tokens from spotify
		var options = {
	      url: 'https://accounts.spotify.com/api/token',
	 	  headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))},
	      form: {
	      	grant_type: 'authorization_code',
		    code: code,
		    redirect_uri: 'https://river-dash.glitch.me',
			}
		}

	    request.post(options, function (error, response, body){
	    	var promises = [];
	    	//SENT
	    	const threadKey = datastore.key(['Thread', tid]);

			promises.push(new Promise((resolve, rejcect) => {
    	
		    	// get thread 
				datastore.get(threadKey)
	  				.then((results) => {
					    const thread = results[0];
					    console.log('typeof thread: ', typeof thread);
					    if (typeof thread == 'undefined' ) { // no thread you start the list
					    	const threadData = {
					    		users: [psid]
					    	}
					    	const threadEntity = {
					    		key: threadKey,
					    		data: threadData
					    	}
							datastore.upsert(threadEntity)
					 		  .then(() => {
					 		  	resolve('created new thread');
							  }).catch((err) => {
							    console.error('ERROR:', err);
							  });
					    } else { // update the thread
					    	thread['users'].push(psid);
					    	const threadData = {
					    		users: thread['users'],
					    		now_playing: thread['now_playing']
					    	}
					    	const threadEntity = {
					    		key: threadKey,
					    		data: threadData
					    	}				    	
							datastore.upsert(threadEntity)
							  .then(() => {
							    // Task inserted successfully.
							    resolve('joined thread');
							  });
					    }
	  				});
	  		}));

	    	var accessToken = JSON.parse(body)['access_token'];
	    	var refreshToken = JSON.parse(body)['refresh_token'];

	    	// add to database
	    	const user = {
				access_token: accessToken,
				refresh_token: refreshToken
			};

			const userKey = datastore.key(['User', psid]);

			const entity = {
				key: userKey,
				data: user			
			}
			promises.push(new Promise((resolve, rejcect) => {

				datastore.upsert(entity)
				  .then(() => {
				    // Task inserted successfully.
				    resolve('inserted user');
				  });
			}));

			Promise.all(promises)
			.then((results) => {
				res.send(200, {
			    	access_token: accessToken,
			    	refresh_token: refreshToken
			    });		
			})
			.catch(next);

	    next();
	    });
	});
}