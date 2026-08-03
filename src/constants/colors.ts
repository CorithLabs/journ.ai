export const DAY_COLORS = [
  '#06b6d4', // cyan-500
  '#0ea5e9', // sky-500
  '#8b5cf6', // violet-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
] as const;

export const getDayColor = (dayIndex: number): string =>
  DAY_COLORS[dayIndex % DAY_COLORS.length];
