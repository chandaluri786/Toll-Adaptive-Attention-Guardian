// OWNER: A after hour 0 (src/ui). The icon set: Lucide, as in the approved design. Only the icons the
// design uses are imported, so the bundle stays small. Add a name here when a screen needs a new one.
import {
  ArrowLeft,
  BatteryFull,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudMoon,
  CloudSun,
  Clock,
  Footprints,
  Hourglass,
  House,
  Info,
  LifeBuoy,
  MapPin,
  Moon,
  Navigation,
  Plus,
  Settings,
  Signal,
  Smartphone,
  Sparkles,
  Sun,
  Umbrella,
  Users,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';

const ICONS = {
  'arrow-left': ArrowLeft,
  'battery-full': BatteryFull,
  'calendar-days': CalendarDays,
  camera: Camera,
  check: Check,
  'chevron-right': ChevronRight,
  cloud: Cloud,
  'cloud-lightning': CloudLightning,
  'cloud-moon': CloudMoon,
  'cloud-sun': CloudSun,
  clock: Clock,
  footprints: Footprints,
  hourglass: Hourglass,
  house: House,
  info: Info,
  'life-buoy': LifeBuoy,
  'map-pin': MapPin,
  moon: Moon,
  navigation: Navigation,
  plus: Plus,
  settings: Settings,
  signal: Signal,
  smartphone: Smartphone,
  sparkles: Sparkles,
  sun: Sun,
  umbrella: Umbrella,
  users: Users,
  wifi: Wifi,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color, strokeWidth = 2 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} />;
}
