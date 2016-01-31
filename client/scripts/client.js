$(document).ready(function() {
	var socket = io.connect('/');
	
	var status = $('#status'),
		people = $('#people'),
		chatinput = $('#chatinput'),
		chatnick = $('#chatnick'),
		$joinButton = $('#joinButton');
	
	// initialise colour picker
	$('#colour').spectrum({
		color: '#000',
		showPalette: true,
		palette: [["#000","#444","#666","#999","#ccc","#eee","#f3f3f3","#fff"],
		          ["#f00","#f90","#ff0","#0f0","#0ff","#00f","#90f","#f0f"],
		          ["#f4cccc","#fce5cd","#fff2cc","#d9ead3","#d0e0e3","#cfe2f3","#d9d2e9","#ead1dc"],
		          ["#ea9999","#f9cb9c","#ffe599","#b6d7a8","#a2c4c9","#9fc5e8","#b4a7d6","#d5a6bd"],
		          ["#e06666","#f6b26b","#ffd966","#93c47d","#76a5af","#6fa8dc","#8e7cc3","#c27ba0"],
		          ["#c00","#e69138","#f1c232","#6aa84f","#45818e","#3d85c6","#674ea7","#a64d79"],
		          ["#900","#b45f06","#bf9000","#38761d","#134f5c","#0b5394","#351c75","#741b47"],
		          ["#600","#783f04","#7f6000","#274e13","#0c343d","#073763","#20124d","#4c1130"]]
	});
	
	// connect to server
	socket.on('connect', function () {
		$("#initial").hide();
		$("#join").show();
	});
	
	$joinButton.click(function() {
		socket.emit('join', { nick: $('#joinNick').val() });
	});
	
	socket.on('joined', function() {
		$('#join').hide();
		$('#game').show();
		status.text('Click Ready to draw! button to start drawing');
		chatinput.removeProp('disabled');
		chatnick.removeProp('disabled');
		chatinput.focus();
	});
	
	socket.on('users', function (users) {
		people.text('');
		$table = $('<table class="users"></table>');
		people.append($table);
		for(var i in users)
		{
			var row = '<tr><td class="score">' + users[i].score + '</td><td>';
			if (users[i].guessedCorrectly)
				row += '<img src="star.png">&nbsp;';
			if (users[i].isCurrent)
				row += ' <img src="pencil.png" height=9>';
			row += '</td><td class="username">';
			row += '<div class="ellipsis" style="color:' + users[i].color + '">' + users[i].nick + '</span>';
			row += '</td>';
			if (users[i].scoreCurrentRound !== undefined)
				row += '<td class="scoreRound">+' + users[i].scoreCurrentRound + '</td>';
			row += '</tr>';
			$table.append(row);
		}
		people.append($table);
	});
	
	// ================================================
	//                                 chat section
	// ================================================
	
	var chatcontent = $('#chatcontent'),
		changenickcolor = $('#changenickcolor'),
		myNick = 'guest';
	
	chatinput.keydown(function(e) {
		if (e.keyCode === 13) {
			sendMessage();
		}
	});
	
	function sendMessage()	{
		var msg = chatinput.val();
		if (!msg) {
			return;
		}
		if(msg == 'cls' | msg == 'clear') {
			chatcontent.text('');
			chatinput.val('');
			return;
		}
		if(myNick != chatnick.val()) {
			nickChange();
		}
		
		socket.emit('message', { text: msg });
		chatinput.val('');
	}
	
	chatnick.keydown(function(e)	{
		if (e.keyCode === 13) {
			nickChange();
		}
	});
	
	function nickChange() {
		var msg = chatnick.val();
		if (!msg || msg == myNick) {
			return;
		}
		
		socket.emit('nickChange', { nick: msg });
		myNick = msg;
	}
	
	socket.on('message', function(msg) {
		chatcontent.append('<p><span style="color:' + msg.color + '">' + msg.nick + '</span>: ' + msg.text + '</p>');
		chatScrollDown();
	});
	
	socket.on('userJoined', function (user) {
		chatcontent.append('<p>&raquo; <span style="color:' + user.color + '">' + user.nick + '</span> joined.</p>');
		chatScrollDown();
	});
	
	socket.on('userLeft', function (user) {
		chatcontent.append('<p>&raquo; <span style="color:' + user.color + '">' + user.nick + '</span> left.</p>');
		chatScrollDown();
	});
	
	socket.on('nickChange', function (user) {
		chatcontent.append('<p><span style="color:' + user.color + '">' + user.oldNick + '</span> changed his nick to <span style="color:' + user.color + '">' + user.newNick + '</span>.</p>');
		chatScrollDown();
	});

	function chatScrollDown() {
		chatcontent.scrollTop(chatcontent[0].scrollHeight);
	};
	
	changenickcolor.click(function() {
		socket.emit('changeNickColor');
	});
	
	// ================================================
	//                           canvas drawing section
	// ================================================
	
	var canvas = $('#canvas'),
		clearcanvas = $('#clearcanvas'),
		clearchat = $('#clearchat'),
		selectedcolor = $('#colour'),
		$lineWidth = $('#lineWidth'),
		context = canvas[0].getContext('2d'),
		lastpoint = null,
		painting = false,
		mouseoutWhilePainting = false,
		myturn = false;
	
	socket.on('draw', draw);
	
	function draw(line) {
		context.lineJoin = 'round';
		context.lineWidth = line.width;
		context.strokeStyle = line.color;
		context.beginPath();
		
		if(line.from) {
			context.moveTo(line.from.x, line.from.y);
		}else{
			context.moveTo(line.to.x-1, line.to.y);
		}
		
		context.lineTo(line.to.x, line.to.y);
		context.closePath();
		context.stroke();
	}
	
	// Disable text selection on the canvas
	canvas.mousedown(function () {
		return false;
	});
	
	var drawWithEvent = function(canvas, e) {
		var newpoint = { x: e.pageX - canvas.offsetLeft, y: e.pageY - canvas.offsetTop};
		line = { from: lastpoint, to: newpoint, color: selectedcolor.spectrum('get').toHexString(), width: $lineWidth.val() };
		draw(line);
		lastpoint = newpoint;
		socket.emit('draw', line);
	};
	
	canvas.mousedown(function(e) {
		if(myturn) {
			painting = true;
			mouseoutWhilePainting = false;
			lastpoint = null;
			drawWithEvent(this, e);
		}
	});
	
	canvas.mousemove(function(e) {
		if(myturn && painting) {
			drawWithEvent(this, e);
		}
	});
	
	canvas.mouseout(function(e) {
		if (painting) {
			mouseoutWhilePainting = true;
			painting = false;
		}
	});
	
	canvas.mouseup(function(e) {
		painting = false;
	});
	
	canvas.mouseover(function(e) {
		if (mouseoutWhilePainting && e.buttons == 1) { // returning to canvas with button still pressed
			painting = true;
			mouseoutWhilePainting = false;
			lastpoint = null;
			drawWithEvent(this, e);
		}
	});
	
	socket.on('drawCanvas', function(canvasToDraw) {
		if(canvasToDraw) {
			canvas.width(canvas.width());
			context.lineJoin = 'round';
			
			for(var i=0; i < canvasToDraw.length; i++)
			{		
				var line = canvasToDraw[i];
				context.lineWidth = line.width;
				context.strokeStyle = line.color;
				context.beginPath();
				if(line.from){
					context.moveTo(line.from.x, line.from.y);
				}else{
					context.moveTo(line.to.x-1, line.to.y);
				}
				context.lineTo(line.to.x, line.to.y);
				context.closePath();
				context.stroke();
			}
		}
	});
	
	clearcanvas.click(function() {
		if(myturn) {
			socket.emit('clearCanvas');
		}
	});
	
	socket.on('clearCanvas', function() {
		context.clearRect ( 0 , 0 , canvas.width() , canvas.height() );
	});
	
	clearchat.click(function() {
		chatcontent.text('');
		chatinput.val('');
		chatinput.focus();
	});
	
	// ================================================
	//                           game logic section
	// ================================================
	
	var readytodraw = $('#readytodraw'), 
		$timer = $('#timer'),
		$hint = $('#hint'),
		myword = '',
		timeleft = null,
		drawingTimer = null;
	
	function setHint(hint) {
		$hint.html(hint.split('').join('&nbsp;'));
	}
	
	readytodraw.click(function() {
		socket.emit('readyToDraw');
	});
	
	socket.on('youDraw', function(word) {
		myturn = true;
		console.log("youDraw");
		myword = word;
		status.html('Your word is<br><b style="font-size:130%">' + myword[0] + '</b><br>(difficulty: ' + myword[1] + ')');
		$('#game').addClass('drawing');
	});
	
	socket.on('startRound', function(msg) {
		timeleft = msg.time;
		setHint(msg.hint);
		
		if(!myturn) {
			status.text(msg.nick + ' is drawing right now!');
		}
		else {
			readytodraw.prop('value', 'Pass (' + timeleft + ')');
		}
		console.log("startRound; myTurn=" + myturn);
		
		drawingTimer = setInterval( timerTick, 1000 );		
		++timeleft;
		timerTick();
		
		chatcontent.append('<p>&raquo; <span style="color:' + msg.color + '">' + msg.nick + '</span> is drawing!</p>');
		chatScrollDown();
	});
	
	socket.on('endRound', function(msg) { 
		var message;
		if (msg.isPass) {
			message = 'Player passed';
		}
		else if (msg.allGuessed) {
			message = 'All players guessed correctly';
		}
		else {
			message = 'This round is over';
		}
		chatcontent.append('<p>&raquo; ' + message + '. The word was <strong>' + msg.word + '</strong>.</p>');
		chatScrollDown();
		console.log("endRound");
		if (drawingTimer != null) {
			clearInterval(drawingTimer);
			drawingTimer = null;
		}
		myturn = false;
		$('#game').removeClass('drawing');
		$('#game').removeClass('guessedIt');
		selectedcolor.spectrum('set', '#000');
		$lineWidth.val(2);
	});
	
	socket.on('youCanDraw', function(msg) {
		if(myturn) {
			myturn = false;
			status.text('Click \'Ready to draw!\' to start drawing');
		}
		chatcontent.append('<p>Click <strong>Ready to draw!</strong> button to draw.</p>');
		chatScrollDown();
	});
	
	socket.on('hint', function(msg) {
		setHint(msg.hint);
	});
	
	socket.on('youGuessedIt', function(msg) {
		$('#game').addClass('guessedIt');
	});
	
	var formatUser = function(data) {
		return '<span style="color:' + data.color + '">' + data.nick + '</span>';
	};
	
	socket.on('wordGuessed', function(msg) {
		var message = '<p>&raquo; ' + formatUser(msg) + ' guessed the word after ' + msg.timePassedSecs + ' s.</p>';
		chatcontent.append(message);
		chatScrollDown();
	});
		
	function timerTick() {
		if(timeleft && timeleft > 0) {
			timeleft--;
			if (myturn) {
				readytodraw.prop('value', 'Pass');
				readytodraw.attr("disabled", false);
			}
			else {
				readytodraw.prop('value', 'Guess!');
				readytodraw.attr("disabled", true);
			}
			$timer.text(timeleft);
		} else {
			clearInterval(drawingTimer);
			drawingTimer = null;
			readytodraw.prop('value', 'Ready to draw!');
		}
	}
});