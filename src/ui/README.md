# src/ui — Person A after hour 0

**Delivers:** the weather look shared by every screen. `weather.ts` is the only place internal posture names (open / metered / sealed) become Clear skies / Cloudy / Storm. `theme.ts` holds the tokens (no red; Storm is indigo/violet; one umbrella accent). `components.tsx` has shared pieces: WeatherChip, ReasonLine, BalanceNumeral, Button, Placeholder.

B and C import from here; only A edits it (task A12 polish). Visual reference: the design state gallery linked in the root README.
