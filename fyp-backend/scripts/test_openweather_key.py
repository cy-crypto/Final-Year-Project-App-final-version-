import os
import urllib.request
import urllib.parse
import json

key = os.getenv('OPENWEATHER_API_KEY')
if not key:
    print('NO_KEY')
    raise SystemExit(1)
q = urllib.parse.urlencode({'q':'London','limit':1,'appid':key})
url = 'https://api.openweathermap.org/geo/1.0/direct?'+q
try:
    resp = urllib.request.urlopen(url, timeout=10)
    data = resp.read().decode()
    print('OK', data[:1000])
except Exception as e:
    print('ERR', repr(e))
    raise SystemExit(1)
