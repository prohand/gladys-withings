// -----------------------------------------------------------------------------
// Scene trigger keys (manifest `scene_triggers`, Gladys 5.1+).
//
// Keys are stored by the users' scenes: a published key is NEVER renamed.
// test/manifest.test.js checks that every key here is declared, and the other
// way round.
// -----------------------------------------------------------------------------

export const SCENE_TRIGGERS = {
  // A new weigh-in, blood pressure reading, temperature... (one per group).
  NEW_MEASUREMENT: 'new_measurement',
  // Sleep Analyzer: someone got into / out of bed (Gladys Plus notifications).
  BED_IN: 'bed_in',
  BED_OUT: 'bed_out',
  // The summary of last night is available.
  SLEEP_SUMMARY_READY: 'sleep_summary_ready',
  // Today's steps reached the goal set in the configuration (once a day).
  STEPS_GOAL_REACHED: 'steps_goal_reached',
};
