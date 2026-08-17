import json
import urllib.request

raw = urllib.request.urlopen("http://127.0.0.1:8000/conversation").read().decode("utf-8")
data = json.loads(raw)
print("count", len(data))
for c in data:
    msgs = json.loads(
        urllib.request.urlopen(
            f"http://127.0.0.1:8000/conversation/{c['id']}/messages"
        )
        .read()
        .decode("utf-8")
    )
    print(c["id"], repr(c["title"]), "messages", len(msgs), c.get("updated_at"))

if len(data) > 1:
    data_sorted = sorted(data, key=lambda x: x.get("updated_at") or "", reverse=True)
    keep = data_sorted[0]["id"]
    for c in data_sorted[1:]:
        req = urllib.request.Request(
            f"http://127.0.0.1:8000/conversation/{c['id']}",
            method="DELETE",
        )
        urllib.request.urlopen(req)
        print("deleted", c["id"], repr(c["title"]))
    print("kept", keep)
else:
    print("already single conversation")
