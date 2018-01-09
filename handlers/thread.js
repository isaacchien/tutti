const datastore = require('../lib/datastore');
const request = require('request');
const config = require('config');

const clientID = config.get('Client.id');
const clientSecret = config.get('Client.secret');
const bunyan = require('bunyan');


const log = bunyan.createLogger({ name: 'tutti' });


function renewToken(psid, refreshToken) {
  log.info(renewToken);
  const options = {
    url: config.get('Spotify.token'),
    headers: { Authorization: `Basic ${Buffer.from(`${clientID}:${clientSecret}`).toString('base64')}` },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
  };
  const promise = new Promise(((resolve, reject) => {
    request.post(options, (error, response, body) => {
      if (error) {
        return reject(error)
      }

      // REFRESHED now get the user's old details
      const accessToken = JSON.parse(body).access_token;

      const refreshedUser = {
        access_token: accessToken,
        refresh_token: refreshToken,
      };

      const userKey = datastore.key(['User', psid]);

      const entity = {
        key: userKey,
        data: refreshedUser,
      };

      datastore.update(entity)
        .then(() => {
          // Task inserted successfully.
          resolve(accessToken);
        });
    });
  }));
  return promise;
}

function playSongForUser(uri, psid, accessToken, refreshToken, offset = 0) {
  // add a seek parameter
  // seek in here too

  const options = {
    url: config.get('Spotify.play'),
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { uris: [uri] },
    json: true,
  };
  return new Promise((resolve, reject)=>{
    request.put(options, (error, response, body) => {
      if (response.statusCode === 401) { // invalid token must renew
        renewToken(psid, refreshToken)
          .then(newAccessToken => playSongForUser(uri, psid, newAccessToken, refreshToken));
      } else {
        resolve(response.statusCode)
      }
    })
  }).then((playStatusCode) => {
    if (offset !== 0) {
      const delaySeek = function (offset, accessToken) {
        const seekOptions = {
          url: `https://api.spotify.com/v1/me/player/seek?position_ms=${offset}`,
          headers: { Authorization: `Bearer ${accessToken}` },
        };
        return request.put(seekOptions, (error, response, body) => {
          if (error) {
            log.info('ERROR: ', error);
          }
          return response.statusCode; // seek
        });
      };
      return asyncDelay(delaySeek, offset, accessToken, 200);    
    } else {
      return playStatusCode
    }
  })
  // seek if needed

  // check if playing
}

function checkCurrentlyPlaying(originPSID) {
  const userKey = datastore.key(['User', originPSID]);
  const query = datastore.createQuery('User')
    .filter('__key__ ', '=', userKey)
    .limit(1);


  const promise = new Promise(((resolve, reject) => {
    datastore.runQuery(query)
      .then((results) => {
        // Task entities found.
        const user = results[0][0];
        const accessToken = user.access_token;
        const options = {
          url: config.get('Spotify.currentlyPlaying'),
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        };
        request.get(options, (error, response, body) => {
          // check if spotify is open
          resolve(response.statusCode);
        });
      });
  }));
  return promise;
}


function asyncDelay(fx, offset, accessToken, delay) {
  // return a promise
  return setTimeout(fx, delay, offset, accessToken);
}

module.exports = function (router) {
  router.post('/play', (req, res, next) => {
    // sends 200 if device is playing
    // sends 204 if device isn't playing but is added to db

    let playData = null;

    try {
      playData = JSON.parse(req.body);
    } catch (e) {
      playData = req.body;
    }

    const originPSID = String(playData.psid);
    const tid = String(playData.tid);
    const duration = playData.duration;
    const uri = playData.uri;
    const id = playData.id;
    const image = playData.image;
    const artist = playData.artist;
    const name = playData.name;
    // get user IDs


    let updatedThread;

    const threadKey = datastore.key(['Thread', tid]);

    datastore.get(threadKey)
    .then((threadResults) => {
      updatedThread = threadResults[0];
      const users = threadResults[0].users;
      let promises = users.map((user) => {
        const userKey = datastore.key(['User', user.psid]);
        return datastore.get(userKey)
          .then((userResults) => {
            const accessToken = userResults[0].access_token;
            const refreshToken = userResults[0].refresh_token;
            return playSongForUser(uri, user.psid, accessToken, refreshToken);
          });
      });
      // all requests are ready to be sent back
      return Promise.all(promises)
    })
    .then(() => {
      // update tid with current song, current time, and song length
      updatedThread.now_playing = {
        uri,
        duration,
        start: Date.now(),
        id,
        image,
        artist,
        name,
      };
      const entity = {
        key: threadKey,
        data: updatedThread,
      };
      


      return Promise.all([
        datastore.upsert(entity),
        checkCurrentlyPlaying(originPSID) // ADD DELAY
      ])

    })
    .then((results) => {
      checkStatusCode = results[1]
      res.send(checkStatusCode)
    })
    .catch(function(error){
      log.info(error)
      res.send(error, 500)
    });
  });

  router.post('/join', (req, res, next) => {
    // 200 if seeked
    // 500 first time join no thread to get


    let joinData = null;
    try {
      joinData = JSON.parse(req.body);
    } catch (e) {
      joinData = req.body;
    }

    const tid = joinData.tid.toString();
    const psid = joinData.psid.toString();
    const accessToken = joinData.access_token;
    const refreshToken = joinData.refresh_token;


    const threadKey = datastore.key(['Thread', tid]);


    datastore.get(threadKey)
    .then((threadResults) => {
      const nowPlaying = threadResults[0].now_playing;
      const start = nowPlaying.start;
      const duration = nowPlaying.duration;
      const uri = nowPlaying.uri;

      const offset = (Date.now()) - start;

      // song is still playing
      log.info("offset: ", offset)
      log.info("duration: ", duration)
      if (offset < duration) {
        // need to play song and then check if playing
        return playSongForUser(uri, psid, accessToken, refreshToken, offset)
        .then((playStatusCode)=>{
          return checkCurrentlyPlaying(psid)
        }).then((checkStatusCode) => {
          log.info(checkStatusCode)
          return res.send(checkStatusCode)
        })
      } else {
        // no song to queue
        return res.send(404);
      }
    }).catch(next); // first time user

    // });

    // if it's not the user's current song
    // make user play thread's song
  });

  router.get('/thread/:tid', (req, res, next) => {
    const tid = req.params.tid;
    const threadKey = datastore.key(['Thread', tid]);
    datastore.get(threadKey)
    .then((threadResults) => {
      const thread = threadResults[0];
      res.send(200, { users:thread.users, now_playing:thread.now_playing });
    }).catch(next);
  });

  router.get('/user/:psid', (req, res, next) => {
    const psid = req.params.psid;

    const userKey = datastore.key(['User', psid]);

    const query = datastore.createQuery('User')
      .filter('__key__ ', '=', userKey)
      .limit(1);
    datastore.runQuery(query)
      .then((results) => {
        // Task entities found.
        const user = results[0][0];
        if (user != null) {
          res.send(200, user);
        } else {
          res.status(404);
          res.send({ message: 'user not found' });
        }
      });
    next();
  });

  router.get('/threads', (req, res, next) => {
    const query = datastore.createQuery('Thread');
    datastore.runQuery(query)
      .then((results) => {
        // Task entities found.
        const threads = results[0];

        res.send(threads);
      });
    next();
  });


  router.post('/refresh', (req, res, next) => {
    const refreshToken = JSON.parse(req.body).refresh_token;
    const psid = JSON.parse(req.body).psid;
    renewToken(psid, refreshToken)
      .then((accessToken) => {
        res.send(200, { access_token: accessToken });
      });

    next();
  });

  // gets the token and then stores user to db
  router.post('/callback', (req, res, next) => {
    const code = JSON.parse(req.body).code;
    const psid = JSON.parse(req.body).psid;
    const tid = JSON.parse(req.body).tid;
    const name = JSON.parse(req.body).name;

    // get tokens from spotify
    const options = {
      url: config.get('Spotify.token'),
      headers: { Authorization: `Basic ${Buffer.from(`${clientID}:${clientSecret}`).toString('base64')}` },
      form: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://river-dash.glitch.me',
      },
    };

    request.post(options, (error, response, body) => {
      const promises = [];
      // SENT
      const threadKey = datastore.key(['Thread', tid]);

      promises.push(new Promise((resolve, reject) => {
        // get thread
        datastore.get(threadKey)
          .then((results) => {
            const thread = results[0];
            if (typeof thread === 'undefined') { // no thread you start the list
              const threadData = {
                users: [{
                  'psid':psid,
                  'name':name 
                }],
              };
              const threadEntity = {
                key: threadKey,
                data: threadData,
              };
              datastore.upsert(threadEntity)
                .then(() => {
                  resolve('created new thread');
                }).catch((err) => {
                  console.error('ERROR:', err);
                });
            } else { // update the thread
              thread.users.push({
                'psid':psid,
                'name':name 
              });
              const threadData = {
                users: thread.users,
                now_playing: thread.now_playing,
              };
              const threadEntity = {
                key: threadKey,
                data: threadData,
              };
              datastore.upsert(threadEntity)
                .then(() => {
                  // Task inserted successfully.
                  resolve('joined thread');
                });
            }
          });
      }));

      const accessToken = JSON.parse(body).access_token;
      const refreshToken = JSON.parse(body).refresh_token;

      // add to database
      const user = {
        access_token: accessToken,
        refresh_token: refreshToken,
      };

      const userKey = datastore.key(['User', psid]);

      const entity = {
        key: userKey,
        data: user,
      };
      promises.push(new Promise((resolve, reject) => {
        datastore.upsert(entity)
          .then(() => {
            // Task inserted successfully.
            resolve('inserted user');
          });
      }));

      Promise.all(promises)
        .then(() => {
          res.send(200, {
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        })
        .catch(next);

      next();
    });
  });
};