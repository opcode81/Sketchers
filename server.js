var app = require('http').createServer(handler),
	io = require('socket.io').listen(app, { log: false }),
	fs = require('fs'),
	sanitizer = require('sanitizer'),
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

var proxy = function(fn, ctx) {
	return function() {
		fn.apply(ctx, arguments);
	};
};

var handlerName = function(messageId) {
	return 'handle' + messageId[0].toUpperCase() + messageId.slice(1);
};

var ConnectionManager = function() {
	this.socketsById = {};
};

ConnectionManager.prototype.handleGameMessage = function(socket, messageId, data) {
	game.handlerProxy(socket, messageId, data); 
};

ConnectionManager.prototype.emit = function(socketId, messageId, data) {
	var socket = this.socketsById[socketId];
	if (!socket) 
		console.error('unknown socket ' + socketId);
	else
		socket.emit(messageId, data);
};

var connectionManager = new ConnectionManager();
var dictionary;

var Game = function() {
	this.users = [];
	this.canvas = [];
	this.currentWord = null;
	this.currentPlayer = null; 
	this.drawingTimer = null;
	this.hintIntervalId = null;
	this.roundStartTime = null;
	this.usersById = {};
	this.currentHint = null;
	this.numCurrentHintsProvided;
	this.disconnectedUserScores = {};
};

Game.prototype.emit = function(userOrUserId, messageId, data) {
	var user = typeof(userOrUserId) != 'object' ? this.usersById[userOrUserId] : userOrUserId;
	if (!user)
		console.error('emit: unknown user ' + userOrUserId);
	else {
		connectionManager.emit(user.id, messageId, data);
	}
};

Game.prototype.emitAll = function(messageId, data) {
	for(var i = 0; i < this.users.length; ++i) {
		this.emit(this.users[i], messageId, data);
	}
}

Game.prototype.handlerProxy = function(socket, messageId, data) {
	var user = this.usersById[socket.id];
	if (!user) {
		console.error('user not in game: ' + socket.id);
		return;
	}
	var handler = this[handlerName(messageId)];
	handler.call(this, socket, user, data);
};

var game = new Game();
	
// game mode parametrisation
var roundTime = 120, roundNo = 0;
var correctGuessEndsTurn = false;
var scoreByRemainingTime = true; // if false, score constant
var autoSelectNextPlayer = true; // if false, players must manually select the next player
var maxHints = 4;
var maxHintFraction = 0.40;
var timeBetweenRounds = 7; // seconds

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

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

// load dictionary.txt into memory
fs.readFile(__dirname + '/dictionaries/de.txt', function (err, data) {
	dictionary = data.toString('utf-8').split('\r\n');
	dictionary = dictionary.map(function(x) {
		return x.split(",");
	});
	dictionary = dictionary.filter(function(x) { return x.length == 3; });
	console.log(dictionary.length + " words in dictionary");
	shuffle(dictionary);
});

ConnectionManager.prototype.handleConnection = function(socket) {
	this.socketsById[socket.id] = socket;
	
	var bindCM = function(messageId) {
		socket.on(messageId, function(data) {
				var handler = connectionManager[handlerName(messageId)];
				handler.call(connectionManager, socket, data);
			});
	};
	
	var bindGame = function(messageId) {
		socket.on(messageId, function(data) {
				connectionManager.handleGameMessage(socket, messageId, data);
			});
	};
	
	// bind functions
	bindCM('join'); 
	bindCM('disconnect');
	bindGame('message');
	bindGame('draw');
	bindGame('readyToDraw');
	bindGame('clearCanvas');
};

io.sockets.on('connection', function (socket) {
	connectionManager.handleConnection(socket);
});

Game.prototype.addHint = function() {
	var indices = [];
	for (var i = 0; i < this.currentHint.length; ++i)
		if (this.currentHint[i] == '_')
			indices.push(i);
	if (indices.length > 0) {
		var idx = indices[getRandomInt(0, indices.length-1)];
		this.currentHint = this.currentHint.substr(0, idx) + this.currentWord[idx] + this.currentHint.substr(idx+1);
		++this.numCurrentHintsProvided;
	}
};
	
Game.prototype.provideHint = function() {
	this.addHint();
	this.emitAll('hint', {hint: this.currentHint});
};
	
Game.prototype.emitUsers = function() {
	var sortedUsers = this.users.slice().sort(function(a,b) { return parseFloat(b.score) - parseFloat(a.score); } );
	this.emitAll('users', sortedUsers);
};
	
Game.prototype.startTurn = function(playerId) {
	roundNo++;
	console.log("Round #" + roundNo);
	
	this.currentPlayer = playerId;
	var user = this.usersById[playerId];
	if (!user) {
		console.error('startTurn: found no user for id ' + playerId);
		return;
	}
	
	this.canvas.splice(0, this.canvas.length);
	this.emitAll('clearCanvas');
	
	var word = dictionary[(roundNo-1) % dictionary.length];
	
	this.currentWord = word[0];

	// initialise hint
	var hint = '';
	var nonHint = '- ';
	for (var i = 0; i < this.currentWord.length; ++i) {
		if (nonHint.indexOf(this.currentWord[i]) === -1) {
			hint += '_';
		}
		else {
			hint += this.currentWord[i];
		}
	}
	this.numCurrentHintsProvided = 0;
	this.currentHint = hint;
	
	// add one hint from the start
	//addHint();
	
	// determine the maximum number of additional hints to provide
	var maxHintsForWord = Math.floor(this.currentWord.length * maxHintFraction);
	var hintsToProvideInTotal = Math.min(maxHints, maxHintsForWord);
	console.log('startTurn: ' + hintsToProvideInTotal + ' hints will be provided');
	var hintsYetToProvide = hintsToProvideInTotal - this.numCurrentHintsProvided;
	var hintInterval = 1000 * (roundTime / (hintsYetToProvide+1));

	// reset user data
	this.users.map(function(u) {
		u.isCurrent = u.id == user.id;
		u.guessedCorrectly = false;
		u.scoreCurrentRound = undefined;
	});
	
	// send messages
	console.log("next player id: " + playerId);
	this.emit(playerId, 'youDraw', word);
	this.emitAll('startRound', { color: user.color, nick: user.nick, time:roundTime, hint:this.currentHint });
	this.emitUsers();
	
	// set the timers for this round
	this.drawingTimer = setTimeout(proxy(this.turnFinished, this), roundTime * 1000);
	this.hintIntervalId = setInterval(proxy(this.provideHint, this), hintInterval);
	this.roundStartTime = new Date().getTime();
};
	
ConnectionManager.prototype.handleJoin = function(socket, msg) {
	'use strict';
	game.handleJoin(socket, msg);
};

Game.prototype.handleJoin = function(socket, msg) {
	var nick, color, score = 0;
	if (msg.nick) {
		nick = sanitizer.sanitize(msg.nick);
	}
	if (nick == '')
		return;
	if (msg.color)
		color = msg.color;
	
	if (this.usersById[socket.id]) {
		console.log('Duplicate join attempted by ' + this.usersById[socket.id].nick);
		return;
	}
	
	// add user
	if (this.disconnectedUserScores[nick]) {
		score = this.disconnectedUserScores[nick];
		delete this.disconnectedUserScores[nick];
	}
	var user = { id: socket.id, nick: nick, color: color, score: score, guessedCorrectly:false, isCurrent:false };
	this.users.push(user);
	this.usersById[socket.id] = user;
	console.log('Player joined: id=' + socket.id + ', nick=' + msg.nick + ', users.length=' + this.users.length);
	
	socket.emit('joined');
	socket.emit('drawCanvas', this.canvas);
	// notify if someone is drawing
	if(this.currentPlayer) {
		var currentUser = this.usersById[this.currentPlayer];
		if (currentUser) {
			var timePassedSecs = Math.floor((new Date().getTime() - this.roundStartTime) / 1000);
			socket.emit('startRound', { color: currentUser.color, nick: currentUser.nick, time: roundTime-timePassedSecs, hint:this.currentHint });
		}
	}
	
	this.emitAll('userJoined', { nick: nick, color: color });
	this.emitUsers();	
};
	
Game.prototype.checkForEndOfRound = function() {
	var doneUsers = this.users.filter(function(u) { return u.guessedCorrectly; });
	var numGuessed = doneUsers.length;
	var allGuessed = numGuessed == this.users.length-1; 
	if ((numGuessed > 0 && correctGuessEndsTurn) || allGuessed) {
		this.turnFinished(false, allGuessed);
	}
};
	
Game.prototype.handleMessage = function (socket, user, msg) {
	var sanitizedMsg = sanitizer.sanitize(msg.text);
	if(sanitizedMsg != msg.text) {
		console.log('(!) Possible attack detected from ' + socket.id + ' (' + user.nick + ') : ' + msg.text);
	}
	if(!sanitizedMsg || sanitizedMsg.length>256) {
		return;
	}
	
	var isCorrectGuess = this.currentWord && sanitizedMsg.toLowerCase().trim() == this.currentWord.toLowerCase();
	
	if (!isCorrectGuess)
		this.emitAll('message', { text: sanitizedMsg, color: user.color, nick: user.nick });
	
	// check if current word was guessed by a player who isn't the drawing player while the round is active
	if (isCorrectGuess && this.currentPlayer != null && this.currentPlayer != socket.id) {
		// ... and the user did not previously guess the word
		if(user && !user.guessedCorrectly) {
			var timePassed = new Date().getTime() - this.roundStartTime;
			var timePassedSecs = Math.floor(timePassed / 1000);
			var timeRemainingSecs = roundTime - timePassedSecs;
			
			// award points
			var pointsAwarded = [];
			// * guessing player
			var points; 
			if (scoreByRemainingTime) 
				points = timeRemainingSecs;
			else
				points = 10;
			user.score += points;
			user.scoreCurrentRound = points;
			user.guessedCorrectly = true;
			pointsAwarded.push([user, points]);
			// * drawing player
			var drawingUser = this.usersById[this.currentPlayer];
			if (scoreByRemainingTime)
				points = Math.floor(timeRemainingSecs / (this.users.length-1));
			else
				points = 10;
			drawingUser.score += points;
			if (!drawingUser.scoreCurrentRound) drawingUser.scoreCurrentRound = 0;
			drawingUser.scoreCurrentRound += points;
			pointsAwarded.push([drawingUser, points]);
			
			this.emitAll('wordGuessed', { timePassedSecs: timePassedSecs, color: user.color, nick: user.nick, points: pointsAwarded });
			socket.emit('youGuessedIt');
			
			// communicate new scores
			this.emitUsers();
			
			this.checkForEndOfRound();
		}
	}
};
	
ConnectionManager.prototype.handleDisconnect = function(socket) {	
	console.log('socket disconnected: ' + socket.id);
	delete this.socketsById[socket.id];
	this.handleGameMessage(socket, 'disconnect');
}
	
Game.prototype.handleDisconnect = function(socket, user) {
	console.log('user disconnected: nick=' + user.nick);
	this.disconnectedUserScores[user.nick] = user.score;
	delete this.usersById[socket.id];		
	this.users.splice(this.users.indexOf(user), 1);
	this.emitAll('userLeft', { nick: user.nick, color: user.color });
	this.emitUsers();
	if(this.currentPlayer == user.id) {
		this.turnFinished();
	}
	else {
		this.checkForEndOfRound();
	}
};
	
Game.prototype.handleDraw = function (socket, user, line) {
	if(this.currentPlayer == socket.id) {
		this.canvas.push(line);
		this.emitAll('draw', line);
	}
};
	
Game.prototype.handleClearCanvas = function (socket, user) {
	console.log('received clearCanvas');
	if(this.currentPlayer == socket.id) {
		console.log('clearCanvas from current player can be processed');
		this.canvas.splice(0, this.canvas.length);
		this.emitAll('clearCanvas');
	}
};
		
Game.prototype.handleReadyToDraw = function(socket, user) {
	console.log('ready: id=' + socket.id);
	if (!this.currentPlayer) { // new round triggered
		console.log('ready: player ' + socket.id);
		this.startTurn(socket.id);
	} else if (this.currentPlayer == socket.id) { // pass
		// turn off drawing timer
		this.turnFinished(true);
	}
};
	
Game.prototype.turnFinished = function(opt_pass, opt_allGuessed) {
	var self = this;
	
	console.log('turn finished: users.length=' + this.users.length);
	var drawingPlayer, drawingPlayerIndex = 0;
	for(; drawingPlayerIndex < this.users.length; drawingPlayerIndex++)
		if (this.users[drawingPlayerIndex].id == this.currentPlayer) {
			drawingPlayer = this.users[drawingPlayerIndex];
			break;
		}
	console.log('turn finished; player index: ' + drawingPlayerIndex + '; current player ID: ' + this.currentPlayer);
	
	if (this.drawingTimer != null) {
		clearTimeout(this.drawingTimer);
		this.drawingTimer = null;
	}
	if (this.hintIntervalId != null) {
		clearTimeout(this.hintIntervalId);
		this.hintIntervalId = null;
	}
	
	this.currentPlayer = null;
	var nextPlayer = this.users[(drawingPlayerIndex+1) % this.users.length];
	
	this.emitAll('endRound', { 
		word: this.currentWord, isPass: opt_pass, allGuessed: opt_allGuessed, 
		timeUntilNextRound: autoSelectNextPlayer ? timeBetweenRounds : undefined,
		player: drawingPlayer,
		nextPlayer: nextPlayer});

	// allow next user to draw
	if (autoSelectNextPlayer) {
		console.log('Waiting ' + timeBetweenRounds + ' seconds to start next round');
		setTimeout(function() {
				nextPlayer = self.users[(drawingPlayerIndex+1) % self.users.length];
				console.log('drawingPlayerIndex=' + drawingPlayerIndex + ', users.length=' + self.users.length);
				if (nextPlayer == undefined)
					console.log("no user");
				else {
					console.log('turn finished; new player ID: ' + nextPlayer.id);
					self.startTurn(nextPlayer.id);
				}
			}, timeBetweenRounds*1000);
	}
	else {
		this.currentPlayer = null;
		this.emitAll('youCanDraw');
	}
};
