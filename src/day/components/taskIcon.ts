// OWNER: B. The Lucide icon for each quest / task type (designs 2.1, 3.1, 4.1). Icons come only from
// src/ui/Icon (A's). The design uses book-open (study) and code (coding), which Icon.tsx doesn't import
// yet; until A adds them, study shows sparkles and coding shows smartphone.
import type { TaskType } from '../../contracts';
import type { IconName } from '../../ui/Icon';

export const TASK_ICON: Record<TaskType, IconName> = {
  fitness: 'footprints',
  place: 'map-pin',
  meetup: 'users',
  study: 'sparkles',
  coding: 'smartphone',
  focus: 'smartphone',
};
