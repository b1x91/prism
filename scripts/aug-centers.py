"""증강 아이콘의 '눈에 보이는 무늬' 중심을 재어 packages/core/data/aug-centers.json 에 남긴다 (v3.41).
게임 아이콘 그림은 무늬가 그림 가운데에 있지 않은 것이 많아, 고리 안에서 어긋나 보인다.
밝은 픽셀(무늬)의 밝기 가중 중심이 그림 가운데에서 얼마나 벗어났는지(그림 폭 대비 %)를 재고, 화면에서 반대로 옮긴다.
아이콘을 새로 받으면(npm run data:mayhem) 다시 돌린다:  python3 scripts/aug-centers.py
"""
import glob, json, os
from PIL import Image

out = {}
for p in sorted(glob.glob('packages/assets/public/img/aug/*.png')):
    im = Image.open(p).convert('RGBA')
    w, h = im.size
    px = im.load()
    sx = sy = t = 0.0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = (0.299 * r + 0.587 * g + 0.114 * b) * a / 255
            if lum > 110:  # 무늬(밝은 부분)만
                sx += x * lum; sy += y * lum; t += lum
    if not t:
        continue
    cx, cy = sx / t + 0.5, sy / t + 0.5
    dx = round((w / 2 - cx) / w * 100, 1)
    dy = round((h / 2 - cy) / h * 100, 1)
    # 너무 크게 옮기지 않는다 (그림이 고리 밖으로 나가지 않게)
    dx, dy = max(-8, min(8, dx)), max(-8, min(8, dy))
    if abs(dx) >= 1 or abs(dy) >= 1:
        out[os.path.basename(p)[:-4]] = [dx, dy]

with open('packages/core/data/aug-centers.json', 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print(len(out), 'icons shifted')
