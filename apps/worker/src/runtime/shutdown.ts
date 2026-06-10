export async function waitForActiveRun(activeRun: Promise<boolean>, shutdownGraceMs: number): Promise<boolean> {
  return Promise.race([
    activeRun.then(() => true),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), shutdownGraceMs);
    })
  ]);
}
