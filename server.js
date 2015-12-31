var app = require('http').createServer(handler),
	io = require('socket.io').listen(app, { log: false }),
	fs = require('fs'),
	sanitizer = require('sanitizer'),
	port = process.env.port || 42420;

app.listen(port);
console.log('>>> Sketchers started on port ' + port + ' >>>');

// ================================================
//                           server routing section
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
//                                app logic section
// ================================================

var users = [], canvas = [];
var dictionary, currentWord, currentPlayer; 
var drawingTimer = null, hintIntervalId = null;
var playerUID = 1;
var roundStartTime;
var playerIndicesGuessedCorrectly;
var socketsById = {}, usersById = {};
var currentHint, numCurrentHintsProvided;

// game mode
var roundTime = 120, roundNo = 0;
var correctGuessEndsTurn = false;
var scoreByRemainingTime = true; // if false, score constant
var autoSelectNextPlayer = true; // if true, players must manually select the next player
var maxHints = 4;
var maxHintFraction = 0.40;

// load dictionary.txt into memory
fs.readFile(__dirname + '/dictionaries/de.txt', function (err, data) {
	dictionary = data.toString('utf-8').split('\r\n');
});

io.sockets.on('connection', function (socket) {
	var myNick = 'Player' + playerUID++,
		myColor = rndColor();
		myScore = 0;
	
	var user = { id: socket.id, nick: myNick, color: myColor, score: myScore, guessedCorrectly:false, isCurrent:false };
	users.push(user);
	usersById[socket.id] = user;
	socketsById[socket.id] = socket;
	io.sockets.emit('userJoined', { nick: myNick, color: myColor });
	io.sockets.emit('users', users);
	socket.emit('drawCanvas', canvas);
	
	// notify if someone is drawing
	if(currentPlayer) {
		for(var i = 0; i<users.length; i++) {
			if(users[i].id == currentPlayer) {
				var timePassedSecs = Math.floor((new Date().getTime() - roundStartTime) / 1000);
				socket.emit('startRound', { color: users[i].color, nick: users[i].nick, time: roundTime-timePassedSecs, hint:currentHint });
				break;
			}
		}
	}
	
	function getRandomInt(min, max) {
	    return Math.floor(Math.random() * (max - min + 1)) + min;
	}
	
	function addHint() {
		var indices = [];
		for (var i = 0; i < currentHint.length; ++i)
			if (currentHint[i] == '_')
				indices.push(i);
		if (indices.length > 0) {
			var idx = indices[getRandomInt(0, indices.length-1)];
			currentHint = currentHint.substr(0, idx) + currentWord[idx] + currentHint.substr(idx+1);
			++numCurrentHintsProvided;
		}
	}
	
	function provideHint() {
		addHint();
		io.sockets.emit('hint', {hint: currentHint});
	}
	
	function startTurn(playerId) {
		roundNo++;
		console.log("Round #" + roundNo);
		
		currentPlayer = playerId;
		var user = usersById[playerId];
		
		canvas.splice(0, canvas.length);
		io.sockets.emit('clearCanvas');
		
		var randomLine = Math.floor(Math.random() * dictionary.length),
			line = dictionary[randomLine],
			word = line.split(',');
		
		currentWord = word[0];

		// initialise hint
		var hint = '';
		var nonHint = '- ';
		for (var i = 0; i < currentWord.length; ++i) {
			if (nonHint.indexOf(currentWord[i]) === -1) {
				hint += '_';
			}
			else {
				hint += currentWord[i];
			}
		}
		numCurrentHintsProvided = 0;
		currentHint = hint;
		
		// add one hint from the start
		//addHint();
		
		// determine the maximum number of additional hints to provide
		var maxHintsForWord = Math.floor(currentWord.length * maxHintFraction);
		var hintsToProvideInTotal = Math.min(maxHints, maxHintsForWord);
		var hintsYetToProvide = hintsToProvideInTotal - numCurrentHintsProvided;
		var hintInterval = 1000 * (roundTime / (hintsYetToProvide+1));

		// reset user data
		users.map(function(u) {
			u.isCurrent = u.id == user.id;
			u.guessedCorrectly = false;
		});
		
		// send messages
		socketsById[playerId].emit('youDraw', word);
		io.sockets.emit('startRound', { color: user.color, nick: user.nick, time:roundTime, hint:currentHint });
		io.sockets.emit('users', users);
		
		playerIndicesGuessedCorrectly = [];
		
		// set the timers for this round
		drawingTimer = setTimeout(turnFinished, roundTime * 1000);
		hintIntervalId = setInterval(provideHint, hintInterval);
		roundStartTime = new Date().getTime();
	}
	
	socket.on('message', function (msg) {
		var sanitizedMsg = sanitizer.sanitize(msg.text);
		if(sanitizedMsg != msg.text) {
			console.log('(!) Possible attack detected from ' + socket.id + ' (' + myNick + ') : ' + msg.text);
		}
		if(!sanitizedMsg || sanitizedMsg.length>256) {
			return;
		}
		
		var isCorrectGuess = sanitizedMsg.toLowerCase().trim() == currentWord.toLowerCase();
		
		if (!isCorrectGuess)
			io.sockets.emit('message', { text: sanitizedMsg, color: myColor, nick: myNick });
		
		// check if current word was guessed (and not previously guessed by the same player)
		var previouslyGuessed = playerIndicesGuessedCorrectly.indexOf(socket.id) >= 0;
		if(currentPlayer != null && currentPlayer != socket.id && isCorrectGuess && !previouslyGuessed) {
			playerIndicesGuessedCorrectly.push(socket.id);
			
			var timePassed = new Date().getTime() - roundStartTime;
			var timePassedSecs = Math.floor(timePassed / 1000);
			var timeRemainingSecs = roundTime - timePassedSecs;
			var text = correctGuessEndsTurn ? currentWord : timeRemainingSecs + "s";
			io.sockets.emit('wordGuessed', { text: text, color: myColor, nick: myNick });
			socket.emit('youGuessedIt');
			
			// add scores to guesser and drawer
			for(var i = 0; i<users.length; i++) {
				if(users[i].id == socket.id) { // guessing player
					if (scoreByRemainingTime) 
						users[i].score += timeRemainingSecs;
					else
						users[i].score += 10;
					users[i].guessedCorrectly = true;
				}
				else if (users[i].id == currentPlayer) { // drawing player
					drawingPlayerIndex = i;
					if (scoreByRemainingTime)
						users[i].score += Math.floor(timeRemainingSecs / (users.length-1));
					else
						users[i].score += 10;
					users[i].guessedCorrectly = true;
				}
			}
			
			// comunicate new scores
			sortUsersByScore();
			io.sockets.emit('users', users);
			
			var allGuessed = playerIndicesGuessedCorrectly.length == users.length-1;
			
			if (correctGuessEndsTurn || allGuessed) {
				turnFinished();
			}
		}
	});
	
	socket.on('nickChange', function (user) {
		var sanitizedNick = sanitizer.sanitize(user.nick);
		if(sanitizedNick != user.nick) {
			console.log('(!) Possible attack detected from ' + socket.id + ' (' + myNick + ') : ' + user.nick);
		}
		if(!sanitizedNick || myNick == sanitizedNick || sanitizedNick.length>32 ) {
			return;
		}
		
		io.sockets.emit('nickChange', { newNick: sanitizedNick, oldNick: myNick, color: myColor });
		myNick = sanitizedNick;
		
		for(var i = 0; i<users.length; i++) {
			if(users[i].id == socket.id) {
				users[i].nick = myNick;
				break;
			}
		}
		
		io.sockets.emit('users', users);
	});
	
	socket.on('disconnect', function () {
		io.sockets.emit('userLeft', { nick: myNick, color: myColor });
		for(var i = 0; i<users.length; i++) {
			if(users[i].id == socket.id) {
				users.splice(i,1);
				socketsById[socket.id] = undefined;
				break;
			}
		}
		
		io.sockets.emit('users', users);
		
		if(currentPlayer == socket.id) {
			// turn off drawing timer
			clearTimeout(drawingTimer);
			clearInterval(hintIntervalId);
			turnFinished();
		}
	});
	
	socket.on('draw', function (line) {
		if(currentPlayer == socket.id) {
			canvas.push(line);
			socket.broadcast.emit('draw', line);
		}
	});
	
	socket.on('clearCanvas', function () {
		if(currentPlayer == socket.id) {
			canvas.splice(0, canvas.length);
			io.sockets.emit('clearCanvas');
		}
	});
	
	socket.on('changeNickColor', function() {
		myColor = rndColor();
		
		for(var i = 0; i<users.length; i++) {
			if(users[i].id == socket.id) {
				users[i].color = myColor;
				break;
			}
		}
		
		io.sockets.emit('users', users);
	});
	
	function rndColor() {
		var color = '#'+(0x1000000+(Math.random())*0xffffff).toString(16).substr(1,6);
		return color;
	};
	
	function sortUsersByScore() {
		users.sort(function(a,b) { return parseFloat(b.score) - parseFloat(a.score); } );
	}
	
	// =================
	// pictionary logic section
	// =================
	
	socket.on('readyToDraw', function () {
		if (!currentPlayer) { // new round triggered
			startTurn(socket.id);
		} else if (currentPlayer == socket.id) { // pass
			// turn off drawing timer
			turnFinished();
		}
	});
	
	function turnFinished() {
		var drawingPlayerIndex = 0;
		for(; drawingPlayerIndex < users.length; drawingPlayerIndex++)
			if (users[drawingPlayerIndex].id == currentPlayer) 
				break;
		console.log('turn finished; player index: ' + drawingPlayerIndex + '; current player ID: ' + currentPlayer);
		
		if (drawingTimer != null) {
			clearTimeout(drawingTimer);
			drawingTimer = null;
		}
		if (hintIntervalId != null) {
			clearTimeout(hintIntervalId);
			hintIntervalId = null;
		}
		
		io.sockets.emit('endRound', { word: currentWord });

		currentPlayer = null;
	
		// allow next user to draw
		if (autoSelectNextPlayer) {
			var user = users[(drawingPlayerIndex+1) % users.length];
			if (user == undefined)
				console.log("no user");
			else {
				console.log('turn finished; new player ID: ' + user.id);
				startTurn(user.id);
			}
		}
		else {
			currentPlayer = null;
			io.sockets.emit('youCanDraw');
		}
	}
});