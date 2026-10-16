"""증강 아이콘 그림의 특징값을 packages/core/data/aug-icons.bin 에 남긴다 (v3.66, 앱의 그림으로 증강 알아보기).
카드 제목·설명 글자를 못 읽은 카드는 아이콘 그림으로 찾는다. 아이콘마다 투명 부분을 검게 깐 밝기를 24×24 로 줄여 둔다.
형식: 증강마다 [ID u32 LE][밝기 576바이트]. 아이콘을 새로 받으면(npm run data:mayhem) 다시 돌린다:  python3 scripts/aug-icons.py
"""
import glob, os, struct
from PIL import Image

S = 24
out = bytearray()
n = 0
for p in sorted(glob.glob('packages/assets/public/img/aug/*.png'), key=lambda p: int(os.path.basename(p)[:-4])):
    im = Image.open(p).convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    g = bg.convert('L').resize((S, S), Image.BOX)
    out += struct.pack('<I', int(os.path.basename(p)[:-4])) + g.tobytes()
    n += 1
open('packages/core/data/aug-icons.bin', 'wb').write(bytes(out))
print(n, 'icons', len(out), 'bytes')
