from sys import argv, exit
import os

if len(argv) != 2:
	print "usage: findDuplicateWords <de|en>"
	exit(1)

words = {}
n = 0
lineNo = 0
with file(os.path.join("dictionaries", "%s.txt" % argv[1]), "r") as f:
	for l in f.readlines():		
		lineNo += 1
		l = unicode(l, 'utf-8').strip()
		items = l.split(",")
		if len(items) != 2: continue
		key = items[0].lower()
		if key in words:
			entry = words[key]
			n += 1
			print "duplicate #%d:\n  %5d: %s\n  %5d: %s" % (n, entry[0], entry[1], lineNo, l)
		words[key] = (lineNo, l)

print "%d words, %d duplicates" % (lineNo, n)

