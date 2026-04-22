import * as migration_20260422_024430_init from './20260422_024430_init';

export const migrations = [
  {
    up: migration_20260422_024430_init.up,
    down: migration_20260422_024430_init.down,
    name: '20260422_024430_init'
  },
];
