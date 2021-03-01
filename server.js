var app = require('http').createServer(handler),
	io = require('socket.io').listen(app, { log: false }),
	fs = require('fs'),
	escape = require('escape-html'),
	connmgr = require("./connmgr.js"),
	gm = require("./game.js"),
	port = process.env.port || 42420;

app.listen(port);
console.log('>>> Sketchers started on port ' + port + ' >>>');

// ================================================
// server routing
// ================================================

function handler (req, res) {
	var reqFile = req.url;
	
	// default file
	if (reqFile == '/') {
		reqFile = '/index.html';
	}
	
	// file exists?
	try {
		fs.lstatSync(__dirname + '/client' + reqFile);
	}
	catch (e) {
		reqFile = '/404.html';
	}
	
	// show file
	fs.readFile(__dirname + '/client' + reqFile,
		function (err, data) {
			if (err) {
				res.writeHead(200);
				return res.end('Error loading requested file ' + reqFile);
			}
			
			var filetype = reqFile.substr(reqFile.lastIndexOf('.'));
			switch(filetype) {
				case '.html':
					res.setHeader('Content-Type', 'text/html');
					break;
				case '.js':
					res.setHeader('Content-Type', 'application/javascript');
					break;
				case '.css':
					res.setHeader('Content-Type', 'text/css');
					break;
				case '.gif':
					res.setHeader('Content-Type', 'image/gif');
					break;
				case '.png':
					res.setHeader('Content-Type', 'image/png');
					break;
			}
			
			res.writeHead(200);
			res.end(data);
		}
	);
}

// ================================================
// app logic
// ================================================


function shuffle(array) {
	var currentIndex = array.length, temporaryValue, randomIndex;

	// While there remain elements to shuffle...
	while (0 !== currentIndex) {

	  // Pick a remaining element...
	  randomIndex = Math.floor(Math.random() * currentIndex);
	  currentIndex -= 1;

	  // And swap it with the current element.
	  temporaryValue = array[currentIndex];
	  array[currentIndex] = array[randomIndex];
	  array[randomIndex] = temporaryValue;
	}
}

var startGame = function(dictionary) {
	var game = new gm.Game(dictionary);

	var connectionManager = new connmgr.ConnectionManager(game);
	io.sockets.on('connection', function (socket) {
		connectionManager.handleConnection(socket);
	});
};

// load dictionary
fs.readFile(__dirname + '/dictionaries/de.txt', function (err, data) {
	var dictionary = data.toString('utf-8').split('\r\n');
	dictionary = dictionary.map(function(x) {
		return x.split(",");
	});
	dictionary = dictionary.filter(function(x) { return x.length == 2; });
	console.log(dictionary.length + " words in dictionary");
	shuffle(dictionary);

	startGame(dictionary);
});

