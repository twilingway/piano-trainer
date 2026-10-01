"""Serves render.html and a folder of PDFs, and saves the pages the page renders.

    python tools/course-import/serve.py <pdf-folder> <png-folder> [port]

Open http://127.0.0.1:5392/render.html?f=n05,t05 (file names without .pdf): every page
of every listed PDF is rendered by pdf.js at 3x and saved as <png-folder>/<name>_p<N>.png.
Python's standard library has no PDF renderer, and the browser already has one.
"""

import base64
import http.server
import os
import re
import sys

TOOL = os.path.dirname(os.path.abspath(__file__))
PDFS = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2])
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 5392
os.makedirs(OUT, exist_ok=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        name = path.split("?", 1)[0].lstrip("/")
        folder = TOOL if name == "render.html" else PDFS
        return os.path.join(folder, os.path.basename(name))

    def do_POST(self):
        name = re.sub(r"[^\w.-]", "", self.path.strip("/"))
        body = self.rfile.read(int(self.headers["Content-Length"]))
        with open(os.path.join(OUT, name), "wb") as file:
            file.write(base64.b64decode(body.split(b",", 1)[1]))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")


print(f"http://127.0.0.1:{PORT}/render.html?f=<pdf names>  ->  {OUT}")
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
