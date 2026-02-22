/**
 * Entrypoint: run morning cron script or main bot depending on RUN_MORNING_CRON.
 * Lets Railway use one start command for both services; set RUN_MORNING_CRON=1 for the cron service.
 */
if (process.env.RUN_MORNING_CRON) {
  await import('./sendMorning.js');
} else {
  await import('../src/index.js');
}
