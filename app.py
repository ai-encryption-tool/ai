import argparse
import mimetypes
import os
import subprocess
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

import uvicorn


def serve_built_dashboard(root: Path, host: str, port: int, backend_url: str) -> None:
    dist = root / "frontend" / "dist"
    if not dist.exists():
        raise SystemExit("frontend/dist does not exist. Build the frontend first with: cd frontend; npm run build")

    class DashboardHandler(SimpleHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:
            return

        def do_GET(self) -> None:
            request_path = unquote(self.path.split("?", 1)[0]).lstrip("/")
            file_path = (dist / request_path).resolve() if request_path else dist / "index.html"
            if not str(file_path).startswith(str(dist.resolve())) or not file_path.exists() or file_path.is_dir():
                file_path = dist / "index.html"

            content = file_path.read_bytes()
            if file_path.suffix in {".html", ".js"}:
                content = content.replace(b"http://localhost:8000", backend_url.encode("utf-8"))

            content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    server = ThreadingHTTPServer((host, port), DashboardHandler)
    print(f"Dashboard: http://localhost:{port}")
    print(f"Backend:   {backend_url}/health")
    print("Press Ctrl+C to stop the dashboard.")
    server.serve_forever()


def run_dashboard(root: Path, api_host: str, api_port: int, dashboard_host: str, dashboard_port: int) -> None:
    python = root / ".venv" / "Scripts" / "python.exe"
    if not python.exists():
        python = Path(sys.executable)

    env = os.environ.copy()
    backend_url = f"http://localhost:{api_port}"

    backend = subprocess.Popen(
        [str(python), str(root / "app.py"), "--host", api_host, "--port", str(api_port)],
        cwd=root,
    )
    try:
        time.sleep(2)
        print("AI Memory Vault is starting.")
        serve_built_dashboard(root, dashboard_host, dashboard_port, backend_url)
    except KeyboardInterrupt:
        print("\nStopping AI Memory Vault...")
    finally:
        if backend.poll() is None:
            backend.terminate()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run AI Memory Vault.")
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    parser.add_argument("--dashboard", action="store_true", help="Start backend and web dashboard together.")
    parser.add_argument("--dashboard-host", default=os.getenv("DASHBOARD_HOST", "127.0.0.1"))
    parser.add_argument("--dashboard-port", type=int, default=int(os.getenv("DASHBOARD_PORT", "8081")))
    parser.add_argument("--reload", action="store_true", help="Restart server when backend files change.")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    if args.dashboard:
        run_dashboard(root, args.host, args.port, args.dashboard_host, args.dashboard_port)
        return

    backend = root / "backend"
    sys.path.insert(0, str(backend))

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        app_dir=str(backend),
    )


if __name__ == "__main__":
    main()
