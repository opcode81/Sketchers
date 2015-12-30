import sys
import os
import csv
import urllib2
import json

sourceLang = "en"
targetLang = "de"


with open(os.path.join("dictionaries", "%s.txt" % sourceLang)) as infile:
    with open('%s.txt' % targetLang, 'wb') as outfile:
        reader = csv.reader(infile, delimiter=',')
        writer = csv.writer(outfile, delimiter=',')
        for row in reader:
            word = row[0]
            url = 'http://mymemory.translated.net/api/get?q=%s&langpair=%s|%s&de=djain@web.de' % (word, sourceLang, targetLang)
            request = urllib2.Request(url)
            request.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36')
            response = urllib2.urlopen(request)
            data = response.read()
            data = json.loads(data)
            #print data
            try:
                matches = data["matches"]
                gmatch = filter(lambda m: "Google" in m["reference"], matches)
                if len(gmatch) > 0:
                    transword = gmatch[0]["translation"]
                else:
                    transword = data["responseData"]["translatedText"]
                writer.writerow([transword] + row[1:])
                print "%s -> %s" % (word, transword)
            except:
                sys.stderr.write("Could not translate '%s'\n" % word)

        