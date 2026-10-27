"""Serve runtime assets locally with predictable MIME types on Windows."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit
from package_toy import ROOT, FILES


class PreviewHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
    }

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/":
            self.path = "/index.html"
        elif path not in {"/" + name for name in FILES}:
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(
        ("127.0.0.1", 8080), partial(PreviewHandler, directory=str(ROOT))
    )
    print("Preview: http://127.0.0.1:8080/index.html", flush=True)
    server.serve_forever()
