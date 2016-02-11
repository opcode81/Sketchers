var app = require('http').createServer(handler),
	io = require('socket.io').listen(app, { log: false }),
	fs = require('fs'),
	escape = require('escape-html'),
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

var dictionary;
var connectionManager;
var game;
	
// game mode parametrisation
var roundTime = 120;
var correctGuessEndsTurn = false;
var scoreByRemainingTime = true; // if false, score constant
var autoSelectNextPlayer = true; // if false, players must manually select the next player
var maxHints = 4;
var maxHintFraction = 0.40;
var timeBetweenRounds = 7; // seconds

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
		console.trace('unknown socket ' + socketId);
	else
		socket.emit(messageId, data);
};

var Game = function() {
	this.roundNo = 0;
	this.users = [];
	this.canvas = [];
	this.currentWord = null;
	this.currentUser = null;
	this.drawingTimer = null;
	this.hintIntervalId = null;
	this.state = null;
	this.stateData = null;
	this.usersById = {};
	this.currentHint = null;
	this.numCurrentHintsProvided;
	this.disconnectedUsers = {};
	this.nextPlayerSeqNo = 0;
	this.setState('lobby');
};

Game.prototype.emit = function(userOrUserId, messageId, data) {
	var user = typeof(userOrUserId) != 'object' ? this.usersById[userOrUserId] : userOrUserId;
	if (!user)
		console.trace('emit: unknown user ' + userOrUserId);
	else {
		connectionManager.emit(user.id, messageId, data);
	}
};

Game.prototype.emitAll = function(messageId, data) {
	for(var i = 0; i < this.users.length; ++i) {
		this.emit(this.users[i], messageId, data);
	}
};

Game.prototype.handlerProxy = function(socket, messageId, data) {
	var user = this.usersById[socket.id];
	if (!user) {
		console.log('user not in game: ' + socket.id);
		return;
	}
	var handler = this[handlerName(messageId)];
	handler.call(this, socket, user, data);
};

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
	bindGame('leave');
};

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
	
Game.prototype.startRound = function(user) {
	this.roundNo++;
	console.log("Round #" + this.roundNo);
	
	this.currentUser = user;
	
	this.canvas.splice(0, this.canvas.length);
	this.emitAll('clearCanvas');
	
	var word = dictionary[(this.roundNo-1) % dictionary.length];
	
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
	console.log('startRound: ' + hintsToProvideInTotal + ' hints will be provided');
	var hintsYetToProvide = hintsToProvideInTotal - this.numCurrentHintsProvided;
	var hintInterval = 1000 * (roundTime / (hintsYetToProvide+1));

	// reset user data
	this.users.map(function(u) {
		u.isCurrent = u.id == user.id;
		u.guessedCorrectly = false;
		u.scoreCurrentRound = undefined;
	});

	// send messages
	console.log("next player id: " + this.currentUser.id);
	this.setState('drawing', { color: user.color, nick: user.nick, time:roundTime, hint:this.currentHint });
	this.emit(this.currentUser, 'youDraw', word);
	this.emitUsers();
	
	// set the timers for this round
	this.drawingTimer = setTimeout(proxy(this.endRound, this), roundTime * 1000);
	this.hintIntervalId = setInterval(proxy(this.provideHint, this), hintInterval);
};
	
ConnectionManager.prototype.handleJoin = function(socket, msg) {
	'use strict';
	game.handleJoin(socket, msg);
};

Game.prototype.stateDuration = function() {
	return Math.floor((new Date().getTime() - this.stateStartTime.getTime()) / 1000);
};

Game.prototype.setState = function(state, opt_data) {
	var data = opt_data || {};
	data['state'] = state;
	data['timePassed'] = 0;
	this.state = state;
	this.stateData = data;
	this.stateStartTime = new Date();
	this.emitAll('state', data);
};

Game.prototype.handleJoin = function(socket, msg) {
	var nick = null, color, score = 0, scoreCurrentRound = undefined, guessedCorrectly = false;

	if (msg.nick) {
		nick = escape(msg.nick.trim());
	}
	color = msg.color;

	if (!nick) {
		socket.emit('joinError', {error:'invalidNick'});
		return;
	}
	if(this.users.filter(function (u) { return u.nick == nick; }).length > 0) {
		socket.emit('joinError', {error:'nickTaken'});
		return;
	}
	
	if (this.usersById[socket.id]) {
		console.log('handleJoin: duplicate join attempted by ' + this.usersById[socket.id].nick);
		return;
	}
	
	// add user
	if (this.disconnectedUsers[nick]) { // reconnection: recover user's state 
		var dus = this.disconnectedUsers[nick];
		score = dus.userData.score;
		if (this.roundNo == dus.lastRoundNo) {
			scoreCurrentRound = dus.userData.scoreCurrentRound;
			guessedCorrectly = dus.userData.guessedCorrectly;
		}
		console.log('handleJoin: reconnection with score=' + score + '/' + scoreCurrentRound + ', guessedCorrectly=' + guessedCorrectly);
		delete this.disconnectedUsers[nick];
	}
	var user = { id: socket.id, nick: nick, color: color, score: score, 
			scoreCurrentRound: scoreCurrentRound,
			guessedCorrectly: guessedCorrectly, 
			isCurrent:false, seqNo: this.nextPlayerSeqNo++ };
	this.users.push(user);
	this.usersById[socket.id] = user;
	console.log('handleJoin: player joined: id=' + socket.id + ', nick=' + msg.nick + ', users.length=' + this.users.length);
	
	socket.emit('joined');
	socket.emit('drawCanvas', this.canvas);
	
	// notify about game state
	this.stateData['timePassed'] = this.stateDuration();
	if(this.state != 'lobby') {
		this.stateData['hint'] = this.currentHint;
		this.stateData['guessedCorrectly'] = guessedCorrectly;
	}
	socket.emit('state', this.stateData);
	
	this.emitAll('userJoined', { nick: nick, color: color });
	this.emitUsers();	
};
	
Game.prototype.checkForEndOfRound = function() {
	if (this.currentUser) {
		var doneUsers = this.users.filter(function(u) { return u.guessedCorrectly; });
		var numGuessed = doneUsers.length;
		var allGuessed = numGuessed == this.users.length-1; 
		if ((numGuessed > 0 && correctGuessEndsTurn) || allGuessed) {
			console.log('checkForEndOfRound: ending turn');
			this.endRound(false, allGuessed);
		}
	}
};
	
Game.prototype.handleMessage = function (socket, user, msg) {
	var sanitizedMsg = escape(msg.text.trim());
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
	if (isCorrectGuess && this.currentUser != null && this.currentUser.id != socket.id) {
		// ... and the user did not previously guess the word
		if(user && !user.guessedCorrectly) {
			var timePassed = new Date().getTime() - this.stateStartTime.getTime();
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
			var drawingUser = this.currentUser;
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
};

Game.prototype.disconnectUser = function(user) {
	console.log('disconnecting user ' + user.nick);
	this.disconnectedUsers[user.nick] = {userData: user, lastRoundNo: this.roundNo};
	delete this.usersById[user.id];		
	this.users.splice(this.users.indexOf(user), 1);
	this.emitAll('userLeft', { nick: user.nick, color: user.color });
	this.emitUsers();
	if(this.currentUser && this.currentUser.id == user.id) {
		console.log('disconnect: current player disconnected; ending turn');
		this.endRound();
	}
	else {
		this.checkForEndOfRound();
	}
};
	
Game.prototype.handleDisconnect = function(socket, user) {
	this.disconnectUser(user);
};

Game.prototype.handleLeave = function(socket, user) {
	this.disconnectUser(user);
	socket.emit('youLeft');
};
	
Game.prototype.handleDraw = function (socket, user, line) {
	if(this.currentUser && this.currentUser.id == socket.id) {
		this.canvas.push(line);
		this.emitAll('draw', line);
	}
};
	
Game.prototype.handleClearCanvas = function (socket, user) {
	console.log('received clearCanvas');
	if(this.currentUser && this.currentUser.id == socket.id) {
		console.log('clearCanvas from current player can be processed');
		this.canvas.splice(0, this.canvas.length);
		this.emitAll('clearCanvas');
	}
};
		
Game.prototype.handleReadyToDraw = function(socket, user) {
	console.log('ready: id=' + socket.id);
	if (this.state == 'lobby') {
		console.log('ready: starting turn of ' + socket.id);
		this.startRound(user);
	} else if (this.currentUser && this.currentUser.id == socket.id) { // pass
		console.log('ready: player passed');
		this.endRound(true);
	}
};
	
Game.prototype.endRound = function(opt_pass, opt_allGuessed) {
	var self = this, lastUser = this.currentUser;
	
	var findNextUser = function() {
		var seq = self.users.slice().sort(function(a,b) { return a.seqNo - b.seqNo; } );
		for (var i = 0; i < seq.length; ++i) {
			var u = seq[i];
			if (u.seqNo > lastUser.seqNo) {
				return u;
			}
		}
		return seq[0];
	};
	
	console.log('turn finished: users.length=' + this.users.length);
	
	if (this.drawingTimer != null) {
		clearTimeout(this.drawingTimer);
		this.drawingTimer = null;
	}
	if (this.hintIntervalId != null) {
		clearTimeout(this.hintIntervalId);
		this.hintIntervalId = null;
	}
	
	this.currentUser = null;
	var nextUser = findNextUser();
	
	this.emitAll('endRound', { 
		word: this.currentWord, isPass: opt_pass, allGuessed: opt_allGuessed, 
		player: lastUser});
	
	if (!nextUser) {
		console.log('endRound: no user');
		this.setState('lobby');
		return;
	}

	// allow next user to draw
	if (autoSelectNextPlayer) {
		this.setState('intermission', {time: timeBetweenRounds, nextPlayer: nextUser, hint: this.currentHint}); 
		console.log('endRound: waiting ' + timeBetweenRounds + ' seconds to start next round');
		setTimeout(function() {
				nextUser = findNextUser();
				if (!nextUser) {
					console.log('endRound: no user after intermission');
					self.setState('lobby');
				}
				else {
					console.log('endRound: next user ID: ' + nextUser.id);
					self.startRound(nextUser);
				}
			}, timeBetweenRounds*1000);
	}
	else {
		this.setState('lobby');
	}
};

game = new Game();

connectionManager = new ConnectionManager();
io.sockets.on('connection', function (socket) {
	connectionManager.handleConnection(socket);
});
