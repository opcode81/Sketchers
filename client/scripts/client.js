/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
 */
function hslToRgb(h, s, l){
    var r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    }else{
        var hue2rgb = function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function randomUserColour() {
	var h = Math.random(), s = 0.6 + Math.random() * 0.2, l = 0.3 + Math.random() * 0.3; 
	console.log("H="+h + ', S='+s + ', L='+l);
	var rgb = hslToRgb(h, s, l);
	var hex = function(n) {
		return (n <= 15 ? "0" : "") + n.toString(16); 
	};
	var rgbString = "#" + hex(rgb[0]) + hex(rgb[1]) + hex(rgb[2]);
	return rgbString;
}

$(document).ready(function() {
	var socket = io.connect('/');
	
	$(window).on('beforeunload', function(){
		console.log('beforeunload: closing socket');
	    socket.close();
	});
	
	var $status = $('#status'),
		$users = $('#users'),
		$chatInput = $('#chatinput'),
		$userNameInput = $('#joinNick'),
		$joinButton = $('#joinButton'),
		$changeColourButton = $('#changeColourButton'),
		$leaveGameButton = $('#leaveGameButton'),
		myNick = null;
	
	var sndEndRound = new Audio('sounds/endRound.ogg'),
		sndStartYourTurn = new Audio("sounds/startYourTurn.ogg"),
		sndGuessedIt = new Audio("sounds/guessedIt.ogg"),
		sndOtherGuessedIt = new Audio("sounds/otherGuessedIt.ogg");
	
	var play = function(snd) {
		snd.currentTime=0;
		snd.play();
	};
	
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
	
	var showLogin = function() {
		$("#initial").hide();
		$("#join").show();
		$('#joinError').hide();
		$("#game").hide();
		$userNameInput.focus();
	};
	
	// connect to server
	socket.on('connect', function () {
		console.log('socket connected');
		showLogin();
	});
	
	var setRandomUserColour = function() {
		var col = randomUserColour();
		$userNameInput.css('color', col);
	};
	$changeColourButton.click(setRandomUserColour);
	setRandomUserColour();
	
	var joinGame = function() {
		myNick = $('#joinNick').val();
		socket.emit('join', { nick: myNick, color: $userNameInput.css('color')});
	};
	$joinButton.click(joinGame);
	$userNameInput.keydown(function(e) {
		if (e.keyCode === 13) {
			joinGame();
		}
	});
	
	socket.on('joinError', function(msg) {
		var $joinError = $('#joinError'), error;
		$joinError.show();
		switch(msg.error) {
		case 'nickTaken': error = 'This user name is already taken.'; break;
		case 'invalidNick': error = 'This is not a valid user name.'; break;
		default: error = 'Error joining game'; break;
		}
		$joinError.text(error);
	});
	
	socket.on('joined', function() {
		$('#join').hide();
		$('#game').show();
		$chatInput.removeProp('disabled');
		clearChat();
		$chatInput.focus();
		$('#game').removeClass('drawing');
		$('#game').removeClass('guessedIt');
	});

	$leaveGameButton.click(function() {
		socket.emit('leave');
	});
	socket.on('youLeft', function() {
		showLogin();
	});
	
	socket.on('users', function (users) {
		$users.text('');
		$table = $('<table class="users"></table>');
		$users.append($table);
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
		$users.append($table);
	});
	
	// ================================================
	//                                 chat section
	// ================================================
	
	var chatcontent = $('#chatcontent');
	
	$chatInput.keydown(function(e) {
		if (e.keyCode === 13) {
			sendMessage();
		}
	});
	
	function sendMessage()	{
		var msg = $chatInput.val();
		if (!msg) {
			return;
		}
		if(msg == 'cls' | msg == 'clear') {
			chatcontent.text('');
			$chatInput.val('');
			return;
		}
		
		socket.emit('message', { text: msg });
		$chatInput.val('');
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
	
	// ================================================
	//                           canvas drawing section
	// ================================================
	
	var Canvas = function($canvas, opt_bindEvents) {
		this.$canvas = $canvas;
		this.context = $canvas[0].getContext('2d');
			
		// disable text selection on the canvas
		$canvas.mousedown(function () {
			return false;
		});
	};
	
	Canvas.prototype.draw = function(line) {
		var context = this.context;
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
	};
	
	Canvas.prototype.clear = function() {
		this.context.clearRect(0, 0, this.$canvas.width(), this.$canvas.height());
	};
	
	var $canvas = $('#canvas'),
		canvas = new Canvas($canvas),
		$penTool = $('#penTool'),
		penToolCanvas = new Canvas($penTool),
		$eraserTool = $('#eraserTool'),
		eraserToolCanvas = new Canvas($eraserTool),
		eraserLineWidth = 20,
		$clearChat = $('#clearchat'),
		selectedcolor = $('#colour'),
		$lineWidth = $('#lineWidth'),
		lastpoint = null,
		painting = false,
		mouseoutWhilePainting = false,
		myturn = false;

	var drawWithEvent = function(e) {
		var newpoint = { x: e.offsetX, y: e.offsetY}, color, lineWidth;
		if ($eraserTool.hasClass('selected')) {
			color = '#fff';
			lineWidth = eraserLineWidth;
		}
		else {
			color = selectedcolor.spectrum('get').toHexString();
			lineWidth = $lineWidth.val();
		}
		line = {from: lastpoint, to: newpoint, color: color, width: lineWidth};
		canvas.draw(line);
		lastpoint = newpoint;
		socket.emit('draw', line);
	};
	
	$canvas.mousedown(function(e) {
		if(myturn) {
			painting = true;
			mouseoutWhilePainting = false;
			lastpoint = null;
			drawWithEvent(e);
		}
	});
	
	$canvas.mousemove(function(e) {
		if(myturn && painting) {
			drawWithEvent(e);
		}
	});
	
	$canvas.mouseout(function(e) {
		if (painting) {
			mouseoutWhilePainting = true;
			painting = false;
		}
	});
	
	$canvas.mouseup(function(e) {
		painting = false;
	});
	
	$canvas.mouseover(function(e) {
		if (mouseoutWhilePainting && e.buttons == 1) { // returning to canvas with button still pressed
			painting = true;
			mouseoutWhilePainting = false;
			lastpoint = null;
			drawWithEvent(e);
		}
	});
	
	socket.on('draw', $.proxy(canvas.draw, canvas));
	
	socket.on('drawCanvas', function(lines) {
		if(lines) {
			for(var i=0; i < lines.length; i++) {		
				canvas.draw(lines[i]);
			}
		}
	});
	
	$('#clearcanvas').click(function() {
		if(myturn) {
			socket.emit('clearCanvas');
		}
	});
	
	socket.on('clearCanvas', function() {
		canvas.clear();
	});
	
	function clearChat() {
		chatcontent.text('');
		$chatInput.val('');
	}
	
	$clearChat.click(function() {
		clearChat();
		$chatInput.focus();
	});

	function selectEraser(selected) {
		if (selected) {
			$eraserTool.addClass('selected');
			$penTool.removeClass('selected');
		}
		else {
			$eraserTool.removeClass('selected');
			$penTool.addClass('selected');
		}
	};
	$eraserTool.attr('width', $eraserTool.innerWidth()); $eraserTool.attr('height', $eraserTool.innerHeight());
	eraserToolCanvas.draw({from: null, to: {x: $eraserTool.width()/2, y: $eraserTool.height()/2}, color: '#fff', width: eraserLineWidth});
	$eraserTool.click(function() {
		selectEraser(!$eraserTool.hasClass('selected'));
	});
	
	$penTool.attr('width', $penTool.innerWidth()); $penTool.attr('height', $penTool.innerHeight());
	$penTool.click(function() {
		selectEraser(false);
	});
	var updatePenToolDisplay = function() {
		var p = {x: $penTool.width()/2, y: $penTool.height()/2};
		var line = { from: null, to: p, color: selectedcolor.spectrum('get').toHexString(), width: $lineWidth.val() };
		penToolCanvas.clear();
		penToolCanvas.draw(line);
	};
	selectedcolor.change(updatePenToolDisplay);
	$lineWidth.change(updatePenToolDisplay);
	
	// ================================================
	//                           game logic section
	// ================================================
	
	var readytodraw = $('#readytodraw'), 
		$timer = $('#timer'),
		$hint = $('#hint'),
		myword = '',
		timeleft = null,
		drawingTimer = null,
		gameState = null;
	
	function setHint(hint) {
		$hint.html(hint.split('').join('&nbsp;'));
	}
	
	readytodraw.click(function() {
		socket.emit('readyToDraw');
	});
	
	socket.on('youDraw', function(word) {
		console.log("youDraw");
		myturn = true;
		myword = word;
		$status.html('Your word is<br><b style="font-size:130%">' + myword[0] + '</b><br>(difficulty: ' + myword[1] + ')');
		selectedcolor.spectrum('set', '#000');
		$lineWidth.val(2);
		updatePenToolDisplay();
		selectEraser(false);
		$('#game').addClass('drawing');
		updateStatusButton();
		play(sndStartYourTurn);
	});
	
	function startTimer(seconds) {
		stopTimer();
		timeleft = seconds;
		drawingTimer = setInterval( timerTick, 1000 );		
		++timeleft;
		timerTick();
		$timer.show();
	}
	
	function stopTimer() {
		if (drawingTimer != null) {
			clearInterval(drawingTimer);
			drawingTimer = null;
		}
		$timer.hide();
	}
	
	socket.on('state', function(msg) {
		console.log('state='+msg.state, msg);
		gameState = msg.state;
		myturn = false;
		if (msg.state == 'drawing') {
			if (!msg.guessedCorrectly)
				$('#game').removeClass('guessedIt');
			else
				$('#game').addClass('guessedIt');
			setHint(msg.hint);
			$status.html(msg.nick + ' is drawing!');
			startTimer(msg.time - msg.timePassed);
			chatcontent.append('<p>&raquo; <span style="color:' + msg.color + '">' + msg.nick + '</span> is drawing!</p>');
			chatScrollDown();
		}
		else if (msg.state == 'intermission') {
			setHint(msg.hint);
			$status.html(msg.nextPlayer.nick + ' is up next!');
			startTimer(msg.time - msg.timePassed);
		}
		else if (msg.state == 'lobby') {
			$('#game').removeClass('guessedIt');
			stopTimer();
			setHint('LOBBY');
			$status.text('Click "Ready to draw!" to start this round.');
			chatcontent.append('<p>When all players are ready, click <strong>Ready to draw!</strong> to start drawing.</p>');
			chatScrollDown();
		}
		updateStatusButton();
	});
	
	socket.on('endRound', function(msg) { 
		var message;
		play(sndEndRound);
		
		// add chat message
		if (msg.isPass) {
			message = formatUser(msg.player) + ' passed';
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
		stopTimer();
		$('#game').removeClass('drawing');
	});
	
	socket.on('hint', function(msg) {
		setHint(msg.hint);
	});
	
	socket.on('youGuessedIt', function(msg) {
		$('#game').addClass('guessedIt');
		play(sndGuessedIt);
	});
	
	var formatUser = function(data) {
		return '<span style="color:' + data.color + '">' + data.nick + '</span>';
	};
	
	socket.on('wordGuessed', function(msg) {
		var message = '<p>&raquo; ' + formatUser(msg) + ' guessed the word after ' + msg.timePassedSecs + ' s.</p>';
		chatcontent.append(message);
		chatScrollDown();
		if (msg.nick != myNick) {
			play(sndOtherGuessedIt);
		}
	});
		
	function timerTick() {
		if(timeleft && timeleft > 0) {
			timeleft--;
			$timer.text(timeleft);
		}
		else {
			stopTimer();
		}
	}
	
	function updateStatusButton() {
		if (gameState == 'drawing') {
			if (myturn) {
				readytodraw.prop('value', 'Pass');
				readytodraw.attr("disabled", false);
			}
			else {
				readytodraw.prop('value', 'Guess!');
				readytodraw.attr("disabled", true);
			}
		}
		else if (gameState == 'intermission') {
			readytodraw.prop('value', 'Wait!');
			readytodraw.attr("disabled", true);
		}
		else if (gameState == 'lobby') {
			readytodraw.prop('value', 'Ready to draw!');
			readytodraw.attr("disabled", false);
		}
	}
});