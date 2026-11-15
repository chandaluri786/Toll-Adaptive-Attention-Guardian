# src/ui — Person A after hour 0

**Delivers:** the weather look shared by every screen. `weather.ts` is the only place internal posture names (open / metered / sealed) become Clear skies / Cloudy / Storm. `theme.ts` holds the tokens (no red; Storm is indigo/violet; one umbrella accent). `components.tsx` has shared pieces: WeatherChip, ReasonLine, BalanceNumeral, Button, Placeholder.

B and C import from here; only A edits it (task A12 polish). Visual reference: the design state gallery linked in the root README.

## Design system

The full rules are in [docs/DESIGN.md](../../docs/DESIGN.md). In this folder:

| File | What |
| --- | --- |
| `theme.ts` | tokens: light/dark palette, `SKY` gradients, `fonts` |
| `SkyScene.tsx` | the full-bleed animated sky (clouds, rain, lightning, stars) |
| `Mascot.tsx` | the cloud/sun mascot, 5 moods |
| `Icon.tsx` | Lucide wrapper (add icons here) |
| `primitives.tsx`, `components.tsx` | Card, Display, Body, Segmented, WeatherChip, Button, BalanceNumeral |
| `motion.ts` | animation helpers that respect reduce-motion |
| `FontGate.tsx` | loads the fonts once at the app root |
