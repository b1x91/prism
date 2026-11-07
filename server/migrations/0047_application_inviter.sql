-- 초대 링크로 들어온 신청인데 초대한 사람이 승인 대기라 추천인이 비어 저장된 것을 채운다 (CLAUDE.md v3.187)
UPDATE applications SET inviter = (SELECT m.id FROM members m WHERE m.invite_code = applications.invite_code)
WHERE inviter IS NULL AND invite_code IS NOT NULL;
