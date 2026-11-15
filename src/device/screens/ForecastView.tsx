// OWNER: A (Spec A, tasks A11 week view, A13 month / 6 months). Draws a ForecastModel (forecast.ts) in the
// approved design's look (docs/DESIGN.md, screens 5.1 to 5.4). Presentation only: the numbers and
// sentences come from the tested model. No badges, levels or streak flames: the honest version of "is
// this working?" is more persuasive than gamification. The empty state carries the sleepy mascot.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DaySummary, TaskType } from '../../contracts';
import { useTheme } from '../../ui/components';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { Icon, type IconName } from '../../ui/Icon';
import { Mascot } from '../../ui/Mascot';
import { Body, Card, Display, MiniBars, SectionLabel, Segmented } from '../../ui/primitives';
import { fonts, radius, space } from '../../ui/theme';
import { RANGES, calendarRows, monthName, weekdayLetter, type DayIcon, type ForecastModel, type GoalBar, type Range } from '../forecast';
import { fmtClock } from '../notifications';

const DAY_ICON: Record<DayIcon, { icon: IconName; label: string }> = {
  sun: { icon: 'sun', label: 'Within free time + a quest' },
  partly: { icon: 'cloud-sun', label: 'One of the two' },
  storm: { icon: 'cloud', label: 'Neither' },
};

const CATEGORY_LABEL: Record<TaskType, string> = {
  fitness: 'Fitness',
  place: 'Place',
  meetup: 'Meetup',
  study: 'Study',
  coding: 'Coding',
  focus: 'Focus',
};

export type ForecastViewProps = {
  model: ForecastModel;
  range: Range;
  onRange: (r: Range) => void;
  topInset?: number;
};

export function ForecastView({ model, range, onRange, topInset = 0 }: ForecastViewProps) {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={[styles.content, { paddingTop: topInset + 28 }]}>
      <View style={{ gap: 2 }}>
        <Display>Forecast</Display>
        <Body muted>How the weather's been treating you</Body>
      </View>
      <Segmented options={RANGES.map((r) => ({ id: r.id, label: r.label }))} value={range} onChange={onRange} />
      {model.state === 'empty' ? <Empty model={model} /> : <Ready model={model} />}
    </ScrollView>
  );
}

// ---- first days: nothing honest to show yet --------------------------------------------------------

function Empty({ model }: { model: Extract<ForecastModel, { state: 'empty' }> }) {
  const t = useTheme();
  const todayIndex = model.days.length ? (new Date(`${model.days[model.days.length - 1].date}T12:00:00`).getDay() + 6) % 7 : -1;
  return (
    <View style={{ gap: space.m, alignItems: 'center' }}>
      <View style={{ marginTop: 24, marginBottom: 8 }}>
        <Mascot variant="cloud" mood="sleepy" size={88} />
      </View>
      <Text style={[styles.emptyTitle, { color: t.text }]}>{model.title}</Text>
      <Text style={{ color: t.muted, fontSize: 17, lineHeight: 24, textAlign: 'center', fontFamily: fonts.body, maxWidth: 280 }}>{model.message}</Text>
      <Card style={{ alignSelf: 'stretch', marginTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {'MTWTFSS'.split('').map((letter, i) => (
            <View key={i} style={{ alignItems: 'center', gap: 8, flex: 1 }}>
              <Text style={{ color: t.muted, fontSize: 14, fontFamily: fonts.body }}>{letter}</Text>
              <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: i === todayIndex ? t.gold : t.faint, opacity: i === todayIndex ? 1 : 0.6, alignItems: 'center', justifyContent: 'center' }}>
                {i === todayIndex && <Icon name="sun" size={20} color={t.gold} />}
              </View>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

// ---- the real thing --------------------------------------------------------------------------------

function Ready({ model }: { model: Extract<ForecastModel, { state: 'ready' }> }) {
  const t = useTheme();
  const s = model.summary;
  const unlocks = model.days.flatMap((d) => d.emergencyUnlocks.map((at) => ({ date: d.date, at })));
  const peak = Math.max(60, ...model.days.map((d) => Math.max(d.earned, d.spent)));

  return (
    <>
      {/* This week / month / since: sunny days, as a calendar */}
      <Card>
        <SectionLabel>{model.sunny.label}</SectionLabel>
        <Text style={[styles.headline, { color: t.text }]}>{model.sunny.headline}</Text>
        <Calendar model={model} />
        <Legend />
      </Card>

      {/* Goals: planned against done, per day */}
      <Card>
        <SectionLabel>Goals</SectionLabel>
        <Text style={[styles.headline, { color: t.text }]}>{model.goals.headline}</Text>
        {s.daysWithPlan > 0 && <GoalChart bars={model.goals.bars} />}
        <View style={styles.chips}>
          {model.categories.length === 0 ? (
            <Body muted small>No quests finished yet.</Body>
          ) : (
            model.categories.map(([type, n]) => (
              <View key={type} style={[styles.chip, { borderColor: t.divider, backgroundColor: t.surface }]}>
                <Text style={{ color: t.text, fontSize: 14, fontFamily: fonts.body }}>{`${CATEGORY_LABEL[type]}  ×${n}`}</Text>
              </View>
            ))
          )}
        </View>
      </Card>

      {/* Distractions: minutes a day, against the two free hours */}
      <Card>
        <SectionLabel>Distractions · minutes a day</SectionLabel>
        <Text style={[styles.headline, { color: t.text }]}>{model.trend}</Text>
        <MiniBars values={model.days.map((d) => d.restrictedMin)} max={Math.max(120, ...model.days.map((d) => d.restrictedMin))} color={t.free} height={72} />
        <Body small muted>{`2 h free · average ${s.avgRestrictedMin} min a day`}</Body>
        <Body small muted>{`Past free time · ${s.pastFreeTotal} min`}</Body>
        <Body small muted>{`Storm time · ${s.stormTotal} min, ${s.questOpenedTotal} of it opened with quest time`}</Body>
      </Card>

      {/* Umbrella time earned and spent */}
      <Card>
        <SectionLabel>Umbrella time</SectionLabel>
        <MiniBars values={model.days.map((d) => d.earned)} max={peak} color={t.gold} height={64} />
        <MiniBars values={model.days.map((d) => d.spent)} max={peak} color={t.faint} height={32} />
        <Body small muted>{`Earned · ${s.earned} min   Spent · ${s.spent} min`}</Body>
      </Card>

      <Card>
        <SectionLabel>Emergency unlocks</SectionLabel>
        {unlocks.length === 0 ? (
          <Body muted small>None in this range.</Body>
        ) : (
          unlocks.map((u) => (
            <View key={u.at} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Body small>{u.date}</Body>
              <Body small muted>{fmtClock(u.at)}</Body>
            </View>
          ))
        )}
      </Card>
    </>
  );
}

function DayGlyph({ icon, size }: { icon: DayIcon; size: number }) {
  const t = useTheme();
  const color = icon === 'sun' ? t.gold : icon === 'partly' ? t.free : t.muted; // design: gold sun, blue partly-sunny, plain grey cloud
  return <Icon name={DAY_ICON[icon].icon} size={size} color={color} />;
}

function Legend() {
  const t = useTheme();
  return (
    <View style={styles.legend}>
      {(Object.keys(DAY_ICON) as DayIcon[]).map((k) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <DayGlyph icon={k} size={16} />
          <Text style={{ color: t.muted, fontSize: 14, fontFamily: fonts.body }}>{DAY_ICON[k].label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Week: seven big days. Month: a Monday-first grid. 6 months: a block of dots for each month. */
function Calendar({ model }: { model: Extract<ForecastModel, { state: 'ready' }> }) {
  const t = useTheme();
  const iconOf = new Map<string, DayIcon>(model.days.map((d, i) => [d.date, model.icons[i]]));

  if (model.range === 'week') {
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 }}>
        {model.days.map((d) => (
          <View key={d.date} accessible accessibilityLabel={`${d.date}: ${DAY_ICON[iconOf.get(d.date)!].label}`} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
            <Text style={{ color: t.muted, fontSize: 14, fontFamily: fonts.body }}>{WEEKDAY_SHORT[new Date(`${d.date}T12:00:00`).getDay()]}</Text>
            <DayGlyph icon={iconOf.get(d.date)!} size={24} />
          </View>
        ))}
      </View>
    );
  }

  if (model.range === 'month') {
    const first = model.days[0].date;
    const rows = calendarRows(model.days);
    return (
      <View style={{ gap: 6, marginVertical: 6 }}>
        <Text style={{ color: t.muted, fontSize: 14, fontFamily: fonts.body }}>{`${monthName(first)} ${first.slice(0, 4)}`}</Text>
        <View style={{ flexDirection: 'row' }}>
          {'MTWTFSS'.split('').map((c, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', color: t.muted, fontSize: 12, fontFamily: fonts.body }}>{c}</Text>
          ))}
        </View>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {row.map((d, c) =>
              d ? (
                <View key={d.date} accessible accessibilityLabel={`${d.date}: ${DAY_ICON[iconOf.get(d.date)!].label}`} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 3 }}>
                  <DayGlyph icon={iconOf.get(d.date)!} size={18} />
                  <Text style={{ color: t.faint, fontSize: 10, fontFamily: fonts.body }}>{Number(d.date.slice(8))}</Text>
                </View>
              ) : (
                <View key={`b${c}`} style={{ flex: 1 }} />
              ),
            )}
          </View>
        ))}
      </View>
    );
  }

  // 6 months: one block of dots per month, two blocks per row
  const byMonth = new Map<string, DaySummary[]>();
  model.days.forEach((d) => byMonth.set(d.date.slice(0, 7), [...(byMonth.get(d.date.slice(0, 7)) ?? []), d]));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, marginVertical: 6 }}>
      {[...byMonth.entries()].map(([ym, ds]) => (
        <View key={ym} style={{ width: '50%', gap: 6 }}>
          <Text style={{ color: t.muted, fontSize: 14, fontFamily: fonts.body }}>{monthName(`${ym}-15`).slice(0, 3)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingRight: 12 }}>
            {ds.map((d) => {
              const icon = iconOf.get(d.date)!;
              return (
                <View
                  key={d.date}
                  accessible
                  accessibilityLabel={`${d.date}: ${DAY_ICON[icon].label}`}
                  style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: icon === 'sun' ? t.gold : icon === 'partly' ? t.free : t.faint, opacity: icon === 'storm' ? 0.6 : 1 }}
                />
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Diagonal gold stripes: a day with no plan but quests done (as in the design). */
function Hatched({ height, color }: { height: number; color: string }) {
  const [w, setW] = React.useState(0);
  const id = React.useId().replace(/:/g, '');
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height, borderRadius: 3, overflow: 'hidden' }}>
      {w > 0 && height > 0 && (
        <Svg width={w} height={height}>
          <Defs>
            <Pattern id={id} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Rect width={6} height={6} fill="transparent" />
              <Rect width={3} height={6} fill={color} />
            </Pattern>
          </Defs>
          <Rect width={w} height={height} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One bar per day: the outline is what was planned, the gold fill is what got done. No plan = a faded bar. */
function GoalChart({ bars }: { bars: GoalBar[] }) {
  const t = useTheme();
  const max = Math.max(4, ...bars.map((b) => Math.max(b.planned, b.done)));
  const H = 110;
  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: bars.length > 20 ? 2 : 8, height: H }}>
        {bars.map((b) => {
          const outer = (Math.max(b.planned, b.done) / max) * H;
          const inner = (b.done / max) * H;
          return (
            <View key={b.date} style={{ flex: 1, height: Math.max(3, outer), justifyContent: 'flex-end', borderRadius: 4, borderWidth: b.hasPlan ? 1 : 0, borderColor: t.faint }}>
              {b.hasPlan ? (
                <View style={{ height: Math.max(0, inner), backgroundColor: t.gold, borderRadius: 3 }} />
              ) : (
                <Hatched height={Math.max(0, inner)} color={t.gold} />
              )}
            </View>
          );
        })}
      </View>
      {bars.length <= 8 && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {bars.map((b) => (
            <Text key={b.date} style={{ flex: 1, textAlign: 'center', color: t.muted, fontSize: 12, fontFamily: fonts.body }}>{weekdayLetter(b.date)}</Text>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: t.gold }} />
          <Text style={{ color: t.muted, fontSize: 14, fontFamily: fonts.body }}>Done</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: t.faint }} />
          <Text style={{ color: t.muted, fontSize: 14, fontFamily: fonts.body }}>Planned</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingBottom: space.xl, gap: space.m },
  headline: { fontSize: 20, lineHeight: 26, fontFamily: fonts.medium },
  emptyTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, textAlign: 'center', maxWidth: 300 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
});
