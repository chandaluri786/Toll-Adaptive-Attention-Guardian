// OWNER: A (task A5). Fail-open opens everything when enforcement cannot be trusted, and never because of
// going offline or a changed clock.
import { STALE_AFTER_MS, createFailOpenGuard } from '../failOpen';

function setup() {
  let mono = 0; // the monotonic clock, in ms since "app start"
  const guard = createFailOpenGuard(() => mono);
  return { guard, advance: (ms: number) => (mono += ms) };
}

describe('fail-open guard', () => {
  it('trusts a healthy engine', () => {
    const { guard, advance } = setup();
    guard.observe(1);
    advance(60_000);
    guard.observe(2); // the engine recomputed (new computedAt)
    advance(60_000);
    guard.observe(3);
    expect(guard.openReason()).toBeNull();
  });

  it('opens everything once the engine has been silent for over 3 minutes', () => {
    const { guard, advance } = setup();
    guard.observe(1);
    advance(STALE_AFTER_MS);
    expect(guard.openReason()).toBeNull(); // exactly 3 min is still fine
    advance(1);
    expect(guard.openReason()).toBe('engine_silent');
  });

  it('a steady weather is NOT silence: only an unchanged computedAt stamp is', () => {
    const { guard, advance } = setup();
    for (let i = 1; i <= 20; i++) {
      guard.observe(i); // 20 minutes, same weather, but computedAt keeps moving
      advance(60_000);
    }
    expect(guard.openReason()).toBeNull();
  });

  it('recovers as soon as the engine speaks again', () => {
    const { guard, advance } = setup();
    guard.observe(1);
    advance(STALE_AFTER_MS + 1);
    expect(guard.openReason()).toBe('engine_silent');
    guard.observe(2);
    expect(guard.openReason()).toBeNull();
  });

  it('opens when a blocking permission is revoked, and recovers when it is back', () => {
    const { guard } = setup();
    guard.setPermissions(false);
    expect(guard.openReason()).toBe('permission_revoked');
    guard.setPermissions(true);
    expect(guard.openReason()).toBeNull();
  });

  it('opens when the engine throws, until the next fresh result', () => {
    const { guard } = setup();
    guard.observe(1);
    guard.reportFailure();
    expect(guard.openReason()).toBe('engine_error');
    guard.observe(2);
    expect(guard.openReason()).toBeNull();
  });

  it('changing the phone clock cannot trigger it: only the monotonic timer matters', () => {
    // The guard never reads wall-clock time. A wildly different computedAt (the clock was changed)
    // is just "a new stamp", i.e. proof of life, not a reason to open.
    const { guard, advance } = setup();
    guard.observe(1_700_000_000_000);
    advance(60_000);
    guard.observe(900); // clock set back years
    expect(guard.openReason()).toBeNull();
  });
});
