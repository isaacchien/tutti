var restify = require('restify');


var server = restify.createServer();

// use handler chains executed after route has been chosen to service the request
// function handlers attached via use() will be run for all routes
// use() calls happen before defining any routes
server.use(restify.bodyParser({ mapParams: false })); 

server.use( restify.CORS( {origins: ['*']}) );
server.use( restify.fullResponse() );

server.use(require('./plugins/thread'));

// handlers
require('./handlers/thread')(server);


server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});