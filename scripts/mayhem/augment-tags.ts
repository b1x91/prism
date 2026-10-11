/**
 * 아수라장 증강 궁합 태그 (직접 작성한 표).
 *
 * 게임 파일에는 "누구에게 좋은지"가 없으므로, 증강 설명을 읽고 사람이 붙인다.
 * 패치로 새 증강이 생기면 build 스크립트가 "태그 없음" 목록을 출력한다 → 여기에 한 줄 추가.
 *
 * 태그
 *   선호 (챔피언 성향과 맞을수록 점수가 오른다)
 *     ap ad          주 피해 유형
 *     attack         기본 공격 위주 (평타·적중 시 효과)
 *     crit           치명타를 쓰는 챔피언
 *     ability        스킬 피해 위주
 *     haste          스킬 가속 효율 (재사용 대기시간이 핵심인 챔피언)
 *     ult            궁극기 의존도
 *     tank           단단한 앞라인
 *     bruiser        근접 전사형 (주고받는 싸움)
 *     sustain        자기 회복으로 버티는 챔피언
 *     mobile         기동성 높은 챔피언
 *     ranged melee   사거리 유형
 *     burst          짧은 순간 몰아치는 챔피언
 *   조건 (챔피언에게 이 능력이 없으면 효과가 거의 없다)
 *     req:cc         이동 불가(기절·속박·에어본 등) 스킬
 *     req:dash       돌진·도약·순간이동 스킬
 *     req:ally       아군 회복·보호막
 *     req:shield     보호막 스킬 (자신 또는 아군)
 *     req:heal       체력 회복 스킬
 *     req:channel    정신 집중 스킬
 *     req:summon     소환물
 *     req:burn       지속 피해(화상·독) 스킬
 *     req:stack      영구 중첩 스킬
 *     req:knockback  밀어내기 스킬
 *     req:terrain    지형 생성 스킬
 *     req:spin       회전 스킬
 *     req:empower    기본 공격 강화 스킬
 *   기타
 *     any            누구에게나 무난 (능력치·골드·소환사 주문 등)
 *     gamble         무작위 결과
 */
export type AugmentTag = string;
export type AugmentFit = { tags: AugmentTag[]; note: string };

export const AUGMENT_TAGS: Record<string, AugmentFit> = {
  // ── 능력치·전환 ──
  ARAM_ADAPt: { tags: ['ap', 'ability'], note: '추가 공격력을 주문력으로 바꾼다. 순수 AP 챔피언용' },
  ARAM_escAPADe: { tags: ['ad', 'attack'], note: '주문력을 공격력으로 바꾼다. 순수 AD 챔피언용' },
  ARAM_BluntForce: { tags: ['ad'], note: '공격력 20% 증가. AD 챔피언 전반' },
  ARAM_WitchfulThinking: { tags: ['ap'], note: '주문력 증가. AP 챔피언 전반' },
  ARAM_Deft: { tags: ['attack'], note: '공격 속도 60%. 평타 챔피언' },
  ARAM_Zealot: { tags: ['attack', 'crit'], note: '치명타·공격 속도. 원딜과 치명타 전사' },
  ARAM_ItsCritical: { tags: ['crit', 'attack'], note: '치명타 확률 50%. 치명타 원딜의 핵심' },
  ARAM_MindtoMatter: { tags: ['tank', 'bruiser'], note: '체력 증가. 앞라인' },
  ARAM_CelestialBody: { tags: ['tank'], note: '체력 1500, 피해 10% 감소. 탱커 전용' },
  ARAM_Goliath: { tags: ['tank', 'bruiser'], note: '체력 35%와 적응형 능력치. 근접 앞라인' },
  ARAM_ThreadtheNeedle: { tags: ['any'], note: '관통력 18%. 딜러 누구나' },
  ARAM_Recursion: { tags: ['haste', 'ability'], note: '스킬 가속 60. 스킬 챔피언 전반' },
  ARAM_Eureka: { tags: ['haste', 'ability', 'ap'], note: '주문력에 비례한 스킬 가속. AP 스킬 챔피언' },
  InfiniteRecursion: { tags: ['haste', 'ability'], note: '스킬 가속이 처치 관여마다 늘어난다. 한타 오래 사는 스킬 챔피언' },
  ARAM_Purist_Caster: { tags: ['ability', 'haste', 'ap'], note: '공격 속도를 스킬 가속으로. 평타 안 치는 마법사' },
  CritNCast: { tags: ['ability', 'haste'], note: '치명타 확률을 스킬 가속으로. 스킬 챔피언' },
  ARAM_WithHaste: { tags: ['any', 'mobile'], note: '이동 속도. 무난' },
  ARAM_LegDay: { tags: ['any', 'melee'], note: '이동 속도·둔화 저항. 붙어야 하는 근접' },
  ARAM_Homeguard: { tags: ['any'], note: '맞지 않을 때 이동 속도 100%. 합류·이탈용' },
  ARAM_ScopedWeapons: { tags: ['ranged', 'attack'], note: '공격 사거리. 원거리 평타 챔피언' },
  ARAM_ScopierWeapons: { tags: ['ranged', 'attack'], note: '공격 사거리. 원거리 평타 챔피언' },
  ARAM_ScopiestWeapons: { tags: ['ranged', 'attack'], note: '공격 사거리 대폭. 원딜 최상급' },
  ARAM_ApexInventor: { tags: ['any'], note: '아이템 가속 100. 사용 효과 아이템을 쓰는 챔피언' },
  ARAM_Stats: { tags: ['any'], note: '능력치 모루 2개' },
  ARAM_StatsOnStats: { tags: ['any'], note: '능력치 모루 3개' },
  ARAM_StatsOnStatsOnStats: { tags: ['any'], note: '능력치 모루 4개와 증강 새로고침' },
  Donation: { tags: ['any'], note: '즉시 1750골드. 아이템 하나를 빨리 완성' },
  HandOfBaron: { tags: ['any'], note: '적응형 능력치 25%와 미니언 강화' },
  ARAM_OmniSoul: { tags: ['any'], note: '드래곤 영혼 3개 무작위' },
  ARAM_MadScientist: { tags: ['any', 'gamble'], note: '부활마다 큰 몸(능력치) 또는 작은 몸(가속·속도) 무작위' },
  ForgedByTheMaster: { tags: ['any'], note: '아이템·증강 피해 증가. 피해 아이템·증강을 많이 쓸수록' },

  // ── 평타·적중 시 효과 ──
  ARAM_HeavyHitter: { tags: ['attack', 'tank'], note: '체력 비례 평타 추가 피해. 체력 높은 평타 챔피언' },
  ARAM_Marksmage: { tags: ['attack', 'ap'], note: '주문력 비례 평타 추가 피해. AP 평타 챔피언(케일·카사딘 등)' },
  ARAM_Juiced: { tags: ['attack', 'crit'], note: '적중 시 마법 피해. 공격 속도 높은 챔피언' },
  ARAM_Typhoon: { tags: ['attack', 'ranged'], note: '평타가 추가 대상에게. 원거리 평타 챔피언' },
  ARAM_DualWield: { tags: ['attack'], note: '평타가 투사체를 한 번 더. 적중 시 효과 챔피언' },
  ARAM_TapDancer: { tags: ['attack', 'mobile'], note: '평타마다 이동 속도·공격 속도. 평타 챔피언' },
  ARAM_LightemUp: { tags: ['attack'], note: '4타마다 투사체. 평타 챔피언' },
  ARAM_Firebrand: { tags: ['attack'], note: '평타가 무한 중첩 화상. 공격 속도 챔피언' },
  ARAM_FanTheHammer: { tags: ['attack', 'ad'], note: '공격 시 투사체 5개. AD 평타 챔피언' },
  ARAM_ShrinkRay: { tags: ['attack', 'tank'], note: '평타 맞은 적의 피해 감소. 평타 앞라인·원딜' },
  ARAM_SymphonyofWar: { tags: ['attack', 'bruiser'], note: '치명적 속도·정복자. 평타 전사·원딜' },
  ARAM_SoulSiphon: { tags: ['crit', 'attack', 'sustain'], note: '치명타 확률과 치명타 흡혈. 치명타 원딜' },
  CriticalRhythm: { tags: ['crit', 'attack'], note: '치명타마다 공격 속도 중첩. 치명타 원딜' },
  CriticalMissile: { tags: ['crit', 'attack'], note: '치명타마다 미사일. 치명타 챔피언' },
  ARAM_DoubleTap: { tags: ['crit', 'attack'], note: '치명타 때 적중 시 효과 두 번. 치명타+적중 시 효과 원딜' },
  ARAM_Vulnerability: { tags: ['crit', 'attack'], note: '아이템·지속 피해에도 치명타. 치명타 챔피언' },
  ARAM_TankItOrLeaveIt: { tags: ['crit', 'tank'], note: '치명타 확률만큼 받는 피해 감소. 치명타 쓰는 앞라인' },
  ARAM_Upgrade_IE: { tags: ['crit', 'attack'], note: '무한의 대검 강화와 500골드. 치명타 원딜' },
  ARAM_Upgrade_Collector: { tags: ['crit', 'ad'], note: '징수의 총 강화. 치명타 AD' },
  ARAM_MasterofDuality: { tags: ['attack', 'ability'], note: '평타는 주문력, 스킬은 공격력을 준다. 평타와 스킬을 섞어 쓰는 챔피언' },
  ARAM_EtherealWeapon: { tags: ['ability', 'attack'], note: '스킬이 적중 시 효과 적용. 적중 시 아이템을 쓰는 스킬 챔피언' },
  ARAM_MysticPunch: { tags: ['attack', 'haste'], note: '적중 시 스킬 재사용 대기시간 감소. 평타로 스킬 굴리는 챔피언' },
  ARAM_DrawYourSword: { tags: ['ranged', 'attack', 'bruiser'], note: '원거리 챔피언이 근접이 되어 큰 능력치. 원거리 평타 챔피언 전용' },
  ARAM_Upgrade_Sheen: { tags: ['attack', 'ability'], note: '주문 검 계열 강화. 스킬 후 평타 챔피언' },
  Upgrade_SwordOfBlossom: { tags: ['attack', 'req:ally'], note: '꽃피는 새벽의 검 강화와 공격 속도. 평타 서포터' },
  Upgrade_Ravenous: { tags: ['ad', 'bruiser', 'sustain'], note: '굶주린 히드라 강화. AD 전사' },
  Upgrade_SunderedSky: { tags: ['ad', 'bruiser', 'sustain'], note: '갈라진 하늘 강화. AD 전사' },
  Upgrade_DeathDance: { tags: ['ad', 'bruiser'], note: '죽음의 무도 강화. AD 전사' },
  Quest_UltraHydra: { tags: ['ad', 'bruiser'], note: '히드라 3종을 모으는 퀘스트. AD 전사' },
  ARAM_Upgrade_ZH: { tags: ['ap'], note: '존야 강화. 존야를 사는 AP 챔피언' },
  ARAM_Upgrade_Immolate: { tags: ['tank'], note: '불사르기 아이템 강화와 골드. 탱커' },
  ARAM_Quest_VoidImmolation: { tags: ['tank'], note: '태양불꽃·공허한 광휘 퀘스트. 탱커' },
  ARAM_Quest_WoogletsWitchcap: { tags: ['ap'], note: '라바돈·존야 퀘스트. AP 챔피언' },
  ARAM_Quest_SteelYourHeart: { tags: ['tank'], note: '강철심장 퀘스트. 탱커' },
  ARAM_Quest_UrfsChampion: { tags: ['any'], note: '처치 관여 18회 퀘스트, 보상 황금 뒤집개' },
  Quest_Sneakerhead: { tags: ['attack', 'mobile'], note: '신발 퀘스트. 평타 챔피언' },
  KingMe: { tags: ['any'], note: '적 이동 수단(대포) 사용 시 아이템 강화와 프리즘 증강' },

  // ── 스킬 ──
  ARAM_Archmage: { tags: ['ability', 'haste'], note: '스킬을 쓸 때마다 다른 스킬 쿨 반환. 스킬 연타 챔피언' },
  ARAM_BacktoBasics: { tags: ['ability', 'haste'], note: '궁극기 봉인 대신 스킬 피해·가속. 궁극기 의존도 낮은 챔피언' },
  SkipTheBasics: { tags: ['ult', 'haste'], note: '스킬 가속이 궁극기에만, 대신 1.5배. 궁극기가 핵심인 챔피언' },
  UltimateAwakening: { tags: ['ult', 'ability'], note: '궁극기 사용 시 기본 스킬 초기화. 궁극기 후 스킬 몰아치는 챔피언' },
  ARAM_UltimateRevolution: { tags: ['ult'], note: '궁극기 두 번. 궁극기가 강한 챔피언' },
  ARAM_ItsKillingTime: { tags: ['ult', 'burst'], note: '궁극기 후 피해를 비축했다 폭발. 궁극기로 진입하는 딜러' },
  ARAM_CantTouchThis: { tags: ['ult', 'tank', 'melee'], note: '궁극기 후 2초 무적. 궁극기로 진입하는 근접' },
  ARAM_UltimateUnstoppable: { tags: ['ult', 'melee'], note: '궁극기 후 CC 면역. 궁극기로 진입하는 근접' },
  ARAM_StuckInHereWithMe: { tags: ['ult', 'tank'], note: '궁극기 후 피해 감소와 도발. 진입 탱커' },
  ARAM_FeyMagic: { tags: ['ult'], note: '궁극기로 적을 변이. 궁극기가 넓게 맞는 챔피언' },
  FinalForm: { tags: ['ult', 'bruiser', 'sustain'], note: '궁극기 후 보호막·흡혈·속도. 궁극기로 싸움 거는 전사' },
  SurgeField: { tags: ['ult', 'ability'], note: '궁극기 사용 시 가속·속도 영역' },
  ARAM_SkilledSniper: { tags: ['ability', 'ranged'], note: '600 넘는 거리로 맞히면 쿨 80% 반환. 장거리 포킹 챔피언' },
  ARAM_MagicMissile: { tags: ['ability'], note: '스킬 적중마다 최대 체력 비례 고정 피해 미사일' },
  ARAM_InfernalConduit: { tags: ['ability', 'ap'], note: '스킬이 화상, 화상마다 기본 스킬 쿨 감소. AP 스킬 챔피언' },
  ARAM_SearingDawn: { tags: ['ability'], note: '스킬이 표식, 아군 공격 시 추가 피해. 스킬 포킹' },
  ARAM_JeweledGauntlet: { tags: ['ability', 'burst'], note: '스킬에 치명타. 스킬 딜러' },
  Twinfire: { tags: ['ability', 'crit'], note: '스킬 적중 시 미사일, 치명타 확률. 스킬 딜러' },
  ARAM_Overflow: { tags: ['ability', 'ap'], note: '마나 2배 소모 대신 스킬 효과 증가. 마나 여유 있는 챔피언' },
  ARAM_PhenomenalEvil: { tags: ['ap', 'ability'], note: '스킬 적중마다 주문력 영구 증가. 스킬 자주 맞히는 AP' },
  ARAM_StackosaurusRex: { tags: ['req:stack'], note: '영구 중첩 2배. 나서스·베이가·초가스·스몰더 같은 중첩 챔피언 전용' },
  ARAM_OkBoomerang: { tags: ['any'], note: '부메랑 자동 사용' },
  ARAM_Firefox: { tags: ['any'], note: '이동 속도와 자동 불꽃' },
  EndlessDecimation: { tags: ['bruiser', 'sustain', 'melee'], note: '자동 도끼 회전과 회복. 근접 전사' },
  HextechSoul: { tags: ['any'], note: '주기적 연쇄 번개' },
  ARAM_InfernalSoul: { tags: ['any'], note: '스킬·평타에 추가 피해' },
  ARAM_OceanSoul: { tags: ['sustain'], note: '피해를 주면 체력·마나 재생' },
  ARAM_MountainSoul: { tags: ['tank', 'any'], note: '전투 이탈 시 보호막' },
  ARAM_Erosion: { tags: ['any'], note: '피해마다 적 저항 감소. 지속 딜러' },
  ARAM_DontBlink: { tags: ['mobile'], note: '이동 속도 차이만큼 추가 피해. 빠른 챔피언' },
  ARAM_GiantSlayer: { tags: ['melee', 'burst', 'mobile'], note: '작아지고 큰 적에게 추가 피해. 탱커 잡는 딜러' },
  GlassCannon: { tags: ['burst'], note: '체력 70% 상한 대신 25% 추가 고정 피해. 뒤에서 딜하는 챔피언' },
  BrushPower: { tags: ['burst'], note: '수풀에서 나오며 피해 20%. 매복형' },
  NatureIsHealing: { tags: ['sustain'], note: '수풀에서 회복' },
  Nightstalking: { tags: ['burst', 'mobile'], note: '처치 후 투명. 암살자' },
  ARAM_ClownCollege: { tags: ['burst', 'melee'], note: '뒤 공격 추가 피해와 투명 순간이동. 근접 암살자' },
  ARAM_BladeWaltz: { tags: ['melee', 'burst'], note: '대상 지정 불가 돌진 연타. 근접 딜러' },
  ARAM_EndlessHunt: { tags: ['bruiser', 'sustain'], note: '급소 타격 고정 피해와 회복. 오래 싸우는 전사' },
  ARAM_DivineDomain: { tags: ['burst', 'mobile'], note: '처치 후 정수로 순간이동·초기화. 연쇄 처치형' },
  Goldrend: { tags: ['any'], note: '챔피언 타격 시 골드' },
  ARAM_GetExcited: { tags: ['burst', 'attack'], note: '처치 관여 시 이동·공격 속도' },
  ARAM_InfernoTriggered: { tags: ['ability', 'attack'], note: '스킬·평타를 번갈아 쓰면 스타일 등급. 콤보 챔피언' },
  ARAM_FromBeginningToEnd: { tags: ['burst'], note: '선제공격·어둠의 수확. 순간 딜러' },
  ARAM_Hellbent: { tags: ['bruiser', 'melee'], note: '중첩 후 사망 시 부활. 맨 앞 근접' },
  ARAM_DiveBomber: { tags: ['tank', 'melee'], note: '사망 시 폭발. 먼저 들어가는 근접' },
  FishBait: { tags: ['tank', 'melee'], note: '사망 시 상어. 먼저 들어가는 근접' },
  ARAM_DropBear: { tags: ['tank', 'melee'], note: '사망 시 티버 소환. 먼저 들어가는 근접' },
  EscapePlan: { tags: ['any'], note: '체력 35%에서 큰 보호막과 이동 속도' },
  ARAM_DawnbringersResolve: { tags: ['bruiser', 'sustain'], note: '체력 50%에서 30% 회복' },
  ARAM_BigBrain: { tags: ['ap'], note: '주문력 300% 보호막' },
  ARAM_Goredrink: { tags: ['sustain'], note: '모든 피해 흡혈 15%' },
  WarlockJuicebox: { tags: ['sustain', 'ap'], note: '모든 피해 흡혈. AP 지속 딜러' },
  OminousPact: { tags: ['ap', 'sustain', 'bruiser'], note: '잃은 체력 비례 주문력·흡혈. AP 전사(블라디미르·모데카이저 등)' },
  ARAM_CircleofDeath: { tags: ['sustain', 'req:heal'], note: '회복량 70%를 피해로. 자기 회복이 많은 챔피언' },
  ARAM_ImTheJuggernaut: { tags: ['bruiser', 'tank', 'melee'], note: '주고받을수록 능력치·저항. 근접 전사' },
  ARAM_TankEngine: { tags: ['tank'], note: '처치 관여마다 체력 5%. 탱커' },
  ShrinkEngine: { tags: ['haste', 'mobile'], note: '처치 관여마다 스킬 가속·이동 속도' },
  ARAM_ProteinShake: { tags: ['tank', 'req:ally'], note: '저항력 비례 회복·보호막 강화. 탱 서포터' },
  ARAM_OutlawsGrit: { tags: ['req:dash', 'bruiser'], note: '돌진 후 저항. 돌진 많은 전사' },
  ARAM_ShadowRunner: { tags: ['req:dash', 'mobile'], note: '돌진·은신 후 이동 속도 300' },
  ARAM_Dashing: { tags: ['req:dash', 'mobile'], note: '돌진 스킬 가속 175. 돌진 스킬이 핵심인 챔피언' },
  ARAM_Earthwake: { tags: ['req:dash'], note: '돌진 흔적 폭발. 돌진 많은 챔피언' },
  SwiftAndSafe: { tags: ['req:dash'], note: '돌진 후 보호막' },
  KillSecured: { tags: ['mobile', 'burst'], note: '체력 낮은 적에게 접근 시 이동 속도' },
  ARAM_Flashbang: { tags: ['any'], note: '점멸 폭발' },
  ARAM_Flashy: { tags: ['any', 'mobile'], note: '점멸 3회' },
  Flash2: { tags: ['any'], note: '점멸 하나 더' },
  YouSpinMeRightRound: { tags: ['any', 'mobile'], note: '소환사 주문이 갈고리 이동기로' },
  Poltergeist: { tags: ['any'], note: '방어막+유체화 소환사 주문' },
  DimensionShift_Active: { tags: ['any'], note: '적을 다른 차원으로 끌고 가는 소환사 주문' },
  GrowthSpurt: { tags: ['tank', 'melee'], note: '커지며 에어본·체력. 진입 탱커' },
  Overextender: { tags: ['any'], note: '대포 발사기 강화. 대포로 진입하는 챔피언' },
  PromQueen: { tags: ['melee', 'tank'], note: '자동 라칸 궁극기(매혹 질주). 진입형' },
  Sonata: { tags: ['req:ally'], note: '아군 회복·보호막·이동 속도 오라 자동 사용. 서포터' },
  ARAM_DivineIntervention: { tags: ['any'], note: '주기적으로 자신과 주변 아군 무적' },
  VeilOfWarding: { tags: ['any'], note: '30초마다 주문 방어막' },
  ARAM_IceCold: { tags: ['any'], note: '둔화 강화. 둔화 스킬이 있는 챔피언' },
  ARAM_SpiritualPurification: { tags: ['burst'], note: '처치 관여 시 폭발·둔화' },
  ARAM_HighRoller: { tags: ['gamble'], note: '적 처치 시 확률로 능력치 모루' },
  ARAM_YowchMyCoins: { tags: ['any'], note: '처치 관여 시 아군이 주울 동전' },
  BloodMoneyBurn: { tags: ['req:burn'], note: '화상·지속 피해가 골드. 지속 피해 챔피언' },
  BurstingTeeth: { tags: ['burst'], note: '순간 피해로 관통력 수집' },
  PoroCharge_Active: { tags: ['any'], note: '포로 퀘스트, 포로 돌격 소환사 주문' },
  PressureCooker: { tags: ['tank', 'melee'], note: '주변 화상, 체력 비례. 근접 탱커' },
  ARAM_SpecializedRecursion: { tags: ['haste'], note: '선택한 스킬 퀘스트, 보상 스킬 가속' },
  SpecializedEmpowerment: { tags: ['ability'], note: '선택한 스킬 퀘스트, 보상 피해 증가' },
  ARAM_BangBang: { tags: ['ability', 'ranged'], note: '장거리 저격 퀘스트. 장거리 스킬 챔피언' },
  ARAM_Multishot: { tags: ['ability'], note: '선택한 스킬 퀘스트, 보상 투사체 추가. 투사체 스킬' },
  ARAM_TransmuteGold: { tags: ['gamble'], note: '무작위 골드 증강' },
  ARAM_TransmutePrismatic: { tags: ['gamble'], note: '무작위 프리즘 증강' },
  ARAM_TransmuteChaos: { tags: ['gamble'], note: '무작위 증강 2개' },
  ARAM_PandorasBox: { tags: ['gamble'], note: '모든 증강을 무작위 프리즘으로' },
  MightyShield: { tags: ['req:shield'], note: '보호막을 얻으면 적응형 능력치. 보호막 스킬 챔피언' },
  DontChangeTheChannel: { tags: ['req:channel'], note: '정신 집중 중 보호막. 정신 집중 챔피언 전용' },
  ARAM_Minionmancer: { tags: ['req:summon'], note: '소환물 강화. 소환물 챔피언 전용' },
  SquishySlappyGrab: { tags: ['attack', 'melee'], note: '주기적으로 적을 연결해 끌어당김' },
  PatOnTheBack: { tags: ['req:ally', 'mobile'], note: '아군 근처를 지나면 보호막·이동 속도' },
  Terraind: { tags: ['req:terrain', 'ult'], note: '생성한 지형이 피해. 지형 챔피언 전용' },
  ChainReaction: { tags: ['req:knockback'], note: '밀어낸 적이 부딪히면 에어본. 밀어내기 챔피언' },
  ARAM_Dropkick: { tags: ['burst'], note: '체력 낮은 적 처형과 밀쳐내기' },
  ARAM_SpinToWin: { tags: ['req:spin'], note: '회전 스킬 강화. 가렌·카타리나 같은 회전 챔피언' },
  Bonk: { tags: ['req:empower', 'attack'], note: '강화 평타 스킬이 주변까지 피해. 강화 평타 챔피언' },
  PinCushion: { tags: ['tank', 'melee'], note: '맞을수록 바늘 폭발. 맞아주는 앞라인' },

  // ── CC ──
  ARAM_CourageoftheColossus: { tags: ['req:cc', 'tank'], note: 'CC를 걸면 보호막. CC 많은 앞라인' },
  ARAM_Cruelty: { tags: ['req:cc'], note: 'CC를 걸면 혜성. CC 챔피언' },
  ARAM_Impassable: { tags: ['req:cc', 'tank'], note: '여진·빙결 강화. CC 탱커' },
  ARAM_SlapAround: { tags: ['req:cc'], note: 'CC마다 적응형 능력치 중첩' },
  SoulEater: { tags: ['req:cc', 'tank'], note: 'CC마다 최대 체력 영구 증가' },
  Adamant: { tags: ['req:cc', 'tank'], note: 'CC마다 저항 중첩' },

  // ── 아군 회복·보호막 ──
  ARAM_AllForYou: { tags: ['req:ally'], note: '아군 회복·보호막 30%. 인챈터 서포터' },
  ARAM_FirstAidKit: { tags: ['req:heal'], note: '회복·보호막 20%. 회복·보호막 스킬 챔피언' },
  ARAM_CriticalHealing: { tags: ['req:ally'], note: '회복·보호막에 치명타. 서포터' },
  ARAM_WindspeakersBlessing: { tags: ['req:ally'], note: '회복·보호막 대상 저항 증가. 서포터' },
  ARAM_EmpoweredByTheFaithful: { tags: ['req:ally'], note: '회복·보호막 받은 아군이 때리면 중첩. 서포터' },
  ARAM_SpiritBomb: { tags: ['req:ally'], note: '회복·보호막 중첩으로 영혼 폭탄. 서포터' },
  ARAM_SonicBoom: { tags: ['req:ally'], note: '아군 강화·회복·보호막 시 주변 적 피해. 서포터' },
  ARAM_WeeWooWeeWoo: { tags: ['req:ally', 'mobile'], note: '다친 아군에게 빠르게, 회복·보호막 강화. 서포터' },
  EmpyreanPromise: { tags: ['req:ally'], note: '회복·보호막 15%와 아군에게 순간이동. 서포터' },
  SupportMain: { tags: ['req:ally'], note: '아군 회복 퀘스트. 회복 서포터' },
  Equilibrium: { tags: ['req:ally'], note: '아군 회복 강화. 서포터' },
  MercysStrike: { tags: ['req:ally', 'attack'], note: '아군 회복·보호막 후 강화 평타. 평타 서포터' },
  DoubleDefense: { tags: ['req:shield'], note: '선택한 보호막 스킬 강화' },

  // ── 선택한 스킬 하나를 강화 ([능력] 증강) ──
  ARAM_BreadAndButter: { tags: ['haste', 'ability'], note: 'Q 스킬 가속 100. Q가 핵심인 챔피언' },
  ARAM_BreadAndJam: { tags: ['haste', 'ability'], note: 'W 스킬 가속 100. W가 핵심인 챔피언' },
  ARAM_BreadAndCheese: { tags: ['haste', 'ability'], note: 'E 스킬 가속 100. E가 핵심인 챔피언' },
  ARAM_Terror: { tags: ['ability', 'melee'], note: '선택한 스킬에 주변 공포. 근접 진입 스킬' },
  ARAM_Quickstep: { tags: ['ability', 'mobile'], note: '선택한 스킬에 짧은 돌진 추가' },
  VoidDash: { tags: ['req:dash'], note: '선택한 돌진 스킬에 공허 지대' },
  DarkWind: { tags: ['req:cc', 'sustain'], note: '선택한 CC 스킬에 피해·회복' },
  ARAM_RabbleRousing: { tags: ['sustain', 'ability'], note: '선택한 스킬 사용 시 회복' },
  ARAM_SustainingStrike: { tags: ['sustain', 'ability'], note: '선택한 스킬 피해의 30% 회복' },
  SnapBack: { tags: ['ability'], note: '선택한 스킬 재사용 시 폭발하며 복귀' },
  LittleExtraHelp: { tags: ['attack'], note: '선택한 버프 스킬 동안 사거리·공격 속도. 평타 버프 스킬 챔피언' },
  KeepGoing: { tags: ['attack'], note: '선택한 스킬 동안 적중 시 효과 쿨 감소' },
  Overkill: { tags: ['attack'], note: '선택한 버프 스킬 동안 평타가 대못' },
  ItsGoTime: { tags: ['mobile'], note: '선택한 스킬 지속시간 동안 이동 속도' },
  TrustyWeapon: { tags: ['ability'], note: '선택한 스킬 적중 시 피해 증가 중첩' },
  WardingWeapon: { tags: ['tank', 'ability'], note: '선택한 스킬 적중 시 저항 중첩. 앞라인' },
  TitansPulse: { tags: ['tank', 'ability'], note: '선택한 스킬 적중 시 저항. 앞라인' },
  DoubleStrike: { tags: ['attack'], note: '선택한 스킬의 적중 시 효과 두 번' },
  Ability_SelfAOE_DoubleCast: { tags: ['ability', 'burst'], note: '선택한 스킬 분신이 한 번 더 시전' },
  SpellVolley: { tags: ['ability'], note: '선택한 스킬을 3연발' },
  Missile_Split: { tags: ['ability'], note: '선택한 투사체 스킬이 갈라진다' },
  Overloaded: { tags: ['ability', 'haste'], note: '선택한 스킬이 다른 스킬을 쓸 때마다 초기화. 짧은 콤보 챔피언' },

  // ── 눈덩이 ──
  ARAM_Snowday: { tags: ['any', 'melee'], note: '눈덩이 가속·피해 100%. 진입하는 챔피언' },
  SnowballUpgrade: { tags: ['any'], note: '눈덩이 둔화 영역' },
  Snowbomb: { tags: ['any', 'melee'], note: '눈덩이 재사용 시 에어본·밀쳐내기' },
  PinballSnowball: { tags: ['any'], note: '눈덩이가 벽에 튕기며 강해진다' },
  BiggestSnowballEver: { tags: ['any', 'melee'], note: '거대 눈덩이 에어본. 진입형' },
  GoldenSnowball: { tags: ['melee', 'tank'], note: '눈덩이 돌진 시 무적. 진입형' },
  SharkTempest: { tags: ['any'], note: '눈덩이에 상어 폭풍' },

  // ── 비활성 (게임 파일상 꺼져 있음, 참고용) ──
  ARAM_Perseverance: { tags: ['tank', 'sustain'], note: '체력 재생 대폭' },
  ARAM_LittleDevil: { tags: ['any'], note: '체력을 흡수하는 작은 악마' },
  ARAM_QuantumComputing: { tags: ['bruiser', 'melee'], note: '30초마다 강력한 베기' },
  Vampirism: { tags: ['sustain'], note: '아군 회복 불가 대신 흡혈 25%' },
};
