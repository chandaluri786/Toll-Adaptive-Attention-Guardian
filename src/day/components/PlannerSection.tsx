// OWNER: B (Spec B — task B1). Rendered inside C's Settings container: home, sleep window, and the
// timetable editor (blocks up to 4 h, sleep up to 10 h, with the cap message from the design).
import React from 'react';
import { View } from 'react-native';
import { space } from '../../ui/theme';
import { SectionTitle } from './fields';
import HomePicker from './HomePicker';
import SleepWindowEditor from './SleepWindowEditor';
import TimetableEditor from './TimetableEditor';

export default function PlannerSection() {
  return (
    <View style={{ gap: space.l }}>
      <View style={{ gap: space.s }}>
        <SectionTitle>Home</SectionTitle>
        <HomePicker />
      </View>
      <View style={{ gap: space.s }}>
        <SectionTitle>Sleep</SectionTitle>
        <SleepWindowEditor />
      </View>
      <View style={{ gap: space.s }}>
        <SectionTitle>Timetable</SectionTitle>
        <TimetableEditor />
      </View>
    </View>
  );
}
