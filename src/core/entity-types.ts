/**
 * Entity types, mirrored from the upstream SuperSync wire contract
 * (`packages/shared-schema/src/entity-types.ts`).
 *
 * The server rejects unknown entity types, so these strings are a fixed
 * contract — never rename or "clean up" one.
 */
export const ENTITY_TYPES = [
  'TASK',
  'PROJECT',
  'TAG',
  'NOTE',
  'GLOBAL_CONFIG',
  'SIMPLE_COUNTER',
  'WORK_CONTEXT',
  'TIME_TRACKING',
  'TASK_REPEAT_CFG',
  'ISSUE_PROVIDER',
  'PLANNER',
  'MENU_TREE',
  'METRIC',
  'BOARD',
  'SECTION',
  'REMINDER',
  'PLUGIN_USER_DATA',
  'PLUGIN_METADATA',
  'MIGRATION',
  'RECOVERY', // full-state disaster-recovery imports
  'ALL', // full-state imports (sync / backup)
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

const ENTITY_TYPE_SET: ReadonlySet<string> = new Set(ENTITY_TYPES);

export const isEntityType = (value: string): value is EntityType =>
  ENTITY_TYPE_SET.has(value);
