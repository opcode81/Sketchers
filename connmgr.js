var gm = require("./game.js");

var handlerName = function(messageId) {
	return 'handle' + messageId[0].toUpperCase() + messageId.slice(1);
};

var generateGameCode = function() {
	var vowels = ['A','E','I','O','U'];
	var consonants = ['B', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W'];
	result = '';
	for (var i = 0; i < 6; i++) {
		var sourceArray = vowels;
		if (i%2 == 0) {
			sourceArray = consonants;
		}
		result += sourceArray[Math.floor(Math.random() * sourceArray.length)];
	}
	return result
}

var ConnectionManager = function(dictionary) {
	this.dictionary = dictionary;
	this.gamesByTag = {};
	this.socketsById = {};
	this.gamesBySocketId = {};
};

ConnectionManager.prototype.handleGameMessage = function(socket, messageId, data) {
	if (this.gamesBySocketId[socket.id]) { 
		this.gamesBySocketId[socket.id].handlerProxy(socket, messageId, data); 
	}
};

ConnectionManager.prototype.emit = function(socketId, messageId, data) {
	var socket = this.socketsById[socketId];
	if (!socket) 
		console.trace('unknown socket ' + socketId);
	else
		socket.emit(messageId, data);
};

ConnectionManager.prototype.handleConnection = function(socket) {
	var that = this;
	this.socketsById[socket.id] = socket;
	
	var bindCM = function(messageId) {
		socket.on(messageId, function(data) {
				console.log(messageId);
				var handler = that[handlerName(messageId)];
				handler.call(that, socket, data);
			});
	};
	
	var bindGame = function(messageId) {
		socket.on(messageId, function(data) {
				that.handleGameMessage(socket, messageId, data);
			});
	};
	
	// bind functions
	bindCM('createGame');
	bindCM('join'); 
	bindCM('disconnect');
	bindGame('message');
	bindGame('draw');
	bindGame('readyToDraw');
	bindGame('clearCanvas');
	bindGame('leave');
};

ConnectionManager.prototype.handleCreateGame = function(socket, data) {
	console.log('handleCreateGame');
	var tag = generateGameCode();
	while (this.gamesByTag.hasOwnProperty(tag)) {
		tag = generateGameCode()
	}
	this.gamesByTag[tag] = new gm.Game(this.dictionary, this, tag);
	this.joinGame(socket, data, tag);

};

ConnectionManager.prototype.handleJoin = function(socket, data) {
	'use strict';
	console.log('handleJoin');
	this.joinGame(socket, data, data.tag);
};

ConnectionManager.prototype.joinGame = function(socket, data, tag) {
	console.log(this.gamesByTag);
	tag = tag.toUpperCase();
	var game = this.gamesByTag[tag];
	if (game) {
		this.gamesBySocketId[socket.id] = this.gamesByTag[tag];
		game.handleJoin(socket, data);
	} else {
		socket.emit('joinError', {error:'invalidTag'});
	}
};


ConnectionManager.prototype.handleDisconnect = function(socket) {	
	console.log('socket disconnected: ' + socket.id);
	delete this.socketsById[socket.id];
	this.handleGameMessage(socket, 'disconnect');
};

module.exports = {"ConnectionManager": ConnectionManager};