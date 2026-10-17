"""증강 카드 화면 QA: 가상 게임 화면 만들기 (v3.67).

실제 증강 아이콘·이름·설명으로 증강 고르기 화면을 여러 모니터 조건에서 그린다.
- 해상도·화면 비율: 1280×720 ~ 3840×2160, 21:9·32:9 와이드
- 카드 위치: 가운데 · 왼쪽으로 치우침 · 오른쪽으로 치우침 (와이드 모니터에서 2장만 뜨던 원인)
- UI 크기 0.85~1.15배, 밝기 0.75~1.1배, 약한 흐림, 배경 잡음·HUD 글자
- 스킬 증강은 게임처럼 증강 아이콘 대신 다른 그림(챔프 초상)을 넣는다 → 그림 대조가 틀린 답을 내면 안 된다
같은 seed 면 늘 같은 화면이 나온다. 결과: <out>/NNN.png + <out>/cases.json

    python3 apps/desktop/qa/make_frames.py <out>       (Pillow, numpy, fonttools, brotli 필요)
"""
import json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
OUT = sys.argv[1] if len(sys.argv) > 1 else 'qa-frames'
os.makedirs(OUT, exist_ok=True)

A = [a for a in json.load(open(os.path.join(ROOT, 'packages/core/data/mayhem-augments.json')))['augments'] if not a.get('disabled')]
BY_RAR = {r: [a for a in A if a['rarity'] == r] for r in ('silver', 'gold', 'prismatic')}
CHAMPS = sorted(os.listdir(os.path.join(ROOT, 'packages/assets/public/img/champ')))

# 서체: Pretendard (저장소의 woff2 → ttf 로 한 번 풀어 둔다)
FONT_TTF = os.path.join(OUT, '_font.ttf')
if not os.path.exists(FONT_TTF):
    from fontTools.ttLib import TTFont
    f = TTFont(os.path.join(ROOT, 'packages/assets/public/fonts/PretendardVariable.woff2'))
    f.flavor = None
    f.save(FONT_TTF)


def font(px, bold=False):
    f = ImageFont.truetype(FONT_TTF, max(8, int(px)))
    try:
        f.set_variation_by_axes([700 if bold else 500])
    except Exception:
        pass
    return f


def wrap(draw, text, f, width):
    lines, cur = [], ''
    for ch in text.replace('\n', ' '):
        if draw.textlength(cur + ch, font=f) > width and cur:
            lines.append(cur)
            cur = ch.lstrip()
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def tint_icon(icon, rarity, rnd):
    """게임 카드처럼 아이콘에 색을 입힌다 (프리즘: 무지개, 골드: 금빛, 실버: 흰빛)"""
    a = np.asarray(icon.convert('RGBA'), dtype=np.float32) / 255.0
    lum = a[..., :3].mean(axis=2, keepdims=True)
    h, w = lum.shape[:2]
    if rarity == 'prismatic':
        t = np.linspace(0, 1, w)[None, :, None] + np.linspace(0, .5, h)[:, None, None] + rnd.random()
        col = np.concatenate([.6 + .4 * np.sin(2 * math.pi * (t + k / 3)) for k in range(3)], axis=2)
    elif rarity == 'gold':
        col = np.ones((h, w, 3)) * np.array([1.0, .82, .45])
    else:
        col = np.ones((h, w, 3)) * np.array([.92, .94, 1.0])
    rgb = np.clip(lum * col * 1.15, 0, 1)
    out = np.concatenate([rgb, a[..., 3:]], axis=2)
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA')


def background(W, H, rnd):
    """게임 맵처럼 알록달록한 배경 + HUD 글자"""
    g = np.random.default_rng(rnd.randrange(1 << 30))
    small = g.uniform([40, 30, 50], [210, 150, 220], (18, 32, 3))
    # 다섯 판에 한 판은 어두운 맵 (카드 바깥도 검은 편 — 카드 자리 찾기가 더 어렵다)
    if rnd.random() < .2:
        small *= .3
    img = Image.fromarray(small.astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(H / 60))
    d = ImageDraw.Draw(img)
    f = font(H * .018)
    hud = ['킬 12', '골드 8420', '아수라장', '레벨 14', '아군 구조물', '적 챔피언 처치', '보호막', '체력 회복']
    for _ in range(14):
        d.text((rnd.randrange(0, W - 200), rnd.choice([rnd.randrange(0, int(H * .08)), rnd.randrange(int(H * .82), H - 30)])), rnd.choice(hud), fill=(230, 230, 230), font=f)
    # 잔잔한 잡음
    n = (np.random.default_rng(rnd.randrange(1 << 30)).normal(0, 6, (H, W, 1))).astype(np.int16)
    arr = np.clip(np.asarray(img, dtype=np.int16) + n, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def draw_card(img, x, y, cw, chh, aug, rnd):
    d = ImageDraw.Draw(img)
    r = int(cw * .06)
    # 바깥 테두리 빛
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle((x - cw * .03, y - cw * .03, x + cw * 1.03, y + chh + cw * .03), r, fill=(200, 190, 255, 150))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(cw * .03)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x, y, x + cw, y + chh), r, fill=(196, 188, 236, 255))
    m = cw * .05
    ix0, iy0, ix1, iy1 = x + m, y + m, x + cw - m, y + chh - m
    d.rounded_rectangle((ix0, iy0, ix1, iy1), int(r * .7), fill=(10, 10, 18, 255), outline=(120, 110, 170, 255), width=max(1, int(cw * .008)))
    iw = ix1 - ix0
    # 아이콘 (스킬 증강은 게임처럼 다른 그림)
    size = int(iw * rnd.uniform(.5, .58))
    if aug.get('ability'):
        icon = Image.open(os.path.join(ROOT, 'packages/assets/public/img/champ', rnd.choice(CHAMPS))).convert('RGBA')
    else:
        icon = tint_icon(Image.open(os.path.join(ROOT, 'packages/assets/public/img/aug', f"{aug['id']}.png")), aug['rarity'], rnd)
    icon = icon.resize((size, size), Image.BICUBIC)
    img.alpha_composite(icon, (int(ix0 + (iw - size) / 2), int(iy0 + (iy1 - iy0) * .05)))
    # 제목 · 분류 칩 · 설명
    ty = iy0 + (iy1 - iy0) * .44
    ft = font(cw * .085, True)
    tw = d.textlength(aug['name'], font=ft)
    d.text((ix0 + (iw - tw) / 2, ty), aug['name'], fill=(245, 245, 250), font=ft)
    fc = font(cw * .045)
    chip = rnd.choice(['보조', '피해량', '저항', '일반', '유틸'])
    cwid = d.textlength(chip, font=fc) + cw * .04
    cy = ty + cw * .12
    d.rounded_rectangle((ix0 + (iw - cwid) / 2, cy, ix0 + (iw + cwid) / 2, cy + cw * .065), 3, fill=(70, 70, 90))
    d.text((ix0 + (iw - cwid) / 2 + cw * .02, cy + cw * .008), chip, fill=(220, 220, 230), font=fc)
    fd = font(cw * .052)
    dy = cy + cw * .11
    for line in wrap(d, aug['desc'][:90], fd, iw * .88)[:4]:
        lw = d.textlength(line, font=fd)
        d.text((ix0 + (iw - lw) / 2, dy), line, fill=(215, 215, 222), font=fd)
        dy += cw * .07
    # 카드 아래 다시 뽑기 버튼
    bw = cw * .22
    d.rounded_rectangle((x + (cw - bw) / 2, y + chh + cw * .1, x + (cw + bw) / 2, y + chh + cw * .25), 4, fill=(60, 55, 50), outline=(150, 130, 90))
    return (int(ix0), int(ix1), int(iy0), int(iy1))


def triple(rnd, rarity=None, force=None):
    rarity = rarity or rnd.choice(['silver', 'gold', 'prismatic'])
    pool = BY_RAR[rarity]
    pick = rnd.sample(pool, 3)
    if force:
        f = [a for a in A if a['id'] == force][0]
        pick = [a for a in rnd.sample(BY_RAR[f['rarity']], 3) if a['id'] != force][:2]
        pick.insert(rnd.randrange(3), f)
    return pick


RES = [(1280, 720), (1920, 1080), (2560, 1080), (2560, 1440), (3440, 1440), (3840, 2160), (5120, 1440)]
LAYOUT = [('center', 0.0), ('left', -1.0), ('right', 1.0)]
rnd = random.Random(int(os.environ.get("QA_SEED", "20261017")))
cases = []
plan = [(r, l, None) for r in RES for l in LAYOUT]
# 일부러 까다로운 증강: 그림이 같은 대마법사/유레카, 짧은 이름(흡수), 사용자 사진에서 빠졌던 보석 건틀릿, 긴 이름
for force in (2087, 1030, 2073, 1048, 1048):
    plan.append((rnd.choice(RES), rnd.choice(LAYOUT), force))
for k, ((W, H), (lname, lshift), force) in enumerate(plan):
    img = background(W, H, rnd).convert('RGBA')
    scale = rnd.uniform(.85, 1.15)
    cw, chh, gap = H * .215 * scale, H * .40 * scale, H * .07 * scale
    total = cw * 3 + gap * 2
    # 치우침: 와이드일수록 크게 (사진처럼 카드 묶음이 화면 한쪽에)
    spare = (W - total) / 2 - W * .1
    x0 = (W - total) / 2 + lshift * max(0, spare) * rnd.uniform(.5, 1.0)
    y0 = H * rnd.uniform(.15, .2)
    augs = triple(rnd, force=force)
    rects = []
    for i, a in enumerate(augs):
        rects.append(draw_card(img, x0 + i * (cw + gap), y0, cw, chh, a, rnd))
    out = img.convert('RGB')
    bright = rnd.uniform(.75, 1.1)
    out = Image.fromarray(np.clip(np.asarray(out, dtype=np.float32) * bright, 0, 255).astype(np.uint8))
    if rnd.random() < .5:
        out = out.filter(ImageFilter.GaussianBlur(rnd.uniform(.3, .7)))
    name = f'{k:03d}.png'
    out.save(os.path.join(OUT, name), optimize=False, compress_level=1)
    cases.append({'file': name, 'w': W, 'h': H, 'layout': lname, 'scale': round(scale, 2), 'bright': round(bright, 2),
                  'cards': [{'id': a['id'], 'name': a['name'], 'ability': bool(a.get('ability')), 'rect': r} for a, r in zip(augs, rects)]})
json.dump(cases, open(os.path.join(OUT, 'cases.json'), 'w'), ensure_ascii=False, indent=1)
print(len(cases), 'frames →', OUT)
