"""Generates DriveIQ's animated README diagrams. Run: python3 scripts/animations.py docs/animations

Every animation is SMIL on a fixed loop, so all parts stay in sync and loop
cleanly. Elements that only exist for the animation carry class "mv" and are
hidden when the viewer asks for reduced motion; the static diagram underneath
still reads on its own.
"""
import html
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
RED = "#eb0a1e"
ORANGE = "#f38020"
BLUE = "#3b82f6"
GREEN = "#10b981"
AMBER = "#f59e0b"
INK = "#f9fafb"
MUTED = "#9ca3af"
DIM = "#6b7280"
CARD = "#111827"
LINE = "#374151"


def esc(s):
    return html.escape(str(s), quote=True)


def head(w, h, title, desc):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="t d">
<title id="t">{esc(title)}</title>
<desc id="d">{esc(desc)}</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0b1220"/><stop offset="100%" stop-color="#1f2937"/></linearGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<style>
  text {{ font-family: {FONT}; }}
  .mono {{ font-family: {MONO}; }}
  @media (prefers-reduced-motion: reduce) {{ .mv {{ display: none; }} }}
</style>
<rect width="{w}" height="{h}" rx="24" fill="url(#bg)"/>
"""


def tail():
    return "</svg>\n"


def text(x, y, s, size=16, fill=INK, weight=400, anchor="start", cls="", extra=""):
    c = f' class="{cls}"' if cls else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{c}{extra}>{esc(s)}</text>\n'


def box(x, y, w, h, stroke=LINE, fill=CARD, rx=14, sw=1.5, extra=""):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{extra}/>\n'


class Loop:
    """Times are seconds within one loop of length T."""

    def __init__(self, T, fade=0.25):
        self.T = T
        self.fade = fade

    def k(self, t):
        return max(0.0, min(1.0, t / self.T))

    def window(self, t0, t1, peak=1.0, fade=None):
        """Opacity animate: 0 until t0, `peak` from t0+fade to t1, back to 0 by t1+fade."""
        f = self.fade if fade is None else fade
        pts = [(0, 0), (t0, 0), (t0 + f, peak), (t1, peak), (t1 + f, 0), (self.T, 0)]
        pts = [(self.k(t), v) for t, v in pts]
        # keyTimes must increase strictly from 0 to 1
        fixed = []
        for kt, v in pts:
            if fixed and kt <= fixed[-1][0]:
                kt = fixed[-1][0] + 1e-4
            fixed.append((min(kt, 1.0), v))
        fixed[-1] = (1.0, fixed[-1][1])
        kts = ";".join(f"{kt:.4f}" for kt, _ in fixed)
        vals = ";".join(f"{v:g}" for _, v in fixed)
        return f'<animate attributeName="opacity" values="{vals}" keyTimes="{kts}" dur="{self.T}s" repeatCount="indefinite"/>'

    def shown(self, inner, t0, t1, peak=1.0, fade=None):
        """Wraps content that fades in at t0 and out after t1."""
        return f'<g class="mv" opacity="0">{self.window(t0, t1, peak, fade)}\n{inner}</g>\n'

    def glow(self, x, y, w, h, color, t0, t1, rx=14):
        r = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="none" stroke="{color}" stroke-width="3"/>'
        r += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="none" stroke="{color}" stroke-width="8" opacity=".45" filter="url(#glow)"/>'
        return self.shown(r, t0, t1)

    def packet(self, path, t0, t1, color, label=None, r=7, hold=0.15, side="right"):
        a, b = self.k(t0), self.k(t1)
        motion = (f'<animateMotion path="{path}" keyPoints="0;0;1;1" keyTimes="0;{a:.4f};{b:.4f};1" '
                  f'calcMode="linear" dur="{self.T}s" repeatCount="indefinite"/>')
        lab = ""
        if label:
            lw = len(label) * 7.6 + 18
            lx = 12 if side == "right" else -12 - lw
            lab = (f'<rect x="{lx:.0f}" y="-30" width="{lw:.0f}" height="22" rx="11" fill="{color}" opacity=".95"/>'
                   f'<text x="{lx + 9:.0f}" y="-14" font-size="13" font-weight="600" fill="#fff">{esc(label)}</text>')
        dot = (f'<circle r="{r + 6}" fill="{color}" opacity=".35" filter="url(#glow)"/>'
               f'<circle r="{r}" fill="{color}"/>')
        return (f'<g class="mv" opacity="0">{self.window(t0 - 0.05, t1 + hold, fade=0.1)}'
                f'<g>{motion}{dot}{lab}</g></g>\n')

    def move(self, inner, path, t0, t1, hold=0.15, fade=0.1):
        a, b = self.k(t0), self.k(t1)
        motion = (f'<animateMotion path="{path}" keyPoints="0;0;1;1" keyTimes="0;{a:.4f};{b:.4f};1" '
                  f'calcMode="linear" dur="{self.T}s" repeatCount="indefinite"/>')
        return f'<g class="mv" opacity="0">{self.window(t0 - 0.05, t1 + hold, fade=fade)}<g>{motion}{inner}</g></g>\n'


def edge(d, color=LINE, dash="6 7", width=2):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-dasharray="{dash}" stroke-linecap="round"/>\n'


def caption_set(loop, x, y, items, size=17):
    out = ""
    for t0, t1, s in items:
        out += loop.shown(text(x, y, s, size=size, fill=INK, weight=500), t0, t1)
    return out


def step_dot(x, y, n, color):
    return (f'<circle cx="{x}" cy="{y}" r="15" fill="{color}"/>'
            + text(x, y + 5, n, size=15, weight=700, anchor="middle", fill="#fff"))


# --------------------------------------------------------------------------
# 1. How a request moves through DriveIQ
# --------------------------------------------------------------------------
def how_it_works():
    W, H, T = 1200, 620, 12
    L = Loop(T)
    s = head(W, H, "How a request moves through DriveIQ",
             "Animated diagram: the browser's request passes Cloudflare Access, the DriveIQ Worker verifies the Access token, "
             "then uses Workers AI, Vectorize, D1 and AI Gateway with Claude to answer, and serves page images from R2.")
    s += text(40, 56, "How a request moves through DriveIQ", size=28, weight=800)
    s += text(40, 84, "Everything below runs in your own Cloudflare account. Only Claude sits outside it.", size=16, fill=MUTED)

    # nodes
    bx, by, bw, bh = 40, 230, 190, 150
    ax, ay, aw, ah = 290, 230, 190, 150
    wx, wy, ww, wh = 540, 160, 280, 290
    s += box(bx, by, bw, bh)
    s += f'<g transform="translate({bx + 20} {by + 22})"><rect width="44" height="32" rx="5" fill="none" stroke="{MUTED}" stroke-width="2"/><line x1="0" y1="9" x2="44" y2="9" stroke="{MUTED}" stroke-width="2"/></g>\n'
    s += text(bx + 20, by + 82, "Your browser", size=19, weight=700)
    s += text(bx + 20, by + 106, "The DriveIQ app", size=14, fill=MUTED)
    s += text(bx + 20, by + 126, "PDFs are read here", size=14, fill=MUTED)

    s += box(ax, ay, aw, ah)
    s += f'<path transform="translate({ax + 20} {ay + 18})" d="M20 0 L40 8 V22 C40 34 31 41 20 44 C9 41 0 34 0 22 V8 Z" fill="none" stroke="{ORANGE}" stroke-width="2.5"/>\n'
    s += text(ax + 20, ay + 82, "Cloudflare Access", size=19, weight=700)
    s += text(ax + 20, ay + 106, "Signs you in", size=14, fill=MUTED)
    s += text(ax + 20, ay + 126, "Only you get through", size=14, fill=MUTED)

    s += box(wx, wy, ww, wh, stroke=RED, sw=2)
    s += text(wx + 22, wy + 40, "DriveIQ Worker", size=21, weight=800)
    s += text(wx + 22, wy + 64, "API (Hono) + the app's pages", size=14, fill=MUTED)
    rows = ["Check the Access token", "Embed and search", "Read your records", "Ask Claude", "Fetch page images"]
    for i, r in enumerate(rows):
        yy = wy + 104 + i * 36
        s += f'<circle cx="{wx + 32}" cy="{yy - 5}" r="9" fill="none" stroke="{DIM}" stroke-width="1.5"/>\n'
        s += text(wx + 52, yy, r, size=15, fill="#d1d5db")

    services = [
        ("Workers AI", "embeddings · bge-base-en-v1.5", ORANGE),
        ("Vectorize", "document search · 768-dim vectors", ORANGE),
        ("D1 (SQLite)", "vehicle, history, schedule, chat", ORANGE),
        ("AI Gateway → Claude", "Aiana's answers · Haiku 5.5", BLUE),
        ("R2", "an image of every document page", ORANGE),
    ]
    sx, sw_, sh = 880, 280, 78
    sy0 = 112
    gap = 16
    centers = []
    for i, (name, sub, col) in enumerate(services):
        yy = sy0 + i * (sh + gap)
        s += box(sx, yy, sw_, sh)
        s += f'<rect x="{sx}" y="{yy + 16}" width="4" height="{sh - 32}" rx="2" fill="{col}"/>\n'
        s += text(sx + 20, yy + 32, name, size=17, weight=700)
        s += text(sx + 20, yy + 56, sub, size=13.5, fill=MUTED)
        centers.append(yy + sh / 2)

    # edges
    p_ba = f"M{bx + bw} 290 L{ax} 290"
    p_aw = f"M{ax + aw} 290 L{wx} 290"
    s += edge(p_ba) + edge(p_aw)
    svc_paths = []
    for cy in centers:
        d = f"M{wx + ww} 305 C {wx + ww + 40} 305, {sx - 40} {cy:.0f}, {sx} {cy:.0f}"
        svc_paths.append(d)
        s += edge(d)
    p_back = f"M{wx} 410 C {wx - 120} 470, {bx + bw + 20} 470, {bx + bw - 60} {by + bh}"
    s += edge(p_back, dash="3 7")
    rev = [f"M{sx} {cy:.0f} C {sx - 40} {cy:.0f}, {wx + ww + 40} 330, {wx + ww} 330" for cy in centers]

    # timeline
    s += L.packet(p_ba, 0.4, 1.3, RED, "GET /api/…", side="left")
    s += L.glow(ax, ay, aw, ah, ORANGE, 1.1, 2.5)
    s += L.packet(p_aw, 1.8, 2.7, ORANGE, "+ signed token", side="left")
    s += L.glow(wx, wy, ww, wh, RED, 2.5, 10.6)
    order = [(0, 3.4), (1, 4.3), (2, 5.2), (3, 6.1)]
    for row, (i, t) in enumerate(order):
        col = services[i][2]
        s += L.packet(svc_paths[i], t, t + 0.7, col, r=6)
        s += L.glow(sx, sy0 + i * (sh + gap), sw_, sh, col, t + 0.6, t + 1.5 if i != 3 else 7.9)
        s += L.packet(rev[i], t + 0.9 if i != 3 else 7.5, (t + 1.5) if i != 3 else 8.2, col, r=5)
    # row checks inside the worker
    checks = [2.9, 5.8, 6.7, 8.2, 10.0]
    for i, t in enumerate(checks):
        yy = wy + 104 + i * 36
        mark = f'<circle cx="{wx + 32}" cy="{yy - 5}" r="9" fill="{GREEN}"/><path d="M{wx + 27} {yy - 5} l4 4 l7 -8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
        s += L.shown(mark, t, T - 0.5)
    s += L.packet(p_back, 8.3, 9.2, GREEN, "answer + sources")
    s += L.glow(bx, by, bw, bh, GREEN, 9.1, 11.5)
    s += L.packet(svc_paths[4], 9.3, 9.9, ORANGE, r=6)
    s += L.glow(sx, sy0 + 4 * (sh + gap), sw_, sh, ORANGE, 9.8, 10.7)
    s += L.packet(p_back, 10.3, 11.2, ORANGE, "page thumbnails")

    s += box(40, 500, 780, 84, fill="#0f172a")
    s += caption_set(L, 64, 548, [
        (0.0, 1.6, "You open DriveIQ. The request reaches Cloudflare before it reaches the app."),
        (1.6, 2.8, "Access signs you in, then adds a signed token to every request."),
        (2.8, 3.5, "The Worker checks that token itself. No valid token, no data."),
        (3.5, 5.8, "It embeds your question and searches your documents for it."),
        (5.8, 6.7, "It reads your vehicle, service history, schedule and recent chat."),
        (6.7, 8.2, "Claude writes the answer through your AI Gateway."),
        (8.2, 9.3, "The answer comes back with the pages it used."),
        (9.3, 11.6, "The page thumbnails are served from your R2 bucket."),
    ])
    s += tail()
    return s


# --------------------------------------------------------------------------
# 2. Uploading a document
# --------------------------------------------------------------------------
def page_icon(x, y, w=46, h=60, stroke=MUTED, fill="#1f2937", lines=4):
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>'
    for i in range(lines):
        lw = w - 14 - (i % 2) * 10
        s += f'<rect x="{x + 7}" y="{y + 10 + i * 11}" width="{lw}" height="4" rx="2" fill="{stroke}" opacity=".7"/>'
    return s


def vector_strip(x, y, n=24, w=4, gap=2, color=ORANGE, seed=3):
    hs = [(seed * 37 + i * 53) % 23 + 4 for i in range(n)]
    s = ""
    for i, hh in enumerate(hs):
        s += f'<rect x="{x + i * (w + gap)}" y="{y + 27 - hh}" width="{w}" height="{hh}" rx="1" fill="{color}"/>'
    return s


def ingest():
    W, H, T = 1200, 640, 14
    L = Loop(T)
    s = head(W, H, "What happens when you upload a document",
             "Animated diagram: the browser reads the PDF with pdf.js, splits the text into chunks and sends them in batches; "
             "the Worker embeds each chunk with Workers AI and stores the vectors in Vectorize; then each page is drawn as an image "
             "and saved to R2.")
    s += text(40, 56, "What happens when you upload a document", size=28, weight=800)
    s += text(40, 84, "Settings → Documents → Upload. The PDF itself never leaves your browser: only its text and page images do.", size=16, fill=MUTED)

    # bands
    s += box(30, 110, 1140, 230, fill="#0f172a", stroke="#1f2937", rx=18)
    s += box(30, 360, 1140, 250, fill="#0f172a", stroke="#1f2937", rx=18)
    s += text(52, 140, "IN YOUR BROWSER", size=13, weight=700, fill=MUTED, extra=' letter-spacing="1.5"')
    s += text(52, 390, "IN YOUR CLOUDFLARE ACCOUNT", size=13, weight=700, fill=MUTED, extra=' letter-spacing="1.5"')

    # browser stages
    s += f'<g transform="translate(60 170)">{page_icon(14, 0, 64, 84, stroke=RED, lines=5)}{page_icon(7, 7, 64, 84, stroke=RED, lines=5)}{page_icon(0, 14, 64, 84, stroke=RED, lines=5)}</g>\n'
    s += text(60, 300, "owners-manual.pdf", size=14, fill="#d1d5db", cls="mono")
    s += text(60, 320, "read page by page (pdf.js)", size=13, fill=MUTED)

    s += box(250, 160, 400, 160)
    s += text(270, 188, "Text → chunks", size=17, weight=700)
    s += text(270, 210, "~1,500 characters each, 200 overlapping,", size=13.5, fill=MUTED)
    s += text(270, 228, "tagged with their page number", size=13.5, fill=MUTED)
    chunk_pos = [(270 + (i % 4) * 92, 248 + (i // 4) * 34) for i in range(8)]
    for (cx, cy) in chunk_pos:
        s += f'<rect x="{cx}" y="{cy}" width="82" height="26" rx="6" fill="none" stroke="{LINE}" stroke-dasharray="4 4"/>\n'

    s += box(690, 160, 460, 160)
    s += text(710, 188, "Pages → images", size=17, weight=700)
    s += text(710, 210, "each page drawn 1,200 px wide, plus a thumbnail", size=13.5, fill=MUTED)
    tile_x = [710 + i * 76 for i in range(5)]
    for tx in tile_x:
        s += f'<rect x="{tx}" y="236" width="56" height="72" rx="5" fill="none" stroke="{LINE}" stroke-dasharray="4 4"/>\n'

    # cloud nodes
    wx, wy = 250, 420
    s += box(wx, wy, 220, 150, stroke=RED, sw=2)
    s += text(wx + 20, wy + 36, "DriveIQ Worker", size=18, weight=800)
    s += text(wx + 20, wy + 60, "POST /api/search/ingest", size=12.5, fill=MUTED, cls="mono")
    s += text(wx + 20, wy + 80, "20 chunks per request", size=13.5, fill=MUTED)
    s += text(wx + 20, wy + 116, "PUT /api/pages/…", size=12.5, fill=MUTED, cls="mono")
    s += text(wx + 20, wy + 136, "one request per image", size=13.5, fill=MUTED)

    ax_ = 540
    s += box(ax_, 420, 230, 76)
    s += text(ax_ + 18, 450, "Workers AI", size=17, weight=700)
    s += text(ax_ + 18, 474, "each chunk → 768 numbers", size=13.5, fill=MUTED)
    vx = 840
    s += box(vx, 420, 310, 76)
    s += text(vx + 18, 450, "Vectorize · driveiq-docs", size=17, weight=700)
    s += text(vx + 18, 474, "vector + text + document + page", size=13.5, fill=MUTED)
    rx_ = 840
    s += box(rx_, 516, 310, 76)
    s += text(rx_ + 18, 546, "R2 · driveiq-pages", size=17, weight=700)
    s += text(rx_ + 18, 570, "<doc>/page-N/full.png, thumbnail.png", size=12.5, fill=MUTED, cls="mono")

    # edges
    p_down_text = "M450 320 C 450 370, 360 380, 360 420"
    p_down_img = "M800 320 C 800 395, 470 380, 440 420"
    p_ai = f"M470 458 L{ax_} 458"
    p_vec = f"M{ax_ + 230} 458 L{vx} 458"
    p_r2 = f"M470 540 C 600 540, 700 554, {rx_} 554"
    for d in (p_down_text, p_down_img, p_ai, p_vec, p_r2):
        s += edge(d)

    # progress bar (matches the upload dialog's phases)
    px, py, pw = 690, 126, 460
    s += f'<rect x="{px}" y="{py}" width="{pw}" height="8" rx="4" fill="#1f2937"/>\n'
    phases = [(0.4, 2.6, "Reading the PDF", 0.18), (2.6, 7.8, "Indexing text", 0.62), (7.8, 12.0, "Saving page images", 1.0)]
    prev = 0.0
    for t0, t1, label, frac in phases:
        bar = f'<rect x="{px}" y="{py}" width="{pw * frac:.0f}" height="8" rx="4" fill="{RED}"/>'
        s += L.shown(bar, t1 - 0.3, T - 0.6)
        prev = frac
    s += f'<rect class="mv" x="{px}" y="{py}" width="0" height="8" rx="4" fill="{RED}"><animate attributeName="width" values="0;0;{pw}" keyTimes="0;{L.k(0.4):.4f};{L.k(12):.4f}" dur="{T}s" repeatCount="indefinite"/>{L.window(0.3, T - 0.6)}</rect>\n'
    for t0, t1, label, _ in phases:
        s += L.shown(text(px + pw, py + 26, label, size=13, fill=MUTED, anchor="end"), t0, t1)
    s += L.shown(text(px + pw, py + 26, "Done", size=13, fill=GREEN, weight=700, anchor="end"), 12.0, T - 0.6)

    # animation: pages fly into the chunk area, chunks appear
    for i in range(3):
        t = 0.4 + i * 0.55
        s += L.move(page_icon(0, 0, 34, 44, stroke=RED, lines=3), f"M{110} {200} C 180 170, 220 200, {300 + i * 80} 190", t, t + 0.6, hold=0.1)
    for i, (cx, cy) in enumerate(chunk_pos):
        t = 1.6 + i * 0.22
        chunk = f'<rect x="{cx}" y="{cy}" width="82" height="26" rx="6" fill="{RED}" opacity=".85"/><text x="{cx + 10}" y="{cy + 18}" font-size="12" fill="#fff" class="mono">p.{1 + i // 3} · #{i}</text>'
        s += L.shown(chunk, t, 7.6)
    # batches travel down; vectors appear; vectors go to Vectorize
    for j in range(3):
        t = 3.6 + j * 1.2
        batch = f'<rect x="-30" y="-12" width="60" height="24" rx="6" fill="{RED}"/><text x="0" y="5" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">×20</text>'
        s += L.move(batch, p_down_text, t, t + 0.7)
        s += L.packet(p_ai, t + 0.75, t + 1.15, ORANGE, r=5, hold=0.05)
        vec = f'<g transform="translate(-72 -40)">{vector_strip(0, 0, seed=j + 2)}</g>'
        s += L.move(vec, p_vec, t + 1.2, t + 1.7)
    s += L.glow(ax_, 420, 230, 76, ORANGE, 4.3, 7.4)
    s += L.glow(vx, 420, 310, 76, ORANGE, 4.8, 7.9)
    s += L.shown(text(vx + 292, 450, "✓", size=18, weight=800, fill=GREEN, anchor="end"), 7.9, T - 0.6)

    # images phase
    for i, tx in enumerate(tile_x):
        t = 8.0 + i * 0.5
        tile = f'<rect x="{tx}" y="236" width="56" height="72" rx="5" fill="#e5e7eb"/>' + "".join(
            f'<rect x="{tx + 7}" y="{246 + k * 12}" width="{42 - (k % 2) * 12}" height="5" rx="2" fill="#9ca3af"/>' for k in range(5))
        s += L.shown(tile, t, T - 0.6)
        img = page_icon(-14, -18, 28, 36, stroke="#9ca3af", fill="#e5e7eb", lines=3)
        s += L.move(img, p_down_img, t + 0.2, t + 0.9)
        s += L.move(img, p_r2, t + 0.95, t + 1.45)
    s += L.glow(rx_, 516, 310, 76, ORANGE, 9.3, 12.0)
    s += L.shown(text(rx_ + 292, 546, "✓", size=18, weight=800, fill=GREEN, anchor="end"), 12.0, T - 0.6)
    s += L.glow(wx, wy, 220, 150, RED, 3.9, 11.6)
    s += tail()
    return s


# --------------------------------------------------------------------------
# 3. How Aiana answers a question
# --------------------------------------------------------------------------
def ask():
    W, H, T = 1200, 660, 16
    L = Loop(T)
    s = head(W, H, "How Aiana answers a question",
             "Animated diagram: the question is embedded with Workers AI, matched against your documents in Vectorize "
             "(top 8, score at least 0.35), combined with your records from D1, and sent to Claude through AI Gateway. "
             "The answer cites the page it used, shown from R2.")
    s += text(40, 56, "How Aiana answers a question", size=28, weight=800)
    s += text(40, 84, "One question, five steps, about as long as it takes to read this line. (Demo manual shown.)", size=16, fill=MUTED)

    # chat panel
    cx, cy, cw, ch = 40, 110, 340, 520
    s += box(cx, cy, cw, ch, rx=18)
    s += text(cx + 20, cy + 34, "Aiana", size=17, weight=800)
    s += f'<circle cx="{cx + 82}" cy="{cy + 28}" r="5" fill="{GREEN}"/>\n'
    q = "How much oil does the engine take?"
    qbubble = (f'<rect x="{cx + 60}" y="{cy + 60}" width="{cw - 80}" height="56" rx="14" fill="{RED}"/>'
               + text(cx + 76, cy + 84, "How much oil does the", size=15, fill="#fff", weight=500)
               + text(cx + 76, cy + 104, "engine take?", size=15, fill="#fff", weight=500))
    s += L.shown(qbubble, 0.3, T - 0.5)
    # thinking dots
    dots = "".join(f'<circle cx="{cx + 40 + i * 14}" cy="{cy + 150}" r="4" fill="{MUTED}"><animate attributeName="opacity" values=".2;1;.2" dur="1s" begin="{i * 0.2}s" repeatCount="indefinite"/></circle>' for i in range(3))
    s += L.shown(dots, 1.0, 11.4)
    ans_lines = ["About 4.8 qt with a new filter.",
                 "The demo manual lists filter",
                 "DM-15400 for this engine."]
    abox = f'<rect x="{cx + 20}" y="{cy + 140}" width="{cw - 40}" height="196" rx="14" fill="#1f2937" stroke="{LINE}"/>'
    s += L.shown(abox, 11.6, T - 0.5)
    for i, line in enumerate(ans_lines):
        s += L.shown(text(cx + 38, cy + 172 + i * 22, line, size=15, fill=INK), 11.9 + i * 0.35, T - 0.5)
    chip = (f'<rect x="{cx + 38}" y="{cy + 244}" width="170" height="26" rx="13" fill="none" stroke="{BLUE}"/>'
            + text(cx + 52, cy + 262, "Owner's Manual · p.3", size=13, fill="#93c5fd", weight=600))
    s += L.shown(chip, 13.0, T - 0.5)
    thumb = (f'<rect x="{cx + 38}" y="{cy + 280}" width="40" height="46" rx="4" fill="#e5e7eb"/>'
             + "".join(f'<rect x="{cx + 44}" y="{cy + 288 + k * 8}" width="{28 - (k % 2) * 8}" height="3" rx="1.5" fill="#9ca3af"/>' for k in range(4))
             + f'<rect x="{cx + 88}" y="{cy + 280}" width="40" height="46" rx="4" fill="#e5e7eb"/>'
             + "".join(f'<rect x="{cx + 94}" y="{cy + 288 + k * 8}" width="{28 - ((k + 1) % 2) * 8}" height="3" rx="1.5" fill="#9ca3af"/>' for k in range(4)))
    s += L.shown(thumb, 13.6, T - 0.5)
    s += text(cx + 20, cy + ch - 22, "Answers cite the page they came from.", size=13, fill=DIM)

    # steps
    sx, sw_ = 420, 740
    sh, gap, sy0 = 92, 12, 110
    steps = [
        ("Embed the question", "Workers AI turns it into 768 numbers (bge-base-en-v1.5).", ORANGE),
        ("Search your documents", "Vectorize: top 8 matches, keep scores ≥ 0.35. Short follow-ups search with the last question too.", ORANGE),
        ("Gather what DriveIQ knows", "From D1: service history, forecast, NHTSA recalls, your specs, reminders, the last 4 hours of chat.", ORANGE),
        ("Ask Claude", "Through your AI Gateway to Claude Haiku 5.5, with tools to add or edit reminders.", BLUE),
        ("Show the pages", "The answer lists its sources; thumbnails come from R2.", ORANGE),
    ]
    windows = [(1.0, 3.0), (3.0, 5.6), (5.6, 8.2), (8.2, 11.4), (11.4, 14.0)]
    for i, (title, sub, col) in enumerate(steps):
        yy = sy0 + i * (sh + gap)
        s += box(sx, yy, sw_, sh)
        s += step_dot(sx + 32, yy + 32, str(i + 1), col)
        s += text(sx + 60, yy + 38, title, size=18, weight=700)
        # wrap sub to ~62 chars
        words, lines, cur = sub.split(), [], ""
        for w_ in words:
            if len(cur) + len(w_) + 1 > 52:
                lines.append(cur)
                cur = w_
            else:
                cur = (cur + " " + w_).strip()
        lines.append(cur)
        for k, ln in enumerate(lines[:2]):
            s += text(sx + 60, yy + 62 + k * 19, ln, size=13.5, fill=MUTED)
        t0, t1 = windows[i]
        s += L.glow(sx, yy, sw_, sh, col, t0, t1)
        s += L.shown(f'<circle cx="{sx + sw_ - 26}" cy="{yy + 30}" r="10" fill="{GREEN}"/><path d="M{sx + sw_ - 31} {yy + 30} l4 4 l7 -8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', t1 - 0.2, T - 0.5)

    # step visuals (right side of each card)
    vx = sx + 470
    # 1: vector strip grows
    y1 = sy0 + 18
    s += L.shown(f'<g transform="translate({vx} {y1})">{vector_strip(0, 0, n=28, w=5, gap=2)}</g>', 1.6, T - 0.5)
    # 2: score bars with threshold
    y2 = sy0 + (sh + gap) + 14
    scores = [0.71, 0.64, 0.58, 0.49, 0.41, 0.37, 0.31, 0.22]
    thr_x = vx + 0.35 * 180
    s += L.shown(f'<line x1="{thr_x}" y1="{y2 - 2}" x2="{thr_x}" y2="{y2 + 66}" stroke="{AMBER}" stroke-dasharray="3 3"/>' + text(thr_x + 4, y2 + 76, "0.35", size=11, fill=AMBER), 3.4, T - 0.5)
    for k, sc in enumerate(scores):
        col = ORANGE if sc >= 0.35 else DIM
        bar = f'<rect x="{vx}" y="{y2 + k * 8}" width="{sc * 180:.0f}" height="5" rx="2.5" fill="{col}"/>'
        s += L.shown(bar, 3.5 + k * 0.15, T - 0.5)
    # 3: fact chips
    y3 = sy0 + 2 * (sh + gap) + 10
    chips = ["history", "forecast", "recalls", "specs", "reminders", "chat"]
    for k, c_ in enumerate(chips):
        xx = vx - 30 + (k % 3) * 74
        yy = y3 + (k // 3) * 30
        chipsvg = f'<rect x="{xx}" y="{yy}" width="68" height="24" rx="12" fill="#1f2937" stroke="{ORANGE}"/>' + text(xx + 34, yy + 16, c_, size=12, fill="#fdba74", anchor="middle")
        s += L.shown(chipsvg, 6.0 + k * 0.25, T - 0.5)
    # 4: tools
    y4 = sy0 + 3 * (sh + gap) + 18
    for k, tname in enumerate(["create_reminder", "update_reminder"]):
        xx = vx - 30 + k * 116
        tool = f'<rect x="{xx}" y="{y4}" width="110" height="24" rx="6" fill="#1e3a8a" stroke="{BLUE}"/>' + text(xx + 55, y4 + 16, tname, size=11, fill="#bfdbfe", anchor="middle", cls="mono")
        s += L.shown(tool, 8.6 + k * 0.3, T - 0.5)
    s += L.shown(text(vx - 30, y4 + 48, "used only when you ask for a change", size=12, fill=DIM), 9.2, T - 0.5)
    # 5: thumbnails
    y5 = sy0 + 4 * (sh + gap) + 16
    for k in range(3):
        xx = vx + k * 50
        tile = f'<rect x="{xx}" y="{y5}" width="40" height="56" rx="4" fill="#e5e7eb"/>' + "".join(f'<rect x="{xx + 6}" y="{y5 + 8 + j * 9}" width="{28 - (j % 2) * 8}" height="3" rx="1.5" fill="#9ca3af"/>' for j in range(5))
        s += L.shown(tile, 11.8 + k * 0.3, T - 0.5)

    # flow packet from question into step 1 and back out of step 5
    s += L.packet(f"M{cx + cw - 20} {cy + 88} C {cx + cw + 20} {cy + 88}, {sx - 30} {sy0 + 46}, {sx} {sy0 + 46}", 0.5, 1.1, RED, r=6)
    last_y = sy0 + 4 * (sh + gap) + 46
    s += L.packet(f"M{sx} {last_y} C {sx - 30} {last_y}, {cx + cw + 20} {cy + 200}, {cx + cw - 20} {cy + 200}", 11.0, 11.6, GREEN, r=6)
    # connector rail between steps
    rail = "".join(edge(f"M{sx + 32} {sy0 + i * (sh + gap) + 48} L{sx + 32} {sy0 + (i + 1) * (sh + gap) + 16}") for i in range(4))
    s += rail
    for i in range(4):
        t = windows[i][1] - 0.3
        s += L.packet(f"M{sx + 32} {sy0 + i * (sh + gap) + 50} L{sx + 32} {sy0 + (i + 1) * (sh + gap) + 16}", t, t + 0.35, steps[i + 1][2], r=5, hold=0.05)
    s += tail()
    return s


# --------------------------------------------------------------------------
# 4. The What's Next forecast
# --------------------------------------------------------------------------
def forecast():
    W, H, T = 1200, 470, 12
    L = Loop(T)
    s = head(W, H, "How DriveIQ forecasts the next service",
             "Animated diagram: an oil change every 5,000 miles or 6 months. As the odometer moves from 40,000 to 45,200 miles, "
             "the forecast changes from OK to Due soon at 44,000 miles and to Overdue at 45,000 miles.")
    s += text(40, 56, "How the What's Next forecast works", size=28, weight=800)
    s += text(40, 84, "Each service on your schedule is due after its miles or its months, whichever comes first.", size=16, fill=MUTED)

    s += box(40, 110, 1120, 320, rx=18)
    s += text(70, 152, "Oil & Filter Change", size=20, weight=800)
    s += text(70, 178, "every 5,000 mi or 6 months · last done at 40,000 mi", size=15, fill=MUTED)

    # odometer
    ox, oy = 880, 128
    s += box(ox, oy, 250, 64, fill="#0b1220", stroke=LINE, rx=10)
    s += text(ox + 18, oy + 22, "ODOMETER", size=11, fill=DIM, weight=700, extra=' letter-spacing="1.5"')

    # bar
    x0, x1, by = 70, 1130, 270
    m0, m1 = 40000, 45600

    def mx(m):
        return x0 + (x1 - x0) * (m - m0) / (m1 - m0)

    s += f'<rect x="{x0}" y="{by}" width="{x1 - x0}" height="14" rx="7" fill="#1f2937"/>\n'
    s += f'<rect x="{mx(44000):.0f}" y="{by}" width="{mx(45000) - mx(44000):.0f}" height="14" fill="{AMBER}" opacity=".35"/>\n'
    s += f'<rect x="{mx(45000):.0f}" y="{by}" width="{x1 - mx(45000):.0f}" height="14" rx="0" fill="{RED}" opacity=".3"/>\n'
    for m in (40000, 41000, 42000, 43000, 44000, 45000):
        s += f'<line x1="{mx(m):.0f}" y1="{by + 18}" x2="{mx(m):.0f}" y2="{by + 26}" stroke="{DIM}"/>\n'
        s += text(mx(m), by + 44, f"{m:,}", size=13, fill=MUTED, anchor="middle")
    s += text(mx(44500), by - 38, "due soon: last 1,000 mi", size=12.5, fill=AMBER, anchor="middle")
    s += text(mx(45000) + 8, by - 38, "due at 45,000", size=12.5, fill="#fca5a5")

    # moving marker
    tA, tB = 0.6, 9.6
    endm = 45400

    def tm(m):
        return tA + (tB - tA) * (m - m0) / (endm - m0)

    path = f"M{x0} {by + 7} L{mx(endm):.0f} {by + 7}"
    marker = f'<circle r="13" fill="#fff" opacity=".25" filter="url(#glow)"/><circle r="9" fill="#fff"/><path d="M-5 -26 h10 l-5 9 z" fill="#fff"/>'
    s += L.move(marker, path, tA, tB, hold=T - tB - 0.6)
    fill_bar = f'<rect x="{x0}" y="{by}" width="0" height="14" rx="7" fill="{GREEN}" opacity=".55"><animate attributeName="width" values="0;0;{mx(endm) - x0:.0f};{mx(endm) - x0:.0f}" keyTimes="0;{L.k(tA):.4f};{L.k(tB):.4f};1" dur="{T}s" repeatCount="indefinite"/></rect>'
    s += L.shown(fill_bar, tA - 0.1, T - 0.6)

    # odometer readings (discrete)
    reads = list(range(40000, 45001, 500)) + [endm]
    for i, m in enumerate(reads):
        t0 = tm(m)
        t1 = tm(reads[i + 1]) if i + 1 < len(reads) else T - 0.6
        s += L.shown(text(ox + 232, oy + 50, f"{m:,} mi", size=24, weight=800, anchor="end", cls="mono"), t0, t1 - 0.02, fade=0.02)

    # status chip
    chx, chy = 70, 362
    s += text(chx, chy - 8, "STATUS", size=11, fill=DIM, weight=700, extra=' letter-spacing="1.5"')
    states = [(tA - 0.2, tm(44000), "OK", GREEN, "more than 1,000 mi to go"),
              (tm(44000), tm(45000), "Due soon", AMBER, "within 1,000 mi"),
              (tm(45000), T - 0.6, "Overdue", RED, "past 45,000 mi")]
    for t0, t1, lab, col, note in states:
        chip = (f'<rect x="{chx}" y="{chy}" width="130" height="34" rx="17" fill="{col}"/>'
                + text(chx + 65, chy + 23, lab, size=16, weight=800, fill="#fff", anchor="middle")
                + text(chx + 146, chy + 23, note, size=15, fill=MUTED))
        s += L.shown(chip, t0, t1 - 0.02, fade=0.08)
    s += text(560, 377, "Dates count too: six months after the last oil change,", size=14, fill=MUTED)
    s += text(560, 397, "it's overdue whatever the odometer says.", size=14, fill=MUTED)
    s += tail()
    return s


for name, fn in [("how-it-works", how_it_works), ("upload-pipeline", ingest), ("ask-aiana", ask), ("forecast", forecast)]:
    (OUT / f"{name}.svg").write_text(fn())
    print(name, len((OUT / f"{name}.svg").read_text()))
