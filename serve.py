#!/usr/bin/env python3
"""Static portal + optional chat share on the LAN. Run: python3 serve.py"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
CHAT = ROOT / "data" / "chat.json"
USERS = ROOT / "data" / "users.json"
PORT = 4173


def load_chat():
    if not CHAT.exists():
        return []
    try:
        data = json.loads(CHAT.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else data.get("messages", [])
    except Exception:
        return []


def save_chat(messages):
    CHAT.parent.mkdir(parents=True, exist_ok=True)
    CHAT.write_text(json.dumps(messages[-800:], ensure_ascii=False), encoding="utf-8")


def load_users():
    if not USERS.exists():
        return []
    try:
        data = json.loads(USERS.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else data.get("users", [])
    except Exception:
        return []


def save_users(users):
    USERS.parent.mkdir(parents=True, exist_ok=True)
    USERS.write_text(json.dumps(users, ensure_ascii=False), encoding="utf-8")


def merge_user(users, incoming):
    email = str(incoming.get("email") or "").lower()
    if not email or not incoming.get("hash") or not incoming.get("salt"):
        return None
    next_list = []
    found = False
    for u in users:
        if str(u.get("email") or "").lower() == email:
            next_list.append(incoming)
            found = True
        else:
            next_list.append(u)
    if not found:
        next_list.append(incoming)
    return next_list


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/chat":
            body = json.dumps(load_chat(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/users":
            body = json.dumps(load_users(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self.send_error(400)
            return
        if path == "/api/chat":
            if not isinstance(payload, dict) or not payload.get("id") or not payload.get("text"):
                self.send_error(400)
                return
            messages = load_chat()
            if not any(m.get("id") == payload["id"] for m in messages):
                messages.append(payload)
                save_chat(messages)
            self.send_response(204)
            self.end_headers()
            return
        if path == "/api/users":
            if not isinstance(payload, dict):
                self.send_error(400)
                return
            merged = merge_user(load_users(), payload)
            if merged is None:
                self.send_error(400)
                return
            save_users(merged)
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)


if __name__ == "__main__":
    print(f"http://127.0.0.1:{PORT}/portal.html?v=38")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
