-- Frame domains the Dood player opens for ads and gambling when a viewer
-- clicks: browsers report them, and they raised the "new player domain"
-- alert by mistake. Marked as ads (never alerted again). Labels an admin
-- already set win.
INSERT INTO "Setting" ("key", "value")
VALUES ('security.cspDomainLabels', '{"ww888new.com": {"kind": "ad", "at": "2026-11-28T00:00:00.000Z"}, "xml-v4.ezmob.com": {"kind": "ad", "at": "2026-11-28T00:00:00.000Z"}, "werefilledwit.org": {"kind": "ad", "at": "2026-11-28T00:00:00.000Z"}, "bef88win678.com": {"kind": "ad", "at": "2026-11-28T00:00:00.000Z"}, "www.bef88win678.com": {"kind": "ad", "at": "2026-11-28T00:00:00.000Z"}, "ad.playfun788.com": {"kind": "ad", "at": "2026-11-28T00:00:00.000Z"}, "lc.ribzubacrche.cfd": {"kind": "ad", "at": "2026-11-28T00:00:00.000Z"}, "jg.fritsimoons.cyou": {"kind": "ad", "at": "2026-11-28T00:00:00.000Z"}}'::jsonb)
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value" || "Setting"."value";
