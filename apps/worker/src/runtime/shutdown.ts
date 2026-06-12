import {clearTimeout} from 'node:timers';

export async function waitForActiveRun(activeRun: Promise<boolean>, shutdownGraceMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return Promise.race([
      activeRun.then(() => true, () => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), shutdownGraceMs);
      })
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
