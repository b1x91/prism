# 계정마다 랭킹 줄 시뮬레이션 씨앗 (v3.161) — 0044 적용 '전' 모습(participants.puuid·member_accounts.deco 비어 있음)
# 사용: python3 gen.py <출력 seed.sql>
import json, random, sys, time
random.seed(7)
NOW = int(time.time() * 1000)
DAY = 86400000
A = '426955675592163329'
sql = []
def q(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"
def member(mid, nick, puuid, roles=None, deco=None, opt=True):
    sql.append(f"INSERT INTO members (id, discord_name, nick, tier, joined_at, last_seen_at, riot_puuid, riot_id, opt_in_at, discord_roles, deco) VALUES ({q(mid)},{q(nick)},{q(nick)},'guest',{NOW-60*DAY},{NOW},{q(puuid)},{q(nick if puuid else None)},{NOW-50*DAY if opt else 'NULL'},{q(json.dumps(roles) if roles is not None else None)},{q(json.dumps(deco) if deco else None)});")
def acct(puuid, mid, rid, added, since):
    sql.append(f"INSERT INTO member_accounts (puuid, member_id, riot_id, added_at, since) VALUES ({q(puuid)},{q(mid)},{q(rid)},{added},{since});")
gid = [1000]
champs = list(range(1, 160))
def game(t, entries, players_null=False):
    """entries: (member_id or None, name-in-players, team, win)"""
    gid[0] += 1; g = gid[0]
    cs = random.sample(champs, 10)
    plist = []
    me = [e for e in entries]
    # 10명 채우기 (회원이 아닌 사람)
    while len(me) < 10:
        team = 100 if sum(1 for e in me if e[2] == 100) < 5 else 200
        me.append((None, f'손님{random.randint(1,999)}#KR9', team, None))
    win100 = random.random() < .5
    for i, (mid, name, team, w) in enumerate(me):
        win = (team == 100) == win100 if w is None else w
        plist.append({'name': name, 'championId': cs[i], 'teamId': team, 'win': win, 'kills': random.randint(0,20), 'deaths': random.randint(0,15), 'assists': random.randint(0,30)})
    # 같은 팀은 승패가 같게
    for p in plist: p['win'] = (p['teamId'] == 100) == win100
    crew = sum(1 for e in me if e[0])
    sql.append(f"INSERT INTO matches (game_id, queue_id, played_at, duration, source, collected_by, crew_count, team_totals, players, created_at) VALUES ({g},2400,{t},1200,'lcu',{q(A)},{crew},'{{}}',{q(None if players_null else json.dumps(plist, ensure_ascii=False))},{t});")
    for i, (mid, name, team, w) in enumerate(me):
        if not mid: continue
        p = plist[i]
        sql.append(f"INSERT INTO participants (game_id, member_id, champion_id, team_id, win, kills, deaths, assists, played_at, crew_count) VALUES ({g},{q(mid)},{p['championId']},{team},{int(p['win'])},{p['kills']},{p['deaths']},{p['assists']},{t},{crew});")
    return g

# A: 메인 pa1, 부계정 pa2(이름에 띄어쓰기), 나중에 더한 pa3
member(A, '블랙#KR18', 'pa1', deco={'bg': 'bg-starry', 'frame': 'frame-gold'})
acct('pa1', A, '블랙#KR18', 0, 0)
acct('pa2', A, '블랙 부캐#KR2', 1, 0)
acct('pa3', A, '셋째#KR3', NOW - 5*DAY, NOW - 5*DAY)
for it in ['bg-starry', 'bg-dusk', 'frame-gold', 'frame-ember', 'name-gold']:
    sql.append(f"INSERT INTO shop_owned (member_id, item_id, price, bought_at) VALUES ({q(A)},{q(it)},0,0);")
member('mB', '비#KR1', 'pb1'); acct('pb1', 'mB', '비#KR1', 0, 0)
member('mC', '옛회원', None)               # 롤 계정 연결 정보가 없는 예전 회원
member('mD', '디#KR1', 'pd1'); acct('pd1', 'mD', '디#KR1', 0, 0)  # pd2 는 이미 뺀 계정
member('mL', '준#KR1', 'pl1', roles=['793740647227588612']); acct('pl1', 'mL', '준#KR1', 0, 0)
for i in range(30):
    member(f'f{i:02d}', f'필러{i:02d}#KR{i}', f'pf{i}'); acct(f'pf{i}', f'f{i:02d}', f'필러{i:02d}#KR{i}', 0, 0)

t = lambda: NOW - random.randint(1, 20) * DAY - random.randint(0, DAY)
expect = {}
# A 메인 10판 (그중 3판 B 같은 팀, 2판 B 상대)
for i in range(10):
    e = [(A, '블랙#KR18', 100, None)]
    if i < 3: e.append(('mB', '비#KR1', 100, None))
    elif i < 5: e.append(('mB', '비#KR1', 200, None))
    game(t(), e)
# A 부계정 6판: players 이름은 띄어쓰기 없음·영문 대소문자 다름 (맞아야 한다)
for i in range(6): game(t(), [(A, '블랙부캐#kr2', 100, None)])
# A 부계정 2판: players 가 없는 예전 판 → 메인으로 (알고 있는 한계)
for i in range(2): game(t(), [(A, None, 200, None)], players_null=True)
# A 부계정 1판: 그 뒤 롤 이름이 바뀐 판 → 메인으로 (알고 있는 한계)
game(t(), [(A, '옛닉#KR2', 100, None)])
# B 혼자 5판
for i in range(5): game(t(), [('mB', '비#KR1', 200, None)])
# C 4판
for i in range(4): game(t(), [('mC', '옛회원#KR5', 100, None)])
# D: 뺀 계정 pd2 로 3판, 메인 2판
for i in range(3): game(t(), [('mD', '디부캐#KR2', 100, None)])
for i in range(2): game(t(), [('mD', '디#KR1', 100, None)])
# L 4판
for i in range(4): game(t(), [('mL', '준#KR1', 100, None)])
# 필러
for i in range(30):
    for k in range(random.randint(3, 15)): game(t(), [(f'f{i:02d}', f'필러{i:02d}#KR{i}', 100, None)])
open(sys.argv[1] if len(sys.argv) > 1 else 'seed.sql', 'w').write('\n'.join(sql) + '\n')
print(len(sql), 'statements, last game', gid[0])
