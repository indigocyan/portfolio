#!/usr/bin/env python3
"""Build the Nightswim typefaces used by the portfolio.

Nightswim is an original, ultra-condensed squared sans with corners chamfered along the slant,
drawn for this site in the spirit of heavy italic game-menu lettering. Glyphs are polygons on a
grid (no curves), written straight to TrueType with no third-party libraries, then packed to
WOFF2 with `woff2_compress` when it is available.

    python3 tools/make_fonts.py            # writes docs/fonts/nightswim-*.woff2 (and .ttf)

Two cuts, each upright and italic:
  Display  heavy strokes, tall caps    headings, menu words, giant titles, numbers
  Label    lighter strokes             tabs, tags, dates, prompts
Lowercase letters are small capitals (the same designs at a lower cap height).
"""
import math
import os
import shutil
import struct
import subprocess
import sys
import time

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'fonts')
UPM = 1000


# ------------------------------------------------------------------ geometry helpers
def box(x0, y0, x1, y1, tl=0, tr=0, br=0, bl=0):
    """Rectangle with optional chamfered corners (sizes in units)."""
    pts = [(x0 + bl, y0), (x1 - br, y0), (x1, y0 + br), (x1, y1 - tr), (x1 - tr, y1), (x0 + tl, y1), (x0, y1 - tl), (x0, y0 + bl)]
    out = []
    for p in pts:
        if not out or (abs(out[-1][0] - p[0]) > .01 or abs(out[-1][1] - p[1]) > .01):
            out.append(p)
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) < .01 and abs(out[0][1] - out[-1][1]) < .01:
        out.pop()
    return out


def leg(xb, yb, xt, yt, s):
    """A diagonal stroke as a parallelogram: left edge runs (xb,yb)->(xt,yt); horizontal width keeps
    the perpendicular thickness close to s."""
    dx, dy = xt - xb, yt - yb
    tw = s / math.cos(math.atan2(abs(dx), abs(dy)))
    return [(xb, yb), (xb + tw, yb), (xt + tw, yt), (xt, yt)], tw


def area(pts):
    a = 0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return a / 2


# ------------------------------------------------------------------ glyph designs
# Each design returns (width, [(points, is_hole), ...]) for a cut described by p:
#   W letter width, H cap height, s vertical stroke, t horizontal stroke, c chamfer.
def glyphs(p):
    W, H, s, t, c = p['W'], p['H'], p['s'], p['t'], p['c']
    M, h = W / 2, H / 2
    F = lambda pts: (pts, False)      # filled contour
    O = lambda pts: (pts, True)       # counter (hole)
    g = {}

    def bowl(x0, y0, x1, y1, ctr=c, cbl=c):
        return [F(box(x0, y0, x1, y1, tr=ctr, bl=cbl)), O(box(x0 + s, y0 + t, x1 - s, y1 - t, tr=ctr * .45, bl=cbl * .45))]

    # --- letters
    lw, _ = leg(0, 0, 0, H, s)
    a = s * .5
    L1, tw = leg(0, 0, M - s * .62 - a * .2, H, s)
    R1, _ = leg(W - tw, 0, M - s * .62 + a * .2, H, s)
    yb = H * .2
    xl = yb / H * (M - s * .62 - a * .2) + tw * .45
    g['A'] = (W, [F(L1), F(R1), F(box(xl, yb, W - xl, yb + t))])
    g['B'] = (W, [F(box(0, 0, W, H, tr=c, br=c * .6)), O(box(s, h + t * .5, W - s, H - t, tr=c * .45)), O(box(s, t, W - s, h - t * .5, br=c * .3))])
    g['C'] = (W, [F(box(0, H - t, W, H, tr=c)), F(box(0, 0, s, H)), F(box(0, 0, W, t, bl=c)), F(box(W - s, H * .68, W, H, tr=c)), F(box(W - s, 0, W, H * .3))])
    g['D'] = (W, [F(box(0, 0, W, H, tr=c * 1.4, br=c * .5)), O(box(s, t, W - s, H - t, tr=c * .6))])
    g['E'] = (W * .92, [F(box(0, 0, s, H)), F(box(0, H - t, W * .92, H, tr=c * .8)), F(box(0, 0, W * .92, t)), F(box(0, h - t / 2, W * .78, h + t / 2))])
    g['F'] = (W * .9, [F(box(0, 0, s, H)), F(box(0, H - t, W * .9, H, tr=c * .8)), F(box(0, h - t * .7, W * .76, h + t * .3))])
    g['G'] = (W, [F(box(0, H - t, W, H, tr=c)), F(box(0, 0, s, H)), F(box(0, 0, W, t, bl=c)), F(box(W - s, H * .7, W, H, tr=c)), F(box(W - s, 0, W, h + t * .2)), F(box(M - s * .1, h - t * .8, W, h + t * .2))])
    g['H'] = (W, [F(box(0, 0, s, H)), F(box(W - s, 0, W, H)), F(box(0, h - t / 2, W, h + t / 2))])
    g['I'] = (s, [F(box(0, 0, s, H))])
    g['J'] = (W, [F(box(W - s, 0, W, H)), F(box(0, 0, W, t, bl=c)), F(box(0, 0, s, H * .32)), F(box(W * .35, H - t, W, H))])
    up, tw = leg(s * .55, h - t * .2, W - s * 1.15, H, s * .95)
    dn, _ = leg(W - s * 1.15, 0, s * .55, h + t * .2, s * .95)
    g['K'] = (W, [F(box(0, 0, s, H)), F(up), F(dn)])
    g['L'] = (W * .86, [F(box(0, 0, s, H)), F(box(0, 0, W * .86, t, br=c * .5))])
    Wm = W * 1.32
    l1, tw = leg(s * .2, H, Wm / 2 - s * .62, H * .3, s * .95)
    r1, _ = leg(Wm - s * .2 - tw, H, Wm / 2 - s * .62, H * .3, s * .95)
    g['M'] = (Wm, [F(box(0, 0, s, H)), F(box(Wm - s, 0, Wm, H)), F(l1), F(r1)])
    d, tw = leg(W - s - s * .35, 0, s * .35, H, s * .95)
    g['N'] = (W, [F(box(0, 0, s, H)), F(box(W - s, 0, W, H)), F(d)])
    g['O'] = (W, bowl(0, 0, W, H))
    g['P'] = (W, [F(box(0, 0, s, H))] + bowl(0, H * .38, W, H, cbl=0))
    q, _ = leg(M, H * .26, W - s * .25, -s * .55, s * .85)
    g['Q'] = (W, bowl(0, 0, W, H) + [F(q)])
    rl, _ = leg(W - s * 1.12, 0, M - s * .55, H * .4, s)
    g['R'] = (W, [F(box(0, 0, s, H))] + bowl(0, H * .38, W, H, cbl=0) + [F(rl)])
    g['S'] = (W, [F(box(0, H - t, W, H, tr=c)), F(box(0, h - t / 2, s, H)), F(box(0, h - t / 2, W, h + t / 2)), F(box(W - s, 0, W, h + t / 2)),
                  F(box(0, 0, W, t, bl=c)), F(box(W - s, H * .7, W, H)), F(box(0, 0, s, H * .3))])
    g['T'] = (W, [F(box(0, H - t, W, H, tr=c)), F(box(M - s / 2, 0, M + s / 2, H))])
    g['U'] = (W, [F(box(0, 0, s, H)), F(box(W - s, 0, W, H)), F(box(0, 0, W, t * 1.05, bl=c))])
    v1, tw = leg(0, H, M - s * .6, 0, s)
    v2, _ = leg(W - tw, H, M - s * .6, 0, s)
    g['V'] = (W, [F(v1), F(v2)])
    Ww = W * 1.36
    w1, tw = leg(s * .2, 0, Ww / 2 - s * .62, H * .66, s * .95)
    w2, _ = leg(Ww - s * .2 - tw, 0, Ww / 2 - s * .62, H * .66, s * .95)
    g['W'] = (Ww, [F(box(0, 0, s, H)), F(box(Ww - s, 0, Ww, H)), F(w1), F(w2)])
    x1, tw = leg(0, 0, W - s * 1.15, H, s * .92)
    x2, _ = leg(W - tw, 0, 0, H, s * .92)
    g['X'] = (W, [F(x1), F(x2)])
    y1, tw = leg(0, H, M - s * .55, h, s * .95)
    y2, _ = leg(W - tw, H, M - s * .55, h, s * .95)
    g['Y'] = (W, [F(y1), F(y2), F(box(M - s / 2, 0, M + s / 2, h + t * .3))])
    z, _ = leg(W - s * 1.2, H - t, 0, t, s * .95)
    z = [(x, y) for x, y in z]
    zz, tw = leg(0, t, W - s * 1.25, H - t, s * .95)
    g['Z'] = (W, [F(box(0, H - t, W, H, tr=c)), F(box(0, 0, W, t, bl=c)), F(zz)])

    # --- digits (a touch narrower)
    D = W * .9
    g['0'] = (D, [F(box(0, 0, D, H, tr=c, bl=c)), O(box(s, t, D - s, H - t, tr=c * .45, bl=c * .45)), F(leg(s * .6, t * 1.1, D - s * 1.6, H - t * 1.1, s * .55)[0])])
    # a stem with a flag angled down-left from its top, no foot (so it never reads as a bracket)
    w1 = D * .62
    flag, _ = leg(0, H * .62, w1 - s - s * .2, H, s * .7)
    g['1'] = (w1, [F(box(w1 - s, 0, w1, H, tl=c * .4)), F(flag)])
    g['2'] = (D, [F(box(0, H - t, D, H, tr=c)), F(box(D - s, h - t / 2, D, H)), F(box(0, h - t / 2, D, h + t / 2)), F(box(0, 0, s, h)), F(box(0, 0, D, t, br=c * .5)), F(box(0, H * .7, s, H))])
    g['3'] = (D, [F(box(0, H - t, D, H, tr=c)), F(box(D - s, 0, D, H)), F(box(D * .22, h - t / 2, D, h + t / 2)), F(box(0, 0, D, t, bl=c))])
    g['4'] = (D, [F(box(0, H * .38, s, H)), F(box(0, H * .38, D, H * .38 + t)), F(box(D - s, 0, D, H * .82, tr=c * .5))])
    g['5'] = (D, [F(box(0, H - t, D, H, tr=c * .6)), F(box(0, h - t / 2, s, H)), F(box(0, h - t / 2, D, h + t / 2, tr=c * .5)), F(box(D - s, 0, D, h + t / 2)), F(box(0, 0, D, t, bl=c)), F(box(0, 0, s, H * .28))])
    g['6'] = (D, [F(box(0, 0, s, H)), F(box(0, H - t, D, H, tr=c)), F(box(0, h - t / 2, D, h + t / 2)), F(box(D - s, 0, D, h + t / 2)), F(box(0, 0, D, t, bl=c)), F(box(D - s, H * .72, D, H))])
    s7, _ = leg(D * .2, 0, D - s * 1.15, H - t, s * .95)
    g['7'] = (D, [F(box(0, H - t, D, H, tr=c)), F(s7), F(box(0, H * .72, s, H))])
    g['8'] = (D, [F(box(0, 0, D, H, tr=c, bl=c)), O(box(s, h + t * .5, D - s, H - t, tr=c * .45)), O(box(s, t, D - s, h - t * .5, bl=c * .45))])
    g['9'] = (D, [F(box(D - s, 0, D, H)), F(box(0, H - t, D, H, tr=c)), F(box(0, h - t / 2, D, h + t / 2)), F(box(0, h - t / 2, s, H)), F(box(0, 0, D, t, bl=c)), F(box(0, 0, s, H * .28))])

    # --- punctuation and symbols
    dot = s * .95
    g['.'] = (dot, [F(box(0, 0, dot, dot, tr=c * .4))])
    g[','] = (dot, [F(box(0, 0, dot, dot, tr=c * .4)), F(leg(-dot * .25, -dot * .75, dot * .35, 0, dot * .6)[0])])
    g[':'] = (dot, [F(box(0, 0, dot, dot, tr=c * .4)), F(box(0, H * .52, dot, H * .52 + dot, tr=c * .4))])
    g[';'] = (dot, [F(box(0, 0, dot, dot, tr=c * .4)), F(leg(-dot * .25, -dot * .75, dot * .35, 0, dot * .6)[0]), F(box(0, H * .52, dot, H * .52 + dot, tr=c * .4))])
    g['!'] = (dot, [F(box(0, H * .3, dot, H, tr=c * .4)), F(box(0, 0, dot, dot, tr=c * .4))])
    g['?'] = (D, [F(box(0, H - t, D, H, tr=c)), F(box(D - s, h - t * .3, D, H)), F(box(M * .7, h - t * .3, D, h + t * .7)), F(box(M * .7, H * .27, M * .7 + s, h)), F(box(M * .7, 0, M * .7 + dot, dot, tr=c * .4)), F(box(0, H * .72, s, H))])
    g["'"] = (dot * .8, [F(box(0, H * .66, dot * .8, H, tr=c * .3))])
    g['"'] = (dot * 1.9, [F(box(0, H * .66, dot * .8, H, tr=c * .3)), F(box(dot * 1.1, H * .66, dot * 1.9, H, tr=c * .3))])
    g['-'] = (W * .62, [F(box(0, H * .4, W * .62, H * .4 + t, tr=c * .4))])
    g['–'] = (W * 1.0, [F(box(0, H * .4, W, H * .4 + t, tr=c * .4))])
    g['—'] = (W * 1.6, [F(box(0, H * .4, W * 1.6, H * .4 + t, tr=c * .4))])
    g['_'] = (W, [F(box(0, -t * 1.4, W, -t * .4))])
    g['/'] = (W * .75, [F(leg(0, -H * .06, W * .75 - s * 1.05, H * 1.04, s * .9)[0])])
    g['|'] = (s * .7, [F(box(0, -H * .12, s * .7, H * 1.08))])
    g['('] = (W * .5, [F(box(0, -H * .08, s, H * 1.06, tl=c)), F(box(0, H * 1.06 - t, W * .5, H * 1.06)), F(box(0, -H * .08, W * .5, -H * .08 + t))])
    g[')'] = (W * .5, [F(box(W * .5 - s, -H * .08, W * .5, H * 1.06, br=c)), F(box(0, H * 1.06 - t, W * .5, H * 1.06)), F(box(0, -H * .08, W * .5, -H * .08 + t))])
    g['['] = g['(']
    g[']'] = g[')']
    g['+'] = (W * .8, [F(box(0, H * .38, W * .8, H * .38 + t)), F(box(W * .4 - s / 2, H * .15, W * .4 + s / 2, H * .61 + t))])
    g['='] = (W * .8, [F(box(0, H * .28, W * .8, H * .28 + t * .85)), F(box(0, H * .52, W * .8, H * .52 + t * .85))])
    g['·'] = (dot, [F(box(0, H * .4, dot, H * .4 + dot, tr=c * .4))])
    g['&'] = (W * 1.05, [F(box(0, 0, s, h + t / 2)), F(box(0, 0, W * .8, t, bl=c)), F(box(0, h - t / 2, W * .7, h + t / 2)), F(box(s * .35, h, s * .35 + s, H)), F(box(s * .35, H - t, W * .75, H, tr=c)),
                         F(box(W * .75 - s, h + t / 2, W * .75, H)), F(box(W * 1.05 - s, 0, W * 1.05, h * .9))])
    g['#'] = (W, [F(box(W * .18, 0, W * .18 + s * .8, H)), F(box(W * .82 - s * .8, 0, W * .82, H)), F(box(0, H * .3, W, H * .3 + t * .8)), F(box(0, H * .62, W, H * .62 + t * .8))])
    g['%'] = (W * 1.2, [F(box(0, H * .62, W * .38, H, tr=c * .5)), O(box(s * .6, H * .62 + t * .7, W * .38 - s * .6, H - t * .7)),
                        F(box(W * .82, 0, W * 1.2, H * .38, bl=c * .5)), O(box(W * .82 + s * .6, t * .7, W * 1.2 - s * .6, H * .38 - t * .7)),
                        F(leg(W * .12, 0, W * .95, H, s * .7)[0])])
    g['@'] = (W * 1.2, [F(box(0, 0, W * 1.2, H, tr=c, bl=c)), O(box(s * .8, t * .8, W * 1.2 - s * .8, H - t * .8, tr=c * .4, bl=c * .4)),
                        F(box(W * .35, H * .3, W * .95, H * .7, bl=c * .3)), O(box(W * .35 + s * .7, H * .3 + t * .7, W * .95 - s * .7, H * .7 - t * .7)), F(box(W * .95 - s * .7, H * .2, W * 1.2 - s * .5, H * .7))])
    star = []
    for i in range(8):
        r = H * .42 if i % 2 == 0 else H * .1
        ang = math.pi / 2 + i * math.pi / 4
        star.append((W * .5 + math.cos(ang) * r, H * .45 + math.sin(ang) * r))
    g['✦'] = (W, [F(star)])
    g[' '] = (W * .48, [])
    g[' '] = g[' ']
    return g


# ------------------------------------------------------------------ real lowercase (Text cut)
# Mixed-case letters for reading, after the slanted, sharp-cornered names in the game's social-link
# list: octagonal bowls (all four corners chamfered), open apertures, short ascenders/descenders.
#   X x-height, A ascender, Dd descender (negative), wl letter width
def lower_glyphs(p):
    s, t, c = p['s'], p['t'], p['c']
    X, A, Dd, wl = p['X'], p['A'], p['Dd'], p['wl']
    F = lambda pts: (pts, False)
    O = lambda pts: (pts, True)
    k = c * .8                                   # chamfer on bowls

    def bowl(x0, y0, x1, y1):
        return [F(box(x0, y0, x1, y1, tl=k, tr=k, br=k, bl=k)), O(box(x0 + s, y0 + t, x1 - s, y1 - t, tl=k * .4, tr=k * .4, br=k * .4, bl=k * .4))]

    g = {}
    M = wl / 2
    # two-storey a: a top arch over a smaller bowl, so it never reads as o
    g['a'] = (wl, [F(box(0, X - t, wl, X, tl=k * .6, tr=k)), F(box(wl - s, 0, wl, X, tr=k))] + bowl(0, 0, wl, X * .6))
    g['b'] = (wl, [F(box(0, 0, s, A))] + bowl(0, 0, wl, X))
    g['c'] = (wl * .92, [F(box(0, X - t, wl * .92, X, tl=k, tr=k * .5)), F(box(0, 0, s, X, tl=k, bl=k)), F(box(0, 0, wl * .92, t, bl=k, br=k * .5))])
    g['d'] = (wl, bowl(0, 0, wl, X) + [F(box(wl - s, 0, wl, A))])
    g['e'] = (wl, [F(box(0, X - t, wl, X, tl=k, tr=k)), F(box(0, 0, s, X, tl=k, bl=k)), F(box(0, 0, wl * .95, t, bl=k, br=k * .5)),
                   F(box(wl - s, X * .45, wl, X, tr=k)), F(box(0, X * .45, wl, X * .45 + t * .9))])
    fx = wl * .16
    g['f'] = (wl * .72, [F(box(fx, 0, fx + s, A, tl=k)), F(box(fx, A - t, wl * .72, A, tl=k, tr=k * .4)), F(box(0, X - t, wl * .64, X))])
    g['g'] = (wl, bowl(0, t * .2, wl, X) + [F(box(wl - s, Dd + t, wl, X)), F(box(0, Dd, wl, Dd + t, bl=k, br=k)), F(box(0, Dd, s, Dd + t * 2.2, bl=k))])
    g['h'] = (wl, [F(box(0, 0, s, A)), F(box(0, X - t, wl, X, tr=k)), F(box(wl - s, 0, wl, X, tr=k))])
    dot = s * 1.0
    g['i'] = (s, [F(box(0, 0, s, X)), F(box(0, X + t * .9, s, X + t * .9 + dot, tr=k * .4))])
    jx = wl * .35
    g['j'] = (jx + s, [F(box(jx, Dd + t, jx + s, X)), F(box(0, Dd, jx + s, Dd + t, bl=k, br=k)), F(box(jx, X + t * .9, jx + s, X + t * .9 + dot, tr=k * .4))])
    up, _ = leg(s * .5, X * .38, wl - s * 1.15, X, s * .9)
    dn, _ = leg(wl - s * 1.15, 0, s * .75, X * .55, s * .9)
    g['k'] = (wl * .96, [F(box(0, 0, s, A)), F(up), F(dn)])
    g['l'] = (s * 1.9, [F(box(0, 0, s, A)), F(box(0, 0, s * 1.9, t, br=k * .5))])
    wm = wl * 1.52
    g['m'] = (wm, [F(box(0, 0, s, X)), F(box(0, X - t, wm, X, tr=k)), F(box(wm / 2 - s / 2, 0, wm / 2 + s / 2, X)), F(box(wm - s, 0, wm, X, tr=k))])
    g['n'] = (wl, [F(box(0, 0, s, X)), F(box(0, X - t, wl, X, tr=k)), F(box(wl - s, 0, wl, X, tr=k))])
    g['o'] = (wl, bowl(0, 0, wl, X))
    g['p'] = (wl, [F(box(0, Dd, s, X))] + bowl(0, 0, wl, X))
    g['q'] = (wl, [F(box(wl - s, Dd, wl, X))] + bowl(0, 0, wl, X))
    g['r'] = (wl * .74, [F(box(0, 0, s, X)), F(box(0, X - t, wl * .74, X, tr=k))])
    g['s'] = (wl * .92, [F(box(0, X - t, wl * .92, X, tl=k, tr=k * .5)), F(box(0, X / 2 - t / 2, s, X, tl=k)), F(box(0, X / 2 - t / 2, wl * .92, X / 2 + t / 2)),
                         F(box(wl * .92 - s, 0, wl * .92, X / 2 + t / 2, br=k)), F(box(0, 0, wl * .92, t, bl=k * .5, br=k))])
    tx = wl * .16
    g['t'] = (wl * .72, [F(box(tx, 0, tx + s, A * .9, tl=k * .5)), F(box(0, X - t, wl * .68, X)), F(box(tx, 0, wl * .72, t, bl=k, br=k * .4))])
    g['u'] = (wl, [F(box(0, 0, s, X, bl=k)), F(box(0, 0, wl, t, bl=k)), F(box(wl - s, 0, wl, X))])
    v1, tw = leg(0, X, M - s * .58, 0, s * .95)
    v2, _ = leg(wl - tw, X, M - s * .58, 0, s * .95)
    g['v'] = (wl, [F(v1), F(v2)])
    ww = wl * 1.45
    w1, tw = leg(0, X, ww * .25 - s * .5, 0, s * .9)
    w2, _ = leg(ww / 2 - tw / 2, X * .82, ww * .25 - s * .5, 0, s * .9)
    w3, _ = leg(ww / 2 - tw / 2, X * .82, ww * .75 - s * .5, 0, s * .9)
    w4, _ = leg(ww - tw, X, ww * .75 - s * .5, 0, s * .9)
    g['w'] = (ww, [F(w1), F(w2), F(w3), F(w4)])
    x1, tw = leg(0, 0, wl - s * 1.15, X, s * .9)
    x2, _ = leg(wl - tw, 0, 0, X, s * .9)
    g['x'] = (wl, [F(x1), F(x2)])
    y1, tw = leg(0, X, M - s * .58, 0, s * .95)
    y2, _ = leg(wl - tw, X, s * .1, Dd, s * .95)
    g['y'] = (wl, [F(y1), F(y2)])
    z, _ = leg(0, t, wl - s * 1.2, X - t, s * .9)
    g['z'] = (wl * .92, [F(box(0, X - t, wl * .92, X, tr=k * .5)), F(box(0, 0, wl * .92, t, bl=k * .5)), F([(x * .92, y) for x, y in z])])
    return g


# ------------------------------------------------------------------ build a cut
def build_cut(cut):
    base = glyphs(cut)
    small = lower_glyphs(cut) if cut.get('lower') else None
    if small is None:
        smallcaps = glyphs({**cut, 'H': cut['H'] * cut['sc'], 'W': cut['W'] * .96})
        small = {ch: smallcaps[ch.upper()] for ch in 'abcdefghijklmnopqrstuvwxyz'}
    shear = math.tan(math.radians(cut['slant'])) if cut['italic'] else 0
    sb = cut['s'] * cut['sb']
    order = ['.notdef'] + [k for k in base]
    for ch in 'abcdefghijklmnopqrstuvwxyz':
        order.append(ch)
    out = []
    for name in order:
        if name == '.notdef':
            w = cut['W'] * .8
            contours = [(box(0, 0, w, cut['H']), False), (box(cut['s'] * .4, cut['s'] * .4, w - cut['s'] * .4, cut['H'] - cut['s'] * .4), True)]
            cp = None
        elif len(name) == 1 and 'a' <= name <= 'z':
            w, contours = small[name]
            cp = ord(name)
        else:
            w, contours = base[name]
            cp = ord(name)
        pts_all = []
        for pts, hole in contours:
            moved = [(x + sb + y * shear, y) for x, y in pts]
            a = area(moved)
            # TrueType: filled contours clockwise (negative area with y up), counters anticlockwise
            if (not hole and a > 0) or (hole and a < 0):
                moved = moved[::-1]
            pts_all.append([(round(x), round(y)) for x, y in moved])
        adv = round(w + sb * 2) if name != ' ' else round(w)
        out.append({'name': name, 'cp': cp, 'adv': adv, 'contours': pts_all})
    # map no-break space to the space glyph too
    return out


# ------------------------------------------------------------------ TrueType writer
def checksum(data):
    data += b'\0' * ((4 - len(data) % 4) % 4)
    return sum(struct.unpack('>%dI' % (len(data) // 4), data)) & 0xFFFFFFFF


def glyf_entry(contours):
    if not contours:
        return b'', (0, 0, 0, 0), 0
    xs = [x for c in contours for x, _ in c]
    ys = [y for c in contours for _, y in c]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    ends, n = [], -1
    for c in contours:
        n += len(c)
        ends.append(n)
    flags, xd, yd = bytearray(), bytearray(), bytearray()
    px = py = 0
    first = True
    for c in contours:
        for x, y in c:
            f = 0x01                              # on-curve, 16-bit deltas
            if first:
                f |= 0x40                         # OVERLAP_SIMPLE: contours may overlap
                first = False
            flags.append(f)
            xd += struct.pack('>h', x - px)
            yd += struct.pack('>h', y - py)
            px, py = x, y
    data = struct.pack('>hhhhh', len(contours), *bbox) + b''.join(struct.pack('>H', e) for e in ends) + struct.pack('>H', 0) + bytes(flags) + bytes(xd) + bytes(yd)
    return data, bbox, n + 1


def name_table(family, style, full, ps, version):
    recs = {
        0: 'Original design for this portfolio. Free to use with the site.',
        1: family, 2: style, 3: f'{ps};{version}', 4: full, 5: f'Version {version}', 6: ps,
    }
    strings, records, off = b'', [], 0
    for nid in sorted(recs):
        s = recs[nid].encode('utf-16-be')
        records.append(struct.pack('>HHHHHH', 3, 1, 0x409, nid, len(s), off))
        strings += s
        off += len(s)
    return struct.pack('>HHH', 0, len(records), 6 + 12 * len(records)) + b''.join(records) + strings


def cmap_table(mapping):
    codes = sorted(c for c in mapping if c <= 0xFFFF)
    segs = [(c, c, (mapping[c] - c) & 0xFFFF) for c in codes] + [(0xFFFF, 0xFFFF, 1)]
    n = len(segs)
    sr = 2 * (2 ** int(math.log2(n)))
    es = int(math.log2(sr // 2))
    rs = 2 * n - sr
    body = struct.pack('>HHHH', n * 2, sr, es, rs)
    body += b''.join(struct.pack('>H', e) for _, e, _ in segs) + struct.pack('>H', 0)
    body += b''.join(struct.pack('>H', s) for s, _, _ in segs)
    body += b''.join(struct.pack('>H', d) for _, _, d in segs)
    body += b''.join(struct.pack('>H', 0) for _ in segs)
    sub = struct.pack('>HHH', 4, 6 + len(body), 0) + body
    return struct.pack('>HH', 0, 2) + struct.pack('>HHI', 0, 3, 4 + 16) + struct.pack('>HHI', 3, 1, 4 + 16) + sub


def write_ttf(glyph_list, cut, path):
    family = cut['family']
    style = ' '.join(w for w in ('Bold' if cut['bold'] and cut.get('lower') else '', 'Italic' if cut['italic'] else '') if w) or 'Regular'
    ps = (family + '-' + style).replace(' ', '')
    full = family + ('' if style == 'Regular' else ' ' + style)
    glyf, loca, metrics = b'', [], []
    xmin = ymin = 10 ** 6
    xmax = ymax = -10 ** 6
    max_pts = max_ctr = 0
    min_lsb = min_rsb = 10 ** 6
    max_ext = 0
    for gl in glyph_list:
        data, bbox, npts = glyf_entry(gl['contours'])
        loca.append(len(glyf))
        glyf += data + b'\0' * ((4 - len(data) % 4) % 4)
        lsb = bbox[0] if gl['contours'] else 0
        metrics.append((gl['adv'], lsb))
        if gl['contours']:
            xmin, ymin, xmax, ymax = min(xmin, bbox[0]), min(ymin, bbox[1]), max(xmax, bbox[2]), max(ymax, bbox[3])
            max_pts, max_ctr = max(max_pts, npts), max(max_ctr, len(gl['contours']))
            min_lsb = min(min_lsb, bbox[0])
            min_rsb = min(min_rsb, gl['adv'] - bbox[2])
            max_ext = max(max_ext, bbox[2])
    loca.append(len(glyf))
    n = len(glyph_list)
    mapping = {g['cp']: i for i, g in enumerate(glyph_list) if g['cp'] is not None}
    mapping[0xA0] = mapping[0x20]
    asc, desc = cut['asc'], cut['desc']
    italic = cut['italic']
    now = int(time.time()) + 2082844800
    head = struct.pack('>IIIIHHqqhhhhHHhhh', 0x00010000, 0x00010000, 0, 0x5F0F3CF5, 0b1001, UPM, now, now,
                       xmin, ymin, xmax, ymax, (2 if italic else 0) | (1 if cut['bold'] else 0), 8, 2, 1, 0)
    rise, run = (1000, round(1000 * math.tan(math.radians(cut['slant'])))) if italic else (1, 0)
    hhea = struct.pack('>IhhhHhhhhhhhhhhhH', 0x00010000, asc, -desc, 0, max(a for a, _ in metrics), min_lsb, min_rsb, max_ext,
                       rise, run, 0, 0, 0, 0, 0, 0, n)
    maxp = struct.pack('>IHHHHHHHHHHHHHH', 0x00010000, n, max_pts, max_ctr, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)
    avg = round(sum(a for a, _ in metrics if a) / max(1, sum(1 for a, _ in metrics if a)))
    fs_sel = (0x01 if italic else 0) | (0x20 if cut['bold'] else 0) | (0x40 if not italic and not cut['bold'] else 0) | 0x80
    codes = [c for c in mapping]
    os2 = struct.pack('>HhHHH10hh10s4I4sHHHhhhHHIIhhHHH', 4, avg, cut['weight'], 2, 0,
                      650, 600, 0, 75, 650, 600, 0, 350, 50, 300, 0, bytes([2, 11, 8, 6, 3, 5, 2, 9, 2, 4]),
                      0b11, 0, 0, 0, b'NSWM', fs_sel, min(codes), min(max(codes), 0xFFFF),
                      asc, -desc, 0, max(asc, ymax), max(desc, -ymin), 1, 0, round(cut['H'] * cut['sc']), cut['H'], 0, 0x20, 1)
    hmtx = b''.join(struct.pack('>Hh', a, l) for a, l in metrics)
    post = struct.pack('>IihhIIIII', 0x00030000, round(-cut['slant'] * 65536) if italic else 0, -120, 60, 0, 0, 0, 0, 0)
    locab = b''.join(struct.pack('>I', o) for o in loca)
    tables = {
        b'OS/2': os2, b'cmap': cmap_table(mapping), b'glyf': glyf, b'head': head, b'hhea': hhea, b'hmtx': hmtx,
        b'loca': locab, b'maxp': maxp, b'name': name_table(family, style, full, ps, '1.000'), b'post': post,
    }
    tags = sorted(tables)
    nt = len(tags)
    sr = 16 * (2 ** int(math.log2(nt)))
    hdr = struct.pack('>IHHHH', 0x00010000, nt, sr, int(math.log2(sr // 16)), nt * 16 - sr)
    offset = 12 + 16 * nt
    dirs, blob = b'', b''
    for tag in tags:
        data = tables[tag]
        dirs += struct.pack('>4sIII', tag, checksum(data), offset + len(blob), len(data))
        blob += data + b'\0' * ((4 - len(data) % 4) % 4)
    font = bytearray(hdr + dirs + blob)
    adj = (0xB1B0AFBA - checksum(bytes(font))) & 0xFFFFFFFF
    hoff = struct.unpack('>I', dirs[tags.index(b'head') * 16 + 8: tags.index(b'head') * 16 + 12])[0]
    font[hoff + 8: hoff + 12] = struct.pack('>I', adj)
    with open(path, 'wb') as f:
        f.write(font)


CUTS = [
    # Display: heavy, tall, tight
    dict(family='Nightswim Display', file='nightswim-display', W=330, H=760, s=126, t=110, c=58, sc=.78, sb=.26, asc=900, desc=210, weight=900, bold=True, slant=12),
    # Label: lighter strokes, a little wider for small sizes
    dict(family='Nightswim Label', file='nightswim-label', W=300, H=700, s=82, t=74, c=40, sc=.8, sb=.34, asc=880, desc=220, weight=700, bold=True, slant=12),
    # Text: real lowercase for information-heavy copy, regular and bold
    dict(family='Nightswim Text', file='nightswim-text', lower=True, W=430, H=700, X=500, A=735, Dd=-205, wl=385, s=88, t=78, c=44, sc=.8, sb=.52,
         asc=920, desc=250, weight=400, bold=False, slant=9),
    dict(family='Nightswim Text', file='nightswim-text-bold', lower=True, W=450, H=700, X=505, A=735, Dd=-205, wl=400, s=118, t=104, c=50, sc=.8, sb=.44,
         asc=920, desc=250, weight=700, bold=True, slant=9),
]

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    have_woff2 = shutil.which('woff2_compress')
    for cut in CUTS:
        for italic in (False, True):
            c = {**cut, 'italic': italic}
            path = os.path.join(OUT, cut['file'] + ('-italic' if italic else '') + '.ttf')
            write_ttf(build_cut(c), c, path)
            if have_woff2:
                subprocess.run(['woff2_compress', path], check=True, stdout=subprocess.DEVNULL)
                os.remove(path)          # the site only serves the .woff2
            print('wrote', os.path.relpath(path), '+ .woff2' if have_woff2 else '')
    if not have_woff2:
        print('woff2_compress not found: only .ttf files were written', file=sys.stderr)
