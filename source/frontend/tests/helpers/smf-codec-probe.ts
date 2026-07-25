import type { Page } from '@playwright/test';

export interface SmfCodecProbe {
  active: boolean;
  activeHeartbeats: number;
  heartbeats: number;
  samples: Array<{
    execution: string;
    operation: string;
    percent: number;
  }>;
  intervalId: number;
  observer: MutationObserver;
}

export interface SmfCodecProbeWindow extends Window {
  __smfCodecProbe?: SmfCodecProbe;
}

export const startSmfCodecProbe = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const probeWindow = window as SmfCodecProbeWindow;
    probeWindow.__smfCodecProbe?.observer.disconnect();
    if (probeWindow.__smfCodecProbe) {
      window.clearInterval(probeWindow.__smfCodecProbe.intervalId);
    }

    const probe: SmfCodecProbe = {
      active: false,
      activeHeartbeats: 0,
      heartbeats: 0,
      samples: [],
      intervalId: 0,
      observer: new MutationObserver(() => {}),
    };
    const capture = (): void => {
      const overlay = document.querySelector<HTMLElement>('[data-testid="loading-overlay"]');
      const operation = overlay?.dataset.smfCodecOperation ?? '';
      const execution = overlay?.dataset.smfCodecExecution ?? '';
      const percent = Number(overlay?.dataset.smfCodecPercent);
      probe.active = !!operation && Number.isFinite(percent);
      if (!probe.active) return;
      const sample = { operation, execution, percent };
      const previous = probe.samples.at(-1);
      if (!previous
        || previous.operation !== sample.operation
        || previous.execution !== sample.execution
        || previous.percent !== sample.percent) {
        probe.samples.push(sample);
      }
    };
    probe.observer.disconnect();
    probe.observer = new MutationObserver(capture);
    probe.observer.observe(document.body, {
      attributes: true,
      attributeFilter: [
        'data-smf-codec-operation',
        'data-smf-codec-execution',
        'data-smf-codec-percent',
      ],
      childList: true,
      subtree: true,
    });
    probe.intervalId = window.setInterval(() => {
      probe.heartbeats += 1;
      if (probe.active) probe.activeHeartbeats += 1;
    }, 1);
    probeWindow.__smfCodecProbe = probe;
    capture();
  });
};

export const stopSmfCodecProbe = async (page: Page): Promise<Omit<SmfCodecProbe, 'observer' | 'intervalId'>> => {
  return page.evaluate(() => {
    const probeWindow = window as SmfCodecProbeWindow;
    const probe = probeWindow.__smfCodecProbe;
    if (!probe) {
      return {
        active: false,
        activeHeartbeats: 0,
        heartbeats: 0,
        samples: [],
      };
    }
    probe.observer.disconnect();
    window.clearInterval(probe.intervalId);
    probeWindow.__smfCodecProbe = undefined;
    return {
      active: probe.active,
      activeHeartbeats: probe.activeHeartbeats,
      heartbeats: probe.heartbeats,
      samples: probe.samples,
    };
  });
};
