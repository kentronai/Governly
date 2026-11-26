#!/usr/bin/env python3
"""Governly AI environment scan.

Finds AI applications, IDE extensions, local model runtimes, AI CLI tools and MCP
server configs on this machine and
uploads the result to the organization's Shadow AI page in Governly.

    python3 shadow-ai-scan.py --url https://app.example.com --token <scan token>
    python3 shadow-ai-scan.py --dry-run        # print the payload, upload nothing
    python3 shadow-ai-scan.py --serve          # let the Scan button in Governly scan this PC
    python3 shadow-ai-scan.py --install        # same, kept running in the background at login

--serve listens on 127.0.0.1 only and answers scans only for the Governly
origins it trusts, so the browser's Scan button can scan this machine. The
browser asks the user to allow local network access the first time.

Standard library only (Python >= 3.9). Read-only: it stats, reads and globs a
fixed list of config paths and looks up binaries on PATH. Secret values never
leave the machine: env values are dropped (only their names are kept) and
token-shaped strings in commands, args and URLs are redacted before upload.
"""

import argparse
import getpass
import glob as globmod
import json
import os
import platform as platform_mod
import re
import shlex
import subprocess
import shutil
import socket
import sys
import urllib.error
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

try:
    import tomllib  # Python 3.11+
except ImportError:  # ponytail: older Pythons skip Codex's TOML config, no extra deps
    tomllib = None

MAX_READ_BYTES = 2 * 1024 * 1024
PLATFORM = {"Darwin": "macOS", "Linux": "Linux", "Windows": "Windows"}.get(
    platform_mod.system(), platform_mod.system())
HOME = Path.home()

# --- secret redaction -------------------------------------------------------

REDACTED = "[REDACTED]"
SECRET_PATTERNS = [re.compile(p) for p in (
    r"sk-ant-[A-Za-z0-9_-]{8,}",
    r"sk-[A-Za-z0-9_-]{16,}",
    r"ghp_[A-Za-z0-9]{20,}",
    r"github_pat_[A-Za-z0-9_]{20,}",
    r"gho_[A-Za-z0-9]{20,}",
    r"xox[abprs]-[A-Za-z0-9-]{8,}",
    r"AKIA[A-Z0-9]{16}",
    r"eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}",
)]
URL_CREDS = re.compile(r"(://)[^/\s:@]+:[^@/\s]+@")
QUERY_SECRET = re.compile(
    r"([?&](?:token|key|apikey|api_key|access_token|secret)=)[^&\s\"']+", re.I)
# `--api-key sk-...` / `--token=abc`: the value after a secret-named flag.
FLAG_SECRET = re.compile(r"^--?[\w-]*(?:key|token|secret|password)[\w-]*$", re.I)


def redact(value):
    if not isinstance(value, str):
        return value
    for pattern in SECRET_PATTERNS:
        value = pattern.sub(REDACTED, value)
    value = URL_CREDS.sub(r"\g<1>" + REDACTED + "@", value)
    return QUERY_SECRET.sub(r"\g<1>" + REDACTED, value)


def redact_args(args):
    out, hide_next = [], False
    for arg in args:
        if hide_next:
            out.append(REDACTED)
            hide_next = False
            continue
        flag, eq, _ = arg.partition("=")
        if FLAG_SECRET.match(flag):
            if eq:
                out.append(flag + "=" + REDACTED)
            else:
                out.append(arg)
                hide_next = True
            continue
        out.append(redact(arg))
    return out

# --- file helpers -----------------------------------------------------------


def expand(template):
    return HOME / template[2:] if template.startswith("~/") else Path(template)


def read_text(template):
    """(path, content, error); content None when the file is absent."""
    p = expand(template)
    if not p.is_file():
        return str(p), None, None
    try:
        if p.stat().st_size > MAX_READ_BYTES:
            return str(p), None, "file exceeds size cap"
        return str(p), p.read_text(encoding="utf-8", errors="replace"), None
    except OSError as exc:
        return str(p), None, str(exc)


TRAILING_COMMAS = re.compile(r",(\s*[}\]])")


def strip_comments(text):
    out, i, n, in_string = [], 0, len(text), False
    while i < n:
        c = text[i]
        if in_string:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == '"':
                in_string = False
            i += 1
        elif c == '"':
            in_string = True
            out.append(c)
            i += 1
        elif text.startswith("//", i):
            while i < n and text[i] != "\n":
                i += 1
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


def parse_jsonc(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return json.loads(TRAILING_COMMAS.sub(r"\1", strip_comments(text)))

# --- MCP servers ------------------------------------------------------------


def same(*paths):
    return {"macOS": paths, "Linux": paths, "Windows": paths}


# (source application, platform -> path templates, format, extractor)
MCP_CONFIG_LOCATIONS = [
    ("Claude Desktop",
     {"macOS": ("~/Library/Application Support/Claude/claude_desktop_config.json",),
      "Linux": ("~/.config/Claude/claude_desktop_config.json",),
      "Windows": ("~/AppData/Roaming/Claude/claude_desktop_config.json",)},
     "json", "mcp_servers"),
    ("Claude Code", same("~/.claude.json"), "json", "claude_code"),
    ("Cursor", same("~/.cursor/mcp.json"), "json", "mcp_servers"),
    ("Windsurf", same("~/.codeium/windsurf/mcp_config.json"), "json", "mcp_servers"),
    ("VS Code",
     {"macOS": ("~/Library/Application Support/Code/User/mcp.json",),
      "Linux": ("~/.config/Code/User/mcp.json",),
      "Windows": ("~/AppData/Roaming/Code/User/mcp.json",)},
     "json", "servers"),
    ("VS Code",
     {"macOS": ("~/Library/Application Support/Code/User/settings.json",),
      "Linux": ("~/.config/Code/User/settings.json",),
      "Windows": ("~/AppData/Roaming/Code/User/settings.json",)},
     "json", "settings_mcp"),
    ("Gemini CLI", same("~/.gemini/settings.json"), "json", "mcp_servers"),
    ("Codex CLI", same("~/.codex/config.toml"), "toml", "codex"),
    ("Continue", same("~/.continue/config.json"), "json", "continue"),
    ("Zed",
     {"macOS": ("~/.config/zed/settings.json",),
      "Linux": ("~/.config/zed/settings.json",),
      "Windows": ("~/AppData/Roaming/Zed/settings.json",)},
     "json", "zed"),
]


def infer_transport(cfg):
    explicit = str(cfg.get("type") or cfg.get("transport") or "").lower()
    if explicit in ("stdio", "sse"):
        return explicit
    if explicit in ("http", "streamable-http", "streamable_http", "streamablehttp"):
        return "http"
    if cfg.get("command"):
        return "stdio"
    if cfg.get("url") or cfg.get("serverUrl"):
        return "http"
    return "unknown"


def extract(extractor, doc):
    """[(source suffix, {name: cfg})] for one parsed config file."""
    if extractor == "mcp_servers":
        return [(None, doc.get("mcpServers") or {})]
    if extractor == "servers":
        return [(None, doc.get("servers") or {})]
    if extractor == "settings_mcp":
        return [(None, (doc.get("mcp") or {}).get("servers") or {})]
    if extractor == "zed":
        return [(None, doc.get("context_servers") or {})]
    if extractor == "codex":
        return [(None, doc.get("mcp_servers") or {})]
    if extractor == "continue":
        servers = (doc.get("mcpServers")
                   or (doc.get("experimental") or {}).get("modelContextProtocolServers")
                   or {})
        if isinstance(servers, list):
            servers = {str(s.get("name", "server-%d" % i)): s
                       for i, s in enumerate(servers) if isinstance(s, dict)}
        return [(None, servers)]
    if extractor == "claude_code":
        results = [(None, doc.get("mcpServers") or {})]
        for proj_path, proj in (doc.get("projects") or {}).items():
            if isinstance(proj, dict) and proj.get("mcpServers"):
                base = os.path.basename(str(proj_path).rstrip("/")) or str(proj_path)
                results.append(("project: " + base, proj["mcpServers"]))
        return results
    return []


def normalize_server(name, cfg, source, config_path):
    env = cfg.get("env") if isinstance(cfg.get("env"), dict) else {}
    command = cfg.get("command")
    url = cfg.get("url") or cfg.get("serverUrl")
    return {
        "name": name,
        "source_application": source,
        "transport": infer_transport(cfg),
        "command": redact(str(command)) if command else None,
        "args": redact_args([str(a) for a in (cfg.get("args") or [])]),
        "url": redact(str(url)) if url else None,
        # Names only: the values are exactly the secrets we must not upload.
        "env_var_names": sorted(str(k) for k in env),
        "config_path": config_path,
        "status": "disabled" if cfg.get("disabled") is True else "configured",
    }


def discover_mcp_servers():
    servers, errors = [], []
    for source_app, paths, fmt, extractor in MCP_CONFIG_LOCATIONS:
        for template in paths.get(PLATFORM, ()):
            real_path, content, error = read_text(template)
            if error:
                errors.append("%s: %s: %s" % (source_app, real_path, error))
                continue
            if content is None:
                continue
            if fmt == "toml" and tomllib is None:
                errors.append("%s: %s: needs Python 3.11+ to parse TOML"
                              % (source_app, real_path))
                continue
            try:
                doc = tomllib.loads(content) if fmt == "toml" else parse_jsonc(content)
            except Exception as exc:
                errors.append("%s: could not parse %s: %s" % (source_app, real_path, exc))
                continue
            if not isinstance(doc, dict):
                continue
            for suffix, server_map in extract(extractor, doc):
                if not isinstance(server_map, dict):
                    continue
                source = "%s (%s)" % (source_app, suffix) if suffix else source_app
                for name, cfg in server_map.items():
                    if isinstance(cfg, dict):
                        servers.append(normalize_server(str(name), cfg, source, real_path))
    return servers, errors

# --- AI applications --------------------------------------------------------

DETECTION_LABEL = {"app_bundle": "Application", "config_path": "Config",
                   "binary": "PATH"}


def mac_linux(mac, linux):
    return {"macOS": mac, "Linux": linux, "Windows": ()}


# (name, category, platform -> ((probe kind, target), ...))
APPLICATION_REGISTRY = [
    ("Claude Desktop", "Desktop", {
        "macOS": (("app_bundle", "Claude.app"),
                  ("config_path", "~/Library/Application Support/Claude")),
        "Linux": (("config_path", "~/.config/Claude"),),
        "Windows": (("config_path", "~/AppData/Roaming/Claude"),)}),
    ("Claude Code", "CLI", same(("binary", "claude"), ("config_path", "~/.claude.json"))),
    ("Cursor", "IDE", {
        "macOS": (("app_bundle", "Cursor.app"), ("config_path", "~/.cursor")),
        "Linux": (("binary", "cursor"), ("config_path", "~/.cursor")),
        "Windows": (("config_path", "~/.cursor"),)}),
    ("Windsurf", "IDE", {
        "macOS": (("app_bundle", "Windsurf.app"), ("config_path", "~/.codeium/windsurf")),
        "Linux": (("config_path", "~/.codeium/windsurf"),),
        "Windows": (("config_path", "~/.codeium/windsurf"),)}),
    ("VS Code", "IDE", {
        "macOS": (("app_bundle", "Visual Studio Code.app"),
                  ("config_path", "~/Library/Application Support/Code")),
        "Linux": (("binary", "code"), ("config_path", "~/.config/Code")),
        "Windows": (("config_path", "~/AppData/Roaming/Code"),)}),
    ("ChatGPT", "Desktop", {
        "macOS": (("app_bundle", "ChatGPT.app"),
                  ("config_path", "~/Library/Application Support/com.openai.chat")),
        "Linux": (), "Windows": ()}),
    ("Gemini CLI", "CLI", mac_linux(
        (("binary", "gemini"), ("config_path", "~/.gemini")),
        (("binary", "gemini"), ("config_path", "~/.gemini")))),
    ("Ollama", "Local AI", {
        "macOS": (("app_bundle", "Ollama.app"), ("binary", "ollama"),
                  ("config_path", "~/.ollama")),
        "Linux": (("binary", "ollama"), ("config_path", "~/.ollama")),
        "Windows": (("config_path", "~/.ollama"),)}),
    ("LM Studio", "Local AI", {
        "macOS": (("app_bundle", "LM Studio.app"), ("config_path", "~/.lmstudio")),
        "Linux": (("config_path", "~/.lmstudio"),),
        "Windows": (("config_path", "~/.lmstudio"),)}),
    ("Codex CLI", "CLI", mac_linux(
        (("binary", "codex"), ("config_path", "~/.codex")),
        (("binary", "codex"), ("config_path", "~/.codex")))),
    ("Zed", "IDE", {
        "macOS": (("app_bundle", "Zed.app"), ("config_path", "~/.config/zed")),
        "Linux": (("config_path", "~/.config/zed"),),
        "Windows": ()}),
    ("Continue", "Extension", mac_linux(
        (("config_path", "~/.continue"),), (("config_path", "~/.continue"),))),
    ("Jan", "Local AI", {
        "macOS": (("app_bundle", "Jan.app"), ("config_path", "~/Library/Application Support/Jan")),
        "Linux": (("config_path", "~/.config/Jan"), ("config_path", "~/jan")),
        "Windows": (("config_path", "~/AppData/Roaming/Jan"),)}),
    ("GPT4All", "Local AI", {
        "macOS": (("app_bundle", "GPT4All.app"),
                  ("config_path", "~/Library/Application Support/nomic.ai/GPT4All")),
        "Linux": (("config_path", "~/.local/share/nomic.ai/GPT4All"),),
        "Windows": (("config_path", "~/AppData/Local/nomic.ai/GPT4All"),)}),
    ("Msty", "Local AI", {
        "macOS": (("app_bundle", "Msty.app"),), "Linux": (), "Windows": ()}),
    ("AnythingLLM", "Local AI", {
        "macOS": (("app_bundle", "AnythingLLM.app"),),
        "Linux": (("config_path", "~/.config/anythingllm-desktop"),),
        "Windows": (("config_path", "~/AppData/Roaming/anythingllm-desktop"),)}),
    ("llama.cpp", "Local AI", same(("binary", "llama-server"), ("binary", "llama-cli"))),
    ("LocalAI", "Local AI", same(("binary", "local-ai"),)),
    ("vLLM", "Local AI", same(("binary", "vllm"),)),
]

# Local runtimes that serve an HTTP API: (name, port, models path, json key, name key).
# Answering means the runtime is running right now; the reply lists downloaded models.
RUNTIME_ENDPOINTS = {
    "Ollama": (11434, "/api/tags", "models", "name"),
    "LM Studio": (1234, "/v1/models", "data", "id"),
    "Jan": (1337, "/v1/models", "data", "id"),
    "GPT4All": (4891, "/v1/models", "data", "id"),
    "llama.cpp": (8080, "/v1/models", "data", "id"),
    "LocalAI": (8080, "/v1/models", "data", "id"),
    "vLLM": (8000, "/v1/models", "data", "id"),
}


def runtime_status(name):
    """'running · N models: a, b' when the runtime answers on localhost, else None."""
    port, path, key, field = RUNTIME_ENDPOINTS[name]
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d%s" % (port, path), timeout=0.5) as r:
            models = [m.get(field) for m in json.load(r).get(key) or [] if isinstance(m, dict)]
    except Exception:  # ponytail: not running / not that runtime on the port, both mean "no"
        return None
    models = [m for m in models if m]
    if not models:
        return "running"
    return "running · %d model%s: %s" % (
        len(models), "" if len(models) == 1 else "s", ", ".join(models[:10]))


def ollama_models_on_disk():
    """Downloaded Ollama models even when the server is stopped (manifest folders)."""
    root = expand("~/.ollama/models/manifests")
    found = sorted({"%s:%s" % (Path(p).parent.name, Path(p).name)
                    for p in globmod.glob(str(root / "*" / "*" / "*" / "*"))})
    return found

# --- IDE extensions ---------------------------------------------------------

# Extension folders per editor: VS Code and its forks share one layout
# (<publisher>.<name>-<version>[-platform]); JetBrains keeps plugins per product.
IDE_EXTENSION_DIRS = [
    ("VS Code", "~/.vscode/extensions"),
    ("VS Code Insiders", "~/.vscode-insiders/extensions"),
    ("VSCodium", "~/.vscode-oss/extensions"),
    ("Cursor", "~/.cursor/extensions"),
    ("Windsurf", "~/.windsurf/extensions"),
    ("Kiro", "~/.kiro/extensions"),
    ("Trae", "~/.trae/extensions"),
]
JETBRAINS_PLUGIN_GLOBS = {
    "macOS": "~/Library/Application Support/JetBrains/*/plugins/*",
    "Linux": "~/.local/share/JetBrains/*/*",
    "Windows": "~/AppData/Roaming/JetBrains/*/plugins/*",
}
KNOWN_AI_EXTENSIONS = {
    "anthropic.claude-code": "Claude Code",
    "github.copilot": "GitHub Copilot",
    "github.copilot-chat": "GitHub Copilot Chat",
    "openai.chatgpt": "OpenAI Codex / ChatGPT",
    "google.geminicodeassist": "Gemini Code Assist",
    "saoudrizwan.claude-dev": "Cline",
    "rooveterinaryinc.roo-cline": "Roo Code",
    "kilocode.kilo-code": "Kilo Code",
    "continue.continue": "Continue",
    "codeium.codeium": "Windsurf Plugin (Codeium)",
    "tabnine.tabnine-vscode": "Tabnine",
    "sourcegraph.cody-ai": "Sourcegraph Cody",
    "amazonwebservices.amazon-q-vscode": "Amazon Q",
    "supermaven.supermaven": "Supermaven",
    "codium.codium": "Qodo Gen",
    "qodo.qodo-gen": "Qodo Gen",
    "danielsanmedium.dscodegpt": "CodeGPT",
    "blackboxapp.blackbox": "Blackbox AI",
    "ms-windows-ai-studio.windows-ai-studio": "AI Toolkit",
    "augment.vscode-augment": "Augment Code",
    "tencent-cloud.coding-copilot": "Tencent Coding Copilot",
}
# Anything else whose id contains one of these is reported as an unrecognised AI extension.
AI_EXTENSION_KEYWORDS = ("copilot", "claude", "anthropic", "openai", "chatgpt", "gpt",
                         "gemini", "codeium", "tabnine", "llm", "cline", "cody",
                         "codewhisperer", "amazon-q", "supermaven", "ollama", "mistral",
                         "deepseek", "aider", "qodo", "augment", "genai", "-ai", "ai-")
EXT_VERSION = re.compile(r"-\d+\.\d+.*$")


def ai_extension_name(ext_id):
    """Friendly name for a known AI extension id, a flagged name for a likely one, else None."""
    ext_id = ext_id.lower()
    if ext_id in KNOWN_AI_EXTENSIONS:
        return KNOWN_AI_EXTENSIONS[ext_id]
    if any(k in ext_id for k in AI_EXTENSION_KEYWORDS):
        return ext_id + " (unrecognised AI extension)"
    return None


def discover_ide_extensions():
    found = {}
    for ide, folder in IDE_EXTENSION_DIRS:
        for path in sorted(globmod.glob(str(expand(folder) / "*"))):
            name = ai_extension_name(EXT_VERSION.sub("", Path(path).name))
            if name:
                found.setdefault((name, ide), path)
    for path in sorted(globmod.glob(str(expand(JETBRAINS_PLUGIN_GLOBS.get(PLATFORM, ""))))):
        if not os.path.isdir(path):
            continue
        product = Path(path).parent.parent.name if PLATFORM != "Linux" else Path(path).parent.name
        name = ai_extension_name(Path(path).name)
        if name:
            found.setdefault((name, "JetBrains " + re.sub(r"\d.*$", "", product)), path)
    return [{"name": "%s (%s)" % (name, ide), "category": "IDE extension",
             "status": "installed", "detection": "Extension in " + ide, "path": path}
            for (name, ide), path in sorted(found.items())]


def probe_hit(kind, target):
    if kind == "app_bundle":
        if PLATFORM != "macOS":
            return None
        for base in ("/Applications/", "~/Applications/"):
            p = expand(base + target)
            if p.exists():
                return str(p)
        return None
    if kind == "config_path":
        p = expand(target)
        return str(p) if p.exists() else None
    if kind == "binary":
        return which(target)
    return None


def discover_applications():
    apps = []
    for name, category, probes in APPLICATION_REGISTRY:
        hit = None
        for kind, target in probes.get(PLATFORM, ()):
            path = probe_hit(kind, target)
            if path:
                hit = (kind, path)
                break
        detection = DETECTION_LABEL[hit[0]] if hit else None
        if name in RUNTIME_ENDPOINTS:
            running = runtime_status(name)
            if name == "Ollama" and not running:
                disk = ollama_models_on_disk()
                running = disk and "stopped · %d models: %s" % (len(disk), ", ".join(disk[:10]))
            if running:
                detection = "%s · %s" % (detection, running) if detection else running
        apps.append({
            "name": name,
            "category": category,
            "status": "installed" if hit or detection else "not_detected",
            "detection": detection,
            "path": hit[1] if hit else None,
        })
    apps.extend(discover_ide_extensions())
    apps.sort(key=lambda a: (a["status"] != "installed", a["name"].lower()))
    return apps[:200]  # ponytail: matches the server's 200-app cap

# --- AI CLI tools -----------------------------------------------------------

AI_CLI_TOOLS = ["claude", "cursor", "code", "windsurf", "ollama", "aider", "codex",
                "gemini", "llm", "sgpt", "mods", "goose", "fabric", "lms",
                "llama-server", "llama-cli", "local-ai", "vllm", "opencode", "amp",
                "cursor-agent", "qwen", "crush", "kiro"]
# A cron or systemd PATH is minimal, so also look where installers put these.
EXTRA_BIN_DIRS = ["~/.local/bin", "~/bin", "~/.npm-global/bin", "~/.cargo/bin",
                  "/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/snap/bin"]


def which(name):
    found = shutil.which(name)
    if found:
        return found
    extra = os.pathsep.join(str(expand(d)) for d in EXTRA_BIN_DIRS)
    extra += os.pathsep + os.pathsep.join(
        globmod.glob(str(expand("~/.nvm/versions/node/*/bin"))))
    return shutil.which(name, path=extra)


def discover_cli_tools():
    tools = [{"name": n, "installed": bool(p), "path": p}
             for n, p in ((n, which(n)) for n in AI_CLI_TOOLS)]
    tools.sort(key=lambda t: (not t["installed"], AI_CLI_TOOLS.index(t["name"])))
    return tools

# --- scan + upload ----------------------------------------------------------


def machine_id():
    """Stable per machine so re-scans replace the same row in Governly."""
    for path in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
        try:
            value = Path(path).read_text().strip()
            if value:
                return value
        except OSError:
            pass
    return "%s-%012x" % (socket.gethostname(), uuid.getnode())


def run_scan():
    mcp_servers, errors = discover_mcp_servers()
    applications = discover_applications()
    cli_tools = discover_cli_tools()
    return {
        "scan_id": str(uuid.uuid4()),
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "machine_id": machine_id(),
        "hostname": socket.gethostname(),
        "username": getpass.getuser(),
        "platform": PLATFORM,
        "applications": applications,
        "mcp_servers": mcp_servers,
        "cli_tools": cli_tools,
        "errors": [redact(e) for e in errors],
    }


def upload(base_url, token, payload):
    request = urllib.request.Request(
        base_url.rstrip("/") + "/api/shadow-ai/upload",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + token},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read() or b"{}")


SERVE_PORT = 8766  # 8765 is the Receipt helper; both can run side by side
DEFAULT_ORIGINS = ("https://aigov.kentron.ai", "http://localhost:3001")


def make_server(origins, port=SERVE_PORT):
    allowed = set(origins)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def _send(self, code, payload=None):
            origin = self.headers.get("Origin") or ""
            body = b"" if payload is None else json.dumps(payload).encode("utf-8")
            self.send_response(code)
            if origin in allowed:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Headers", "X-Shadow-AI-Scan")
                self.send_header("Access-Control-Allow-Methods", "GET")
                # Chrome's Private/Local Network Access preflight.
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self._send(204 if self.headers.get("Origin") in allowed else 403)

        def do_GET(self):
            if self.path == "/health":
                # Presence check only; reveals nothing about the machine.
                self._send(200, {"ok": True})
            elif self.path != "/scan":
                self._send(404, {"error": "not found"})
            # Only a trusted Governly page may read this machine's inventory.
            # The custom header forces a CORS preflight, so no other site can
            # trigger a scan even blindly.
            elif (self.headers.get("Origin") not in allowed
                  or self.headers.get("X-Shadow-AI-Scan") != "1"):
                self._send(403, {"error": "forbidden"})
            else:
                self._send(200, run_scan())

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


LAUNCHD_LABEL = "ai.kentron.shadow-ai-helper"


def install(origins):
    """Keep --serve running in the background (now and after every login), so
    the Scan button works without a terminal left open."""
    script = os.path.abspath(__file__)
    serve = [sys.executable, script, "--serve"] + [
        a for o in origins for a in ("--allow-origin", o)]
    if PLATFORM == "macOS":
        plist = HOME / "Library/LaunchAgents" / (LAUNCHD_LABEL + ".plist")
        plist.parent.mkdir(parents=True, exist_ok=True)
        plist.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
            '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
            '<plist version="1.0"><dict>'
            "<key>Label</key><string>%s</string>"
            "<key>ProgramArguments</key><array>%s</array>"
            "<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>"
            "</dict></plist>\n" % (LAUNCHD_LABEL, "".join(
                "<string>%s</string>" % a.replace("&", "&amp;").replace("<", "&lt;")
                for a in serve)))
        os.system("launchctl unload %s 2>/dev/null" % shlex.quote(str(plist)))
        return os.system("launchctl load -w %s" % shlex.quote(str(plist)))
    if PLATFORM == "Linux" and shutil.which("systemctl"):
        unit = HOME / ".config/systemd/user/governly-shadow-ai-helper.service"
        unit.parent.mkdir(parents=True, exist_ok=True)
        unit.write_text(
            "[Unit]\nDescription=Governly scan helper\n\n[Service]\n"
            "ExecStart=%s\nRestart=always\n\n[Install]\nWantedBy=default.target\n"
            % " ".join(shlex.quote(a) for a in serve))
        return os.system("systemctl --user daemon-reload && "
                         "systemctl --user enable --now governly-shadow-ai-helper.service")
    if PLATFORM == "Windows":
        # pythonw has no console window; a logon task restarts it after reboots.
        exe = sys.executable
        if exe.lower().endswith("python.exe"):
            exe = exe[:-len("python.exe")] + "pythonw.exe"
        task = subprocess.list2cmdline([exe] + serve[1:])
        created = subprocess.call(["schtasks", "/create", "/f", "/sc", "onlogon",
                                   "/tn", "GovernlyShadowAIHelper", "/tr", task])
        return created or subprocess.call(["schtasks", "/run", "/tn", "GovernlyShadowAIHelper"])
    # ponytail: systemd-less Linux falls back to a foreground helper.
    print("Background install is not supported here; keep this running instead.")
    return None


SETTINGS_FILES = (
    "/Library/Managed Preferences/ai.kentron.shadow-ai.plist",   # Jamf configuration profile
    "/Library/Application Support/Governly/config.plist",        # baked into the downloaded .pkg
)


def managed_settings():
    """url/token from a Jamf profile or the downloaded installer, if any."""
    import plistlib
    for path in SETTINGS_FILES:
        try:
            with open(path, "rb") as f:
                return plistlib.load(f)
        except (OSError, plistlib.InvalidFileException):
            pass
    return {}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--url", default=os.environ.get("GOVERNLY_URL"),
                        help="Governly base URL (or GOVERNLY_URL)")
    parser.add_argument("--token", default=os.environ.get("GOVERNLY_SCAN_TOKEN"),
                        help="scan token from Shadow AI (or GOVERNLY_SCAN_TOKEN)")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the payload instead of uploading it")
    parser.add_argument("--serve", action="store_true",
                        help="answer scans from the Governly Scan button on 127.0.0.1:%d" % SERVE_PORT)
    parser.add_argument("--install", action="store_true",
                        help="run the helper in the background now and at every login")
    parser.add_argument("--allow-origin", action="append", default=[],
                        help="extra Governly origin allowed to scan (repeatable)")
    args = parser.parse_args(argv)

    origins = list(DEFAULT_ORIGINS) + args.allow_origin
    # The org installer (.pkg / Jamf profile) names this org's Governly URL; trust its origin too,
    # so the installed helper answers that site's Scan button with no extra setup.
    managed_url = managed_settings().get("url") if (args.serve or args.install) else None
    if managed_url:
        parsed = urllib.parse.urlsplit(managed_url)
        if parsed.scheme and parsed.netloc:
            origins.append("%s://%s" % (parsed.scheme, parsed.netloc))
    if args.install:
        status = install(origins)
        if status == 0:
            print("Governly scan helper installed and running. Go back to Governly and "
                  "click Scan this computer.")
            return 0
        if status is not None:
            print("Could not start the helper in the background.", file=sys.stderr)
            return 1
        args.serve = True
    if args.serve:
        server = make_server(origins)
        print("Governly scan helper on http://127.0.0.1:%d (read-only)" % SERVE_PORT)
        print("Allowed: " + ", ".join(origins))
        print("Open Governly > Shadow AI and click Scan this computer.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        return 0

    payload = run_scan()
    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return 0
    if not args.url or not args.token:
        managed = managed_settings()
        args.url = args.url or managed.get("url")
        args.token = args.token or managed.get("token")
    if not args.url or not args.token:
        parser.error("--url and --token are required (or use --dry-run)")
    try:
        upload(args.url, args.token, payload)
    except urllib.error.HTTPError as exc:
        print("Upload failed: HTTP %d %s" % (exc.code, exc.read().decode("utf-8", "replace")),
              file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print("Upload failed: %s" % exc.reason, file=sys.stderr)
        return 1
    print("Scanned %s: %d MCP servers, %d AI apps, %d AI CLI tools. Uploaded to Governly."
          % (payload["hostname"], len(payload["mcp_servers"]),
             sum(a["status"] == "installed" for a in payload["applications"]),
             sum(t["installed"] for t in payload["cli_tools"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
