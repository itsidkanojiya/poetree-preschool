"""Turning the sheet's dots into characters, and characters into strokes.

The school's handwriting sheet (source.pdf) draws every letter as a run of
separate dots, placed evenly along the letter's centre line. The PDF keeps no
order worth using — dots from two strokes arrive interleaved — so everything
here works from positions alone.
"""
import math


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def bbox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


# --- characters ---------------------------------------------------------------

def clusters(points, eps):
    """Groups of dots joined by gaps no wider than eps."""
    n = len(points)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    buckets = {}
    for k, (x, y) in enumerate(points):
        buckets.setdefault((int(x // eps), int(y // eps)), []).append(k)
    for k, (x, y) in enumerate(points):
        bx, by = int(x // eps), int(y // eps)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in buckets.get((bx + dx, by + dy), []):
                    if j > k and dist(points[j], (x, y)) <= eps:
                        parent[find(j)] = find(k)
    groups = {}
    for k in range(n):
        groups.setdefault(find(k), []).append(points[k])
    return list(groups.values())


def rows(groups):
    """Groups gathered into lines of writing, top to bottom."""
    groups = sorted(groups, key=lambda g: (bbox(g)[1] + bbox(g)[3]) / 2)
    out = []
    for g in groups:
        b = bbox(g)
        cy = (b[1] + b[3]) / 2
        for row in out:
            if row['y0'] - 6 <= cy <= row['y1'] + 6:
                row['groups'].append(g)
                row['y0'] = min(row['y0'], b[1])
                row['y1'] = max(row['y1'], b[3])
                break
        else:
            out.append({'y0': b[1], 'y1': b[3], 'groups': [g]})
    out.sort(key=lambda r: r['y0'])
    return out


def characters(points, column_gap):
    """Every character on a page, in reading order, with its line's baseline.

    Pieces of one character (the dot of an i, a visarga, the curl of ई) sit
    within [column_gap] of each other across the line and are joined.
    """
    out = []
    for row in rows(clusters(points, 6.0)):
        items = sorted(row['groups'], key=lambda g: bbox(g)[0])
        merged = []
        for g in items:
            b = bbox(g)
            if merged:
                lb = bbox(merged[-1])
                cx, lcx = (b[0] + b[2]) / 2, (lb[0] + lb[2]) / 2
                if b[0] <= lb[2] + 2 or abs(cx - lcx) < column_gap:
                    merged[-1] = merged[-1] + g
                    continue
            merged.append(list(g))
        bottoms = sorted(bbox(g)[3] for g in merged)
        baseline = bottoms[len(bottoms) // 2]
        out.extend({'dots': g, 'baseline': baseline} for g in merged)
    return out


# --- strokes ------------------------------------------------------------------

def spacing(points):
    gaps = []
    for i, p in enumerate(points):
        best = min((dist(p, q) for j, q in enumerate(points) if j != i), default=0)
        if best > 0:
            gaps.append(best)
    gaps.sort()
    return gaps[len(gaps) // 2] if gaps else 1.0


def dedupe(points, s):
    out = []
    for p in points:
        if all(dist(p, q) > s * 0.35 for q in out):
            out.append(p)
    return out


def neighbours(points, s):
    adj = {i: set() for i in range(len(points))}
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            if dist(points[i], points[j]) <= s * 1.5:
                adj[i].add(j)
                adj[j].add(i)
    # In a triangle of links keep the two short sides: the long one is a
    # shortcut across a bend, not part of the line.
    changed = True
    while changed:
        changed = False
        for a in list(adj):
            for b in list(adj[a]):
                if b <= a:
                    continue
                for c in adj[a] & adj[b]:
                    sides = sorted([(dist(points[a], points[b]), a, b),
                                    (dist(points[a], points[c]), a, c),
                                    (dist(points[b], points[c]), b, c)])
                    if sides[2][0] > sides[1][0] * 1.15:
                        u, v = sides[2][1], sides[2][2]
                        if v in adj[u]:
                            adj[u].discard(v)
                            adj[v].discard(u)
                            changed = True
    return adj


def walk_segments(points, adj):
    """Runs of dots between junctions (dots with 3+ links) and ends."""
    junction = {i for i in adj if len(adj[i]) > 2}
    group = {}
    for j in junction:
        if j in group:
            continue
        stack = [j]
        group[j] = j
        while stack:
            k = stack.pop()
            for m in adj[k]:
                if m in junction and m not in group:
                    group[m] = j
                    stack.append(m)
    centre = {}
    for root in set(group.values()):
        members = [k for k in group if group[k] == root]
        centre[root] = (sum(points[k][0] for k in members) / len(members),
                        sum(points[k][1] for k in members) / len(members))

    used = set()

    def key(a, b):
        return (min(a, b), max(a, b))

    segs = []
    for s0 in [i for i in adj if i in junction or len(adj[i]) != 2]:
        for n in adj[s0]:
            if key(s0, n) in used:
                continue
            used.add(key(s0, n))
            if s0 in junction and n in junction and group[s0] == group[n]:
                continue
            path = [s0, n]
            prev, cur = s0, n
            while cur not in junction and len(adj[cur]) == 2:
                nxt = [m for m in adj[cur] if m != prev][0]
                if key(cur, nxt) in used:
                    break
                used.add(key(cur, nxt))
                path.append(nxt)
                prev, cur = cur, nxt
            segs.append(path)
    for i in adj:
        for n in adj[i]:
            if key(i, n) in used:
                continue
            path = [i, n]
            used.add(key(i, n))
            prev, cur = i, n
            while True:
                nxt = [m for m in adj[cur] if m != prev]
                if not nxt:
                    break
                nxt = nxt[0]
                path.append(nxt)
                if key(cur, nxt) in used:
                    break
                used.add(key(cur, nxt))
                prev, cur = cur, nxt
            segs.append(path)

    out = []
    for path in segs:
        pts = [points[k] for k in path]
        if path[0] in group:
            pts[0] = centre[group[path[0]]]
        if path[-1] in group:
            pts[-1] = centre[group[path[-1]]]
        out.append({'pts': pts, 'ends': (group.get(path[0]), group.get(path[-1]))})
    isolated = [points[i] for i in adj if not adj[i]]
    return out, isolated


def heading_out(pts, at_start):
    seq = pts if at_start else pts[::-1]
    a, b = seq[0], seq[min(3, len(seq) - 1)]
    v = (a[0] - b[0], a[1] - b[1])
    n = math.hypot(*v)
    return (v[0] / n, v[1] / n) if n else (0.0, 0.0)


def join_straight_through(segs):
    """At a junction, the two segments that carry straight on are one line."""
    changed = True
    while changed:
        changed = False
        at = {}
        for k, seg in enumerate(segs):
            for end, j in enumerate(seg['ends']):
                if j is not None:
                    at.setdefault(j, []).append((k, end))
        for touching in at.values():
            best = None
            for x in range(len(touching)):
                for y in range(x + 1, len(touching)):
                    (ka, ea), (kb, eb) = touching[x], touching[y]
                    if ka == kb:
                        continue
                    da = heading_out(segs[ka]['pts'], ea == 0)
                    db = heading_out(segs[kb]['pts'], eb == 0)
                    straight = -(da[0] * db[0] + da[1] * db[1])
                    if straight > math.cos(math.radians(30)) and (best is None or straight > best[0]):
                        best = (straight, ka, ea, kb, eb)
            if best:
                _, ka, ea, kb, eb = best
                a, b = segs[ka], segs[kb]
                a_pts = a['pts'] if ea == 1 else a['pts'][::-1]
                a_end = a['ends'][0] if ea == 1 else a['ends'][1]
                b_pts = b['pts'] if eb == 0 else b['pts'][::-1]
                b_end = b['ends'][1] if eb == 0 else b['ends'][0]
                segs = [s for k, s in enumerate(segs) if k not in (ka, kb)]
                segs.append({'pts': a_pts + b_pts[1:], 'ends': (a_end, b_end)})
                changed = True
                break
    return segs


def turn(a, b, c):
    v1 = (b[0] - a[0], b[1] - a[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    n1, n2 = math.hypot(*v1), math.hypot(*v2)
    if n1 == 0 or n2 == 0:
        return 0.0
    cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def split_corners(line, limit):
    """Cut a line where it turns sharply — where a pen would stop."""
    if len(line) < 5:
        return [line]
    cuts = []
    for i in range(2, len(line) - 2):
        angle = turn(line[i - 2], line[i], line[i + 2])
        if angle > limit:
            if cuts and i - cuts[-1][0] <= 2:
                if angle > cuts[-1][1]:
                    cuts[-1] = (i, angle)
                continue
            cuts.append((i, angle))
    out, start = [], 0
    for i, _ in cuts:
        out.append(line[start:i + 1])
        start = i
    out.append(line[start:])
    return [piece for piece in out if len(piece) >= 2]


def strokes(dots, corner=62):
    """The pen strokes of one character, in sheet units, unordered.

    Where two lines cross or meet the straight-through pair stays one line.
    A lone dot away from every line is a dot to tap (the dot of an i, an
    anusvara, a nukta).
    """
    points = dedupe(list(dots), spacing(list(dots)))
    s = spacing(points)
    segs, isolated = walk_segments(points, neighbours(points, s))
    segs = join_straight_through(segs)
    lines = []
    for seg in segs:
        if len(seg['pts']) >= 2:
            lines.extend(split_corners(seg['pts'], corner) if corner else [seg['pts']])
    for p in isolated:
        if not lines or min(dist(p, q) for l in lines for q in l) > s * 1.8:
            lines.append([p])
    return lines, s


# --- order and direction ------------------------------------------------------

def orient(line, height):
    """Which way a child draws a line: down, rightwards, or from its top end."""
    if len(line) < 2:
        return line
    a, b = line[0], line[-1]
    if dist(a, b) < height * 0.05:
        return line  # a loop: as found, from its top
    dx, dy = b[0] - a[0], b[1] - a[1]
    if abs(dx) > abs(dy) * 2:
        return line if dx >= 0 else line[::-1]          # across: left to right
    # everything else starts at the higher end; level ends start on the left
    if abs(dy) < height * 0.12:
        return line if a[0] <= b[0] else line[::-1]
    return line if a[1] <= b[1] else line[::-1]


def order(lines, height, has_header):
    """The order to trace in: the body left to right, then any upright
    line, then the headline, then dots."""
    x0 = min(p[0] for l in lines for p in l)
    y0 = min(p[1] for l in lines for p in l)
    x1 = max(p[0] for l in lines for p in l)

    def kind(line):
        if len(line) == 1:
            return 4
        xs = [p[0] for p in line]
        ys = [p[1] for p in line]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        top = min(ys) - y0
        if has_header and w > (x1 - x0) * 0.35 and h < height * 0.08 and top < height * 0.1:
            return 3
        if h > height * 0.5 and w < height * 0.08:
            return 2
        return 1

    return sorted(lines, key=lambda l: (kind(l), min(p[0] for p in l), min(p[1] for p in l)))
