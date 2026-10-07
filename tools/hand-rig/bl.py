"""Send a command to the BlenderMCP addon. Usage: python bl.py <code-file> | python bl.py --shot <png>"""
import socket, json, sys
def send(cmd):
    s = socket.create_connection(("localhost", 9876), timeout=300)
    s.sendall(json.dumps(cmd).encode())
    buf = b""
    while True:
        chunk = s.recv(65536)
        if not chunk: break
        buf += chunk
        try: return json.loads(buf)
        except ValueError: continue
    return json.loads(buf)
if sys.argv[1] == "--shot":
    r = send({"type": "get_viewport_screenshot", "params": {"max_size": int(sys.argv[3]) if len(sys.argv) > 3 else 900, "filepath": sys.argv[2], "format": "png"}})
else:
    r = send({"type": "execute_code", "params": {"code": open(sys.argv[1], encoding="utf-8").read()}})
if r.get("status") == "success":
    res = r["result"]
    print(res.get("result", res) if isinstance(res, dict) else res)
else:
    print("ERROR", r.get("message"))
