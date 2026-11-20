#!/usr/bin/env python3
"""R.O.U.G.E Meshtastic bridge.

Connects to a Meshtastic radio over USB using the official `meshtastic`
library, keeps received text messages in a file, and offers a tiny local
HTTP API on 127.0.0.1:8096 that the R.O.U.G.E server forwards to:

  GET  /status    radio connection, this node, other nodes heard
  GET  /messages  recent messages (?since=<unix seconds>)
  POST /send      {"text": "...", "to": "!nodeid" (optional), "channel": 0}
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pubsub import pub
import meshtastic
import meshtastic.serial_interface
import meshtastic.util

DATA = os.environ.get("ROUGE_DATA", os.path.expanduser("~/rouge"))
LOG = os.path.join(DATA, "mesh", "messages.jsonl")
os.makedirs(os.path.dirname(LOG), exist_ok=True)

lock = threading.Lock()
iface = None
messages = []
last_error = ""


def load():
    try:
        with open(LOG) as f:
            for line in f:
                try:
                    messages.append(json.loads(line))
                except ValueError:
                    pass
    except FileNotFoundError:
        pass
    del messages[:-1000]


def remember(msg):
    with lock:
        messages.append(msg)
        del messages[:-1000]
        with open(LOG, "a") as f:
            f.write(json.dumps(msg) + "\n")


def node_name(node_id):
    try:
        n = iface.nodes.get(node_id) if iface and iface.nodes else None
        u = (n or {}).get("user", {})
        return u.get("longName") or u.get("shortName") or node_id
    except Exception:
        return node_id


def on_receive(packet, interface):
    d = packet.get("decoded") or {}
    if d.get("portnum") != "TEXT_MESSAGE_APP":
        return
    frm = packet.get("fromId") or str(packet.get("from"))
    remember({
        "t": time.time(), "from": frm, "name": node_name(frm), "to": packet.get("toId"),
        "text": d.get("text", ""), "channel": packet.get("channel", 0),
        "snr": packet.get("rxSnr"), "mine": False,
    })


def connector():
    """Connect when a radio is plugged in; reconnect if it is unplugged."""
    global iface, last_error
    while True:
        if iface is None:
            ports = meshtastic.util.findPorts(True)
            if ports:
                try:
                    iface = meshtastic.serial_interface.SerialInterface(devPath=ports[0])
                    last_error = ""
                except Exception as e:  # radio busy or still booting
                    iface, last_error = None, str(e)
            else:
                last_error = "No Meshtastic radio found. Plug it in with a data USB cable."
        else:
            try:
                if not iface.isConnected.is_set():
                    raise RuntimeError("disconnected")
            except Exception:
                try:
                    iface.close()
                except Exception:
                    pass
                iface = None
        time.sleep(10)


def on_lost(interface, topic=pub.AUTO_TOPIC):
    global iface
    iface = None


def status():
    out = {"bridge": True, "connected": iface is not None, "error": last_error, "me": None, "nodes": []}
    if iface is None:
        return out
    try:
        me = iface.getMyNodeInfo() or {}
        u = me.get("user", {})
        out["me"] = {"id": u.get("id"), "name": u.get("longName"), "short": u.get("shortName"),
                     "battery": (me.get("deviceMetrics") or {}).get("batteryLevel")}
        for nid, n in (iface.nodes or {}).items():
            if u.get("id") == nid:
                continue
            nu, pos = n.get("user", {}), n.get("position") or {}
            out["nodes"].append({
                "id": nid, "name": nu.get("longName") or nid, "short": nu.get("shortName"),
                "lastHeard": n.get("lastHeard"), "snr": n.get("snr"), "hops": n.get("hopsAway"),
                "lat": pos.get("latitude"), "lon": pos.get("longitude"),
                "battery": (n.get("deviceMetrics") or {}).get("batteryLevel"),
            })
        out["nodes"].sort(key=lambda n: -(n["lastHeard"] or 0))
    except Exception as e:
        out["error"] = str(e)
    return out


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/status"):
            return self.reply(200, status())
        if self.path.startswith("/messages"):
            since = 0.0
            if "since=" in self.path:
                try:
                    since = float(self.path.split("since=")[1].split("&")[0])
                except ValueError:
                    pass
            with lock:
                return self.reply(200, [m for m in messages if m["t"] > since][-300:])
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/send"):
            return self.reply(404, {"error": "not found"})
        try:
            n = min(int(self.headers.get("Content-Length", 0)), 16384)
            body = json.loads(self.rfile.read(n) or b"{}")
            text = str(body.get("text", "")).strip()
            if not text or len(text.encode()) > 200:
                return self.reply(400, {"error": "Message must be 1 to 200 bytes (radio limit)."})
            if iface is None:
                return self.reply(503, {"error": "No radio connected."})
            to = body.get("to") or "^all"
            ch = int(body.get("channel", 0))
            iface.sendText(text, destinationId=to, channelIndex=ch)
            me = (iface.getMyNodeInfo() or {}).get("user", {})
            msg = {"t": time.time(), "from": me.get("id"), "name": me.get("longName") or "Me",
                   "to": None if to == "^all" else to, "text": text, "channel": ch, "mine": True}
            remember(msg)
            self.reply(200, msg)
        except Exception as e:
            self.reply(500, {"error": str(e)})


def main():
    load()
    pub.subscribe(on_receive, "meshtastic.receive")
    pub.subscribe(on_lost, "meshtastic.connection.lost")
    threading.Thread(target=connector, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", 8096), Handler)
    print("rouge-mesh bridge on 127.0.0.1:8096", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    sys.exit(main())
