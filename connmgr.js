
var handlerName = function(messageId) {
	return 'handle' + messageId[0].toUpperCase() + messageId.slice(1);
};

var ConnectionManager = function(game) {
	this.game = game;
	this.game.connectionManager = this;
	this.socketsById = {};
};

ConnectionManager.prototype.handleGameMessage = function(socket, messageId, data) {
	this.game.handlerProxy(socket, messageId, data); 
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
	bindCM('join'); 
	bindCM('disconnect');
	bindGame('message');
	bindGame('draw');
	bindGame('readyToDraw');
	bindGame('clearCanvas');
	bindGame('leave');
};

ConnectionManager.prototype.handleJoin = function(socket, msg) {
	'use strict';
	this.game.handleJoin(socket, msg);
};

ConnectionManager.prototype.handleDisconnect = function(socket) {	
	console.log('socket disconnected: ' + socket.id);
	delete this.socketsById[socket.id];
	this.handleGameMessage(socket, 'disconnect');
};

module.exports = {"ConnectionManager": ConnectionManager};