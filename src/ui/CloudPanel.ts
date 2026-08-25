import { t } from '@/i18n';
import * as Cloud from '@/core/CloudSave';
import type { PlayerProfile } from '@/core/Save';

/**
 * 클라우드 세이브 패널. 04 문서 스타일 규칙을 따른다 —
 * 채우기 없는 사각 테두리 버튼, 라운드 0, 그림자·그라데이션 없음, 8색 팔레트 안.
 *
 * T8 설정 화면이 생기면 거기로 흡수될 임시 진입점이다.
 */
export class CloudPanel {
  private readonly root: HTMLElement;
  private status = '';

  constructor(
    parent: HTMLElement,
    private readonly getProfile: () => PlayerProfile,
    private readonly onProfileReplaced: (profile: PlayerProfile) => void,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'cloud-panel';
    this.root.dataset.open = '0';
    parent.appendChild(this.root);
    this.render();
  }

  open(): void {
    this.root.dataset.open = '1';
    this.render();
  }

  close(): void {
    this.root.dataset.open = '0';
  }

  private setStatus(message: string): void {
    this.status = message;
    this.render();
  }

  private render(): void {
    const linked = Cloud.isEnabled();
    this.root.innerHTML = `
      <div class="panel">
        <div class="panel-title">${t('ui.cloud.title')}</div>
        <div class="panel-state">${linked ? t('ui.cloud.state_on') : t('ui.cloud.state_off')}</div>
        <div class="panel-actions">
          ${
            linked
              ? `<button class="btn" data-act="issue">${t('ui.cloud.issue_code')}</button>`
              : `<button class="btn" data-act="enable">${t('ui.cloud.enable')}</button>`
          }
          <label class="panel-field">
            <span>${t('ui.cloud.code_prompt')}</span>
            <input data-role="code" maxlength="9" autocomplete="off" spellcheck="false" />
          </label>
          <button class="btn" data-act="claim">${t('ui.cloud.claim')}</button>
          <div class="panel-warn">${t('ui.cloud.claim_warn')}</div>
        </div>
        <div class="panel-status" data-role="status">${this.status}</div>
        <button class="btn" data-act="close">${t('ui.cloud.close')}</button>
      </div>
    `;

    this.root.querySelector('[data-act="close"]')?.addEventListener('click', () => this.close());
    this.root.querySelector('[data-act="enable"]')?.addEventListener('click', () => void this.enable());
    this.root.querySelector('[data-act="issue"]')?.addEventListener('click', () => void this.issue());
    this.root.querySelector('[data-act="claim"]')?.addEventListener('click', () => void this.claim());
  }

  private async enable(): Promise<void> {
    try {
      await Cloud.enable(this.getProfile());
      this.setStatus(t('ui.cloud.synced'));
    } catch (err) {
      this.setStatus(`${t('ui.cloud.error')}: ${String(err)}`);
    }
  }

  private async issue(): Promise<void> {
    try {
      const { code } = await Cloud.createLinkCode();
      this.setStatus(`${code}\n${t('ui.cloud.code_hint')}`);
    } catch (err) {
      this.setStatus(`${t('ui.cloud.error')}: ${String(err)}`);
    }
  }

  private async claim(): Promise<void> {
    const input = this.root.querySelector<HTMLInputElement>('[data-role="code"]');
    const code = input?.value.trim();
    if (!code) return;
    try {
      const profile = await Cloud.claimLinkCode(code);
      this.onProfileReplaced(profile);
      this.setStatus(t('ui.cloud.synced'));
    } catch (err) {
      this.setStatus(`${t('ui.cloud.error')}: ${String(err)}`);
    }
  }
}

/** 동기화 결과를 사람이 읽는 한 줄로. */
export function describeStatus(status: Cloud.SyncStatus): string {
  switch (status.kind) {
    case 'synced':
      return t('ui.cloud.synced');
    case 'offline':
      return t('ui.cloud.offline');
    case 'outdated':
      return t('ui.cloud.outdated');
    case 'conflict':
      return status.kept === 'local' ? t('ui.cloud.conflict_local') : t('ui.cloud.conflict_cloud');
    case 'error':
      return `${t('ui.cloud.error')}: ${status.message}`;
    case 'disabled':
      return t('ui.cloud.state_off');
  }
}
