# Sketchers #

An online multiplayer browser game where players guess words/terms based sketches drawn on a virtual whiteboard (similar to Pictionary, Activity and Montagsmaler) with over 1800 words in English and German. 

## Usage ##

1. Run:

		node server.js

2. Browse to:

		http://localhost:42420/


## Rules of the Game ##

Once all players are connected (3 is the minimum), the player who wants to begin his first round presses the button "Ready to draw!". The clock then starts ticking (countdown timer on the left).

The player is given a word/term and tries to depict it on the whiteboard while the other players try to guess the term. 
The other players enter their guesses into the chat window (not case-sensitive).

Incorrect guesses can be seen by everyone in the chat. Whenever a user guessed the term correctly, he/she is awarded points: as many points are awarded as there
are seconds left on the clock. Furthermore, the player who is currently drawing is also awarded an N-th of the guessing player's points if 
there are N guessing players in total. 

If either all players guessed the term correctly or time has run out, the round ends and the next player continues.   