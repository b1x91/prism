-- 롤 계정마다 랭킹 줄 · 계정마다 꾸밈 (v3.161)
-- 판마다 어느 롤 계정으로 했는지 (회원 기록에만, 비회원 puuid 는 여전히 남기지 않는다)
ALTER TABLE participants ADD COLUMN puuid TEXT;
-- 예전 판: 판의 10명 기록(matches.players)에서 같은 팀·챔프·롤 이름이 맞는 내 계정을 찾는다
UPDATE participants SET puuid = (
  SELECT ma.puuid FROM matches mt, json_each(mt.players) j, member_accounts ma
  WHERE mt.game_id = participants.game_id
    AND CAST(json_extract(j.value, '$.championId') AS INTEGER) = participants.champion_id
    AND CAST(json_extract(j.value, '$.teamId') AS INTEGER) = participants.team_id
    AND ma.member_id = participants.member_id
    AND ma.riot_id IS NOT NULL
    AND lower(replace(ma.riot_id, ' ', '')) = lower(replace(json_extract(j.value, '$.name'), ' ', ''))
  LIMIT 1
) WHERE puuid IS NULL;
-- 못 찾은 판은 메인 계정으로
UPDATE participants SET puuid = (SELECT riot_puuid FROM members WHERE id = participants.member_id) WHERE puuid IS NULL;
CREATE INDEX IF NOT EXISTS idx_participants_puuid ON participants (puuid, played_at);
-- 계정마다 장착한 꾸밈. members.deco 는 메인 계정 것과 늘 같다 (메인을 바꾸면 서로 바꿔 넣는다)
ALTER TABLE member_accounts ADD COLUMN deco TEXT;
UPDATE member_accounts SET deco = (SELECT deco FROM members WHERE members.id = member_accounts.member_id AND members.riot_puuid = member_accounts.puuid)
  WHERE deco IS NULL;
