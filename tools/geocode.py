import json, sys, urllib.request, urllib.parse
from region import S, N, W, E
names = sys.argv[1:]
out = {}
for n in names:
    u = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + urllib.parse.quote(n)
    d = json.load(urllib.request.urlopen(u, timeout=20))
    hits = []
    for f in d:
        lon, lat = f['geometry']['coordinates']
        if S - 0.01 <= lat <= N + 0.01 and W - 0.01 <= lon <= E + 0.01:
            hits.append((f['properties']['title'], round(lat, 5), round(lon, 5)))
    print(n, hits[:4])
