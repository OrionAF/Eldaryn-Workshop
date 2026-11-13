import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import RunPulse from './RunPulse.svelte';
import { setup } from './testkit.js';

// Named *.svelte.test.js so the job can be $state and change after mount.
const T0 = 1_700_000_000_000;

afterEach(() => {
  vi.useRealTimers();
});

function mount(job, count = null) {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const props = $state({ job, count });
  const t = setup(RunPulse, props);
  const tick = (ms) => {
    vi.advanceTimersByTime(ms);
    flushSync();
  };
  const report = (c) => {
    props.job.progressAt = Date.now();
    props.count = c;
    flushSync();
  };
  return { t, props, tick, report, text: () => t.target.textContent.replace(/\s+/g, ' ').trim() };
}

describe('RunPulse', () => {
  it('shows nothing for a job that is not running or queued', () => {
    const { t } = mount({ status: 'finished', startedAt: T0 });
    expect(t.q('[data-testid=run-pulse]')).toBeNull();
    t.done();
  });

  it('says a queued job is waiting', () => {
    const { t, text } = mount({ status: 'queued', queuedAt: T0 });
    expect(text()).toContain('Queued');
    t.done();
  });

  it('counts the elapsed time up every second', () => {
    const { t, tick } = mount({ status: 'running', startedAt: T0, progressAt: T0 });
    expect(t.q('[data-testid=pulse-elapsed]').textContent).toBe('0s');
    tick(3000);
    expect(t.q('[data-testid=pulse-elapsed]').textContent).toBe('3s');
    tick(60_000);
    expect(t.q('[data-testid=pulse-elapsed]').textContent).toBe('1m 03s');
    t.done();
  });

  it('works out the rate from the count between reports', () => {
    const { t, tick, report } = mount({ status: 'running', startedAt: T0, progressAt: null });
    report(0);
    expect(t.q('[data-testid=pulse-rate]')).toBeNull(); // one report is not a rate
    tick(2000);
    report(5000);
    expect(t.q('[data-testid=pulse-rate]').textContent).toBe('2.500');
    t.done();
  });

  it('goes quiet, then warns, as the time since the last report grows', () => {
    const { t, tick, report, text } = mount({ status: 'running', startedAt: T0, progressAt: T0 });
    expect(text()).toContain('reporting now');
    tick(10_000);
    expect(t.q('.pulse').classList.contains('quiet')).toBe(true);
    expect(text()).toContain('last report 10s ago');
    tick(40_000);
    expect(t.q('.pulse').classList.contains('stalled')).toBe(true);
    expect(text()).toContain('no report for 50s');
    expect(t.q('.advice')).not.toBeNull();
    report(1); // a report brings it back
    expect(t.q('.pulse').classList.contains('live')).toBe(true);
    expect(t.q('.advice')).toBeNull();
    t.done();
  });
});
