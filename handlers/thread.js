'use strict';


let datastore = require('../lib/datastore');
var request = require('request');

var client_id = '37c50fb2e74848a6841ddea2b1e195f2';
var client_secret = '397cd71cbb2d45f7a9c7b848e162f706';

module.exports = function (router) {

	router.post('/play', function (req, res, next) {
		var tid = JSON.parse(req.body)['tid'];
		var duration = JSON.parse(req.body)['duration'];
		var uri = JSON.parse(req.body)['uri'];
		var id = JSON.parse(req.body)['id'];
		var image = JSON.parse(req.body)['image'];
		var artist = JSON.parse(req.body)['artist'];
		var name = JSON.parse(req.body)['name'];
		var accessToken;
		// get user IDs

		var promises = [];

		var updatedThread;

    	const threadKey = datastore.key(['Thread', tid]);
		datastore.get(threadKey)
		  .then((threadResults) => {
		  	updatedThread = threadResults[0];
		    const users = threadResults[0]['users'];
			    users.forEach((psid) => {
			    	promises.push(new Promise((resolve, reject) => { // new promise for each user
				    	const userKey = datastore.key(['User', psid]);
						datastore.get(userKey)
						  .then((userResults) => { // got the user
						  	accessToken = userResults[0]['access_token'];
							var options = {
						      url: 'https://api.spotify.com/v1/me/player/play',
						      headers: { 'Authorization': 'Bearer ' + accessToken },
						      body: {'uris': [uri]},
						      json: true
						    };
						    request.put(options, function (error, response, body){
						    	//SENT
						    	console.log('response.statusCode: ', response.statusCode);
						    	console.log('response.statusCode: ', response.statusMessage);
						    	if (response.statusCode == 401){ // invalid token must renew
						    		res.send(response.statusCode)
						    		reject();
						    	}
						    	resolve("now playing");
						    });

					  	})
				  	}));	
			   	})
				// all requests are ready to be sent back
				Promise.all(promises)
				.then((results) => {
					// update tid with current song, current time, and song length
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
					datastore.upsert(entity)
					  .then(() => {
					  	// check if actually playing 
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
	    					if (response.statusCode == 200){
		    					var userIsPlaying = JSON.parse(body)['is_playing'];
		    					if (userIsPlaying == true) { // success
									res.send(200, {now_playing: updatedThread['now_playing']});
		    					} else {
									res.send(500);
		    					}
	    					} else {
								res.send(204);
	    					}
					    });
					  });

				})
				.catch(next)
			});

		    
	});

	router.post('/join', function (req, res, next){
		console.log('/join');
		var tid = JSON.parse(req.body)['tid'];
		var psid = JSON.parse(req.body)['psid'];
		var accessToken = JSON.parse(req.body)['accessToken'];
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
  				var options = {
			      url: 'https://api.spotify.com/v1/me/player/play',
			      headers: { 'Authorization': 'Bearer ' + accessToken },
			      body: {
			      	"uris": [uri]
			      },
			      json: true
			    };
			    request.put(options, function (error, response, body){
			    	console.log('response.statusCode: ', response.statusCode)
	    			if (response.statusCode == 401){ // invalid token must renew
	    				console.log('invalid token');
			    		res.send(401);
			    	} else {

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
	    					if (response.statusCode == 200){
		    					var userIsPlaying = JSON.parse(body)['is_playing'];
			    				if (userIsPlaying == true) { // success
			    					var seekOptions = {
								      url: 'https://api.spotify.com/v1/me/player/seek?position_ms=' + offset,
								      headers: { 'Authorization': 'Bearer ' + accessToken }
								    };
						    		request.put(seekOptions, function (error, response, body){
					    				console.log('JOINED');
										res.send(200, {now_playing: nowPlaying});
						    		});
		    					} else {
									res.send(500);
		    					}
	    					} else {
								res.send(204);
	    					}
					    });
				  	}
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

		// get new token from spotify
		var options = {
	      url: 'https://accounts.spotify.com/api/token',
	 	  headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))},
	      form: {
	      	grant_type: 'refresh_token',
	      	refresh_token: refreshToken
	 		}
	    };
	    request.post(options, function (error, response, body){
	    	// REFRESHED now get the user's old details
	    	var accessToken = JSON.parse(body)['access_token'];

			const userKey = datastore.key(['User', psid]);

			const query = datastore.createQuery('User')
			  .filter('__key__ ', '=', userKey)
			  .limit(1);

			datastore.runQuery(query)
			  .then((results) => {
			    // Task entities found.
			    const user = results[0][0];

			    if (user != null) {
			    	const refreshedUser = {
						access_token: accessToken,
						refresh_token: refreshToken,
						tid: user.tid
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
					    res.send(200, {access_token: accessToken});
				    });
			    } else {
			    	res.status(404);
			    	res.send({message: "user not found"});
			    }
	    	});
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