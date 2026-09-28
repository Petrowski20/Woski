-- ============================================================
--  Equipos — sigla y metadatos
--  * teams.iso_code es la sigla del equipo en cualquier deporte
--    (ESP en fútbol, G2 en LoL). Era VARCHAR(3) y las siglas de LoL
--    pueden ser más largas (MKOI, NAVI, SHFT): pasa a text. Cambio
--    binario compatible: no reescribe la tabla y conserva NOT NULL y
--    UNIQUE; los códigos de fútbol no cambian.
--  * teams.metadata: datos propios de un deporte, mismo patrón que
--    matches.metadata / predictions.metadata. LoL guarda aquí región
--    y país; de momento no se muestran.
-- ============================================================

ALTER TABLE public.teams ALTER COLUMN iso_code TYPE text;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;


-- ------------------------------------------------------------
--  Team BDS compite ahora como Shifters. Se renombra conservando
--  id y slug (lol-bds), así sus partidos y predicciones no cambian.
-- ------------------------------------------------------------

UPDATE public.teams
SET name = 'Shifters'
WHERE slug = 'lol-bds'
  AND name = 'Team BDS';


-- ------------------------------------------------------------
--  Sigla, región y país de los equipos de LoL (tabla de referencia
--  completa). Se cruza por nombre sin distinguir mayúsculas y solo
--  actualiza los equipos que ya existen: esta migración no crea
--  equipos. La región va a metadata->>'region' y el país (ISO
--  3166-1 alfa-2) a metadata->>'country'.
-- ------------------------------------------------------------

UPDATE public.teams t
SET iso_code = v.tag,
    metadata = t.metadata || jsonb_build_object('region', v.region, 'country', v.country)
FROM (VALUES
  ('G2 Esports',                    'G2',   'EMEA', 'DE'),
  ('Fnatic',                        'FNC',  'EMEA', 'GB'),
  ('Movistar KOI',                  'MKOI', 'EMEA', 'ES'),
  ('Karmine Corp',                  'KC',   'EMEA', 'FR'),
  ('Team Vitality',                 'VIT',  'EMEA', 'FR'),
  ('GiantX',                        'GX',   'EMEA', 'ES'),
  ('Team Heretics',                 'TH',   'EMEA', 'ES'),
  ('Shifters',                      'SHFT', 'EMEA', 'CH'),
  ('Natus Vincere',                 'NAVI', 'EMEA', 'UA'),
  ('SK Gaming',                     'SK',   'EMEA', 'DE'),
  ('LYON',                          'LYON', 'NA',   'MX'),
  ('Cloud9',                        'C9',   'NA',   'US'),
  ('Team Liquid',                   'TL',   'NA',   'NL'),
  ('Sentinels',                     'SEN',  'NA',   'US'),
  ('FlyQuest',                      'FLY',  'NA',   'US'),
  ('Disguised',                     'DSG',  'NA',   'US'),
  ('Dignitas',                      'DIG',  'NA',   'US'),
  ('Shopify Rebellion',             'SR',   'NA',   'CA'),
  ('Gen.G',                         'GEN',  'KR',   'KR'),
  ('T1',                            'T1',   'KR',   'KR'),
  ('Nongshim RedForce',             'NS',   'KR',   'KR'),
  ('DN SOOPers',                    'DNS',  'KR',   'KR'),
  ('BRION',                         'BRO',  'KR',   'KR'),
  ('BNK FearX',                     'BNF',  'KR',   'KR'),
  ('Dplus KIA',                     'DK',   'KR',   'KR'),
  ('DRX',                           'DRX',  'KR',   'KR'),
  ('KT Rolster',                    'KT',   'KR',   'KR'),
  ('Hanwha Life Esports',           'HLE',  'KR',   'KR'),
  ('Anyone''s Legend',              'AL',   'CN',   'CN'),
  ('Bilibili Gaming',               'BLG',  'CN',   'CN'),
  ('Weibo Gaming',                  'WBG',  'CN',   'CN'),
  ('JD Gaming',                     'JDG',  'CN',   'CN'),
  ('Top Esports',                   'TES',  'CN',   'CN'),
  ('Invictus Gaming',               'IG',   'CN',   'CN'),
  ('Ninjas in Pyjamas',             'NIP',  'CN',   'CN'),
  ('Team WE',                       'WE',   'CN',   'CN'),
  ('EDward Gaming',                 'EDG',  'CN',   'CN'),
  ('ThunderTalk Gaming',            'TT',   'CN',   'CN'),
  ('LNG Esports',                   'LNG',  'CN',   'CN'),
  ('Oh My God',                     'OMG',  'CN',   'CN'),
  ('LGD Gaming',                    'LGD',  'CN',   'CN'),
  ('Ultra Prime',                   'UP',   'CN',   'CN'),
  ('Team Secret Whales',            'TSW',  'APAC', 'VN'),
  ('Deep Cross Gaming',             'DCG',  'APAC', 'TW'),
  ('GAM Esports',                   'GAM',  'APAC', 'VN'),
  ('Ground Zero Gaming',            'GZ',   'APAC', 'AU'),
  ('CTBC Flying Oyster',            'CFO',  'APAC', 'TW'),
  ('Fukuoka SoftBank Hawks Gaming', 'SJG',  'APAC', 'JP'),
  ('MVK Esports',                   'MVK',  'APAC', 'VN'),
  ('DetonatioN FocusMe',            'DFM',  'APAC', 'JP'),
  ('LØS',                           'LOS',  'BR',   'BR'),
  ('RED Canids',                    'RED',  'BR',   'BR'),
  ('Furia',                         'FUR',  'BR',   'BR'),
  ('LOUD',                          'LOUD', 'BR',   'BR'),
  ('Vivo Keyd Stars',               'VKS',  'BR',   'BR'),
  ('paiN Gaming',                   'PAIN', 'BR',   'BR'),
  ('Fluxo W7M',                     'FX',   'BR',   'BR'),
  ('Leviatán',                      'LEV',  'BR',   'AR'),
  ('Esprit Shōnen',                 'ES',   'EMEA', 'FR'),
  ('Galions',                       'GL',   'EMEA', 'FR'),
  ('Ici Japon Corp. Esport',        'IJC',  'EMEA', 'FR')
) AS v(name, tag, region, country)
WHERE lower(t.name) = lower(v.name)
  AND t.sport_id = (SELECT id FROM public.sports WHERE slug = 'lol');
