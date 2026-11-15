// OWNER: B (task B8). Quest sheet copy per quest type, from docs/design 3.1–3.6 where the design
// shows it; the rest follows the same voice. Pay figures are display only — the ledger mints.
import type { TaskType } from '../contracts';
import { QUEST_TARGETS } from './quest-rules';

/** Minutes a full pass pays ("Earning" table in the planning doc; C's ledger is the source of truth). */
export const QUEST_PAY: Record<TaskType, number> = { fitness: 25, place: 25, meetup: 25, study: 20, coding: 20, focus: 15 };

/** What a pass at this rate pays, rounded like the ledger rounds. */
export const payFor = (type: TaskType, rate = 1): number => Math.round(QUEST_PAY[type] * rate);

export type QuestCopy = {
  offerTitle: string;
  activeTitle: string;
  chip: string;
  checks: string[];
  passHeadline: string;
  missHint: string | null;
};

const NO_RUSH = 'No rush — finish any time today';
const LOCAL = 'Nothing leaves your device';

export const QUEST_COPY: Record<TaskType, QuestCopy> = {
  fitness: {
    offerTitle: 'Walk 2,000 steps',
    activeTitle: 'Walk 2,000 steps',
    chip: 'Walk 2,000',
    checks: ['The step counter on this phone', LOCAL, NO_RUSH],
    passHeadline: '2,000 steps.',
    missHint: 'Steps count from when you started the quest.',
  },
  place: {
    offerTitle: '45 minutes away from home',
    activeTitle: 'Away from home',
    chip: `Away ${QUEST_TARGETS.place} min`,
    checks: ['How far you are from home, only while the quest runs', LOCAL, NO_RUSH],
    passHeadline: '45 minutes out.',
    missHint: "The 45 minutes start once you're past 500 m.",
  },
  meetup: {
    offerTitle: 'Meet up with someone',
    activeTitle: 'Meetup',
    chip: 'Meetup',
    checks: ['A 3-word code you write by hand', 'Read on this phone — the photo is deleted', 'Over 500 m from home'],
    passHeadline: 'Code matched.',
    missHint: null,
  },
  study: {
    offerTitle: 'Quick quiz',
    activeTitle: 'Quiz',
    chip: 'Quiz',
    checks: ["Three questions on today's topic", '90 seconds · 2 right to pass', 'Your answers stay on this phone'],
    passHeadline: 'Quiz done.',
    missHint: 'The next try draws three new questions.',
  },
  coding: {
    offerTitle: 'Push a commit',
    activeTitle: 'Commit',
    chip: 'Commit',
    checks: ['New commits on your GitHub, checked every 5 minutes', 'Only your username or repo goes to GitHub — no sign-in', NO_RUSH],
    passHeadline: 'Commit pushed.',
    missHint: 'Commits count from when you started the quest. GitHub can take a few minutes to show them.',
  },
  focus: {
    offerTitle: 'Phone-down focus',
    activeTitle: 'Phone-down focus',
    chip: 'Phone-down',
    checks: ['Screen-off time on this phone', '25 minutes in a row', LOCAL],
    passHeadline: '25 minutes, phone down.',
    missHint: 'The 25 minutes need to be in a row, screen off.',
  },
};

/** Order of the "Other quests" chips (3.1). */
export const CHIP_ORDER: TaskType[] = ['fitness', 'place', 'meetup', 'study', 'coding', 'focus'];
export const OFFER_FOOTER = 'If the sensor misses it, you can still claim half.';
