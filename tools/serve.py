"""Local preview server that tells the browser not to cache, so a rebuild always shows up on reload."""
import functools, http.server, sys
from pathlib import Path


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
handler = functools.partial(NoCache, directory=str(Path(__file__).resolve().parent.parent))
http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
