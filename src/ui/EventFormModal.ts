import {
  ATTENDANCE_META,
  EVENT_TYPE_LIST,
  EVENT_TYPE_META,
  PRIORITY_META,
  REMINDER_OPTIONS,
} from '../constants';
import {FamilyStore} from '../store/familyStore';
import {
  AttendanceStatus,
  EventPriority,
  EventType,
  FamilyEvent,
  PaymentSource,
  ReminderOffset,
} from '../types';
import {audioFeedback} from '../utils/audioFeedback';
import {
  addDaysToISO,
  convertLunarToSolarISO,
  formatDateVN,
  formatDaysUntilLabel,
  formatLunarShort,
  formatVND,
  getDaysDifference,
  getLunarFromISO,
  getTodayISO,
  parseVNDInput,
} from '../utils/lunarCalendar';

type ModalMode =
  | {kind: 'closed'}
  | {kind: 'add'; initialDate?: string}
  | {kind: 'edit'; eventId: string}
  | {kind: 'detail'; eventId: string};

const QUICK_AMOUNTS = [
  {label: '500k', value: 500_000},
  {label: '1 triệu', value: 1_000_000},
  {label: '2 triệu', value: 2_000_000},
  {label: '3 triệu', value: 3_000_000},
  {label: '5 triệu', value: 5_000_000},
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Clean 2D modal controller for adding/editing events (with both Solar date picker
 * and Lunar date converter) and viewing event details / confirming actual expenses.
 */
export class EventFormModal {
  private store: FamilyStore;
  private overlayEl: HTMLDivElement;
  private mode: ModalMode = {kind: 'closed'};
  private dateInputMode: 'solar' | 'lunar' = 'solar';
  private formError = '';
  private confirmDeletePending = false;
  private onKeyDownBound: (e: KeyboardEvent) => void;

  constructor(store: FamilyStore) {
    this.store = store;
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'modal-backdrop is-hidden';
    this.overlayEl.setAttribute('role', 'dialog');
    this.overlayEl.setAttribute('aria-modal', 'true');
    document.body.appendChild(this.overlayEl);

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.mode.kind !== 'closed') {
        this.close();
      }
    };
    window.addEventListener('keydown', this.onKeyDownBound);
    this.bindEvents();
  }

  openAdd(initialDate?: string) {
    this.mode = {kind: 'add', initialDate};
    this.dateInputMode = 'solar';
    this.formError = '';
    this.confirmDeletePending = false;
    this.render();
  }

  openEdit(eventId: string) {
    const ev = this.store.getState().events.find((e) => e.id === eventId);
    if (!ev) return;
    this.mode = {kind: 'edit', eventId};
    this.dateInputMode = ev.repeatByLunar ? 'lunar' : 'solar';
    this.formError = '';
    this.confirmDeletePending = false;
    this.render();
  }

  openDetail(eventId: string) {
    const ev = this.store.getState().events.find((e) => e.id === eventId);
    if (!ev) return;
    this.mode = {kind: 'detail', eventId};
    this.formError = '';
    this.confirmDeletePending = false;
    this.render();
  }

  close() {
    this.mode = {kind: 'closed'};
    this.formError = '';
    this.confirmDeletePending = false;
    this.overlayEl.classList.add('is-hidden');
    this.overlayEl.innerHTML = '';
  }

  refreshIfOpen() {
    if (this.mode.kind === 'detail') {
      const targetId = this.mode.eventId;
      const exists = this.store.getState().events.some((e) => e.id === targetId);
      if (!exists) {
        this.close();
      } else {
        this.render();
      }
    }
  }

  private bindEvents() {
    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) {
        this.close();
        return;
      }

      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-modal-action]');
      if (!target) return;
      const action = target.dataset.modalAction;

      if (action === 'close') {
        this.close();
      } else if (action === 'set-date-mode') {
        const nextMode = target.dataset.mode as 'solar' | 'lunar' | undefined;
        if (nextMode && nextMode !== this.dateInputMode) {
          this.dateInputMode = nextMode;
          this.syncDateModePanels();
        }
      } else if (action === 'quick-date') {
        const offset = Number(target.dataset.offset ?? 0);
        const iso = addDaysToISO(getTodayISO(), offset);
        const input = this.overlayEl.querySelector<HTMLInputElement>('#mf-solar-date');
        if (input) {
          input.value = iso;
          this.syncLunarFromSolarInput();
        }
      } else if (action === 'quick-amount') {
        const amount = Number(target.dataset.amount ?? 0);
        const input = this.overlayEl.querySelector<HTMLInputElement>('#mf-amount');
        if (input) {
          input.value = String(amount);
          this.updateAmountPreview('#mf-amount', '#mf-amount-preview');
        }
      } else if (action === 'detail-quick-amount') {
        const amount = Number(target.dataset.amount ?? 0);
        const input = this.overlayEl.querySelector<HTMLInputElement>('#df-actual-amount');
        if (input) {
          input.value = String(amount);
          this.updateAmountPreview('#df-actual-amount', '#df-amount-preview');
          this.updateOverdraftPreview();
        }
      } else if (action === 'detail-attendance') {
        if (this.mode.kind !== 'detail') return;
        const status = target.dataset.status as AttendanceStatus | undefined;
        if (status) {
          audioFeedback.playConfirm();
          this.store.setAttendance(this.mode.eventId, status);
          this.render();
        }
      } else if (action === 'switch-to-edit') {
        if (this.mode.kind === 'detail') {
          audioFeedback.playSelect();
          this.openEdit(this.mode.eventId);
        }
      } else if (action === 'delete-event') {
        if (this.mode.kind !== 'detail') return;
        if (!this.confirmDeletePending) {
          this.confirmDeletePending = true;
          audioFeedback.playWarning();
          this.render();
        } else {
          const id = this.mode.eventId;
          this.close();
          this.store.deleteEvent(id);
        }
      }
    });

    this.overlayEl.addEventListener('input', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'mf-solar-date') {
        this.syncLunarFromSolarInput();
      } else if (
        el.id === 'mf-lunar-day' ||
        el.id === 'mf-lunar-month' ||
        el.id === 'mf-lunar-year'
      ) {
        this.syncSolarFromLunarInputs();
      } else if (el.id === 'mf-amount') {
        this.updateAmountPreview('#mf-amount', '#mf-amount-preview');
      } else if (el.id === 'df-actual-amount') {
        this.updateAmountPreview('#df-actual-amount', '#df-amount-preview');
        this.updateOverdraftPreview();
      }
    });

    this.overlayEl.addEventListener('change', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'mf-event-type') {
        const type = (el as HTMLSelectElement).value as EventType;
        const lunarRepeat = this.overlayEl.querySelector<HTMLInputElement>('#mf-repeat-lunar');
        if (
          lunarRepeat &&
          (type === EventType.DEATH_ANNIVERSARY || type === EventType.CLAN_CEREMONY)
        ) {
          lunarRepeat.checked = true;
        }
      } else if (el.id === 'df-payment-source') {
        this.updateOverdraftPreview();
      }
    });

    this.overlayEl.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;
      if (form.id === 'event-editor-form') {
        e.preventDefault();
        this.handleEventFormSubmit(form);
      } else if (form.id === 'event-expense-form') {
        e.preventDefault();
        this.handleExpenseSubmit(form);
      }
    });
  }

  private syncDateModePanels() {
    const solarPanel = this.overlayEl.querySelector<HTMLElement>('#mf-solar-panel');
    const lunarPanel = this.overlayEl.querySelector<HTMLElement>('#mf-lunar-panel');
    const btns = this.overlayEl.querySelectorAll<HTMLElement>('[data-modal-action="set-date-mode"]');
    btns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === this.dateInputMode);
    });
    if (solarPanel && lunarPanel) {
      solarPanel.style.display = this.dateInputMode === 'solar' ? 'flex' : 'none';
      lunarPanel.style.display = this.dateInputMode === 'lunar' ? 'flex' : 'none';
    }
    if (this.dateInputMode === 'lunar') {
      this.syncSolarFromLunarInputs();
    } else {
      this.syncLunarFromSolarInput();
    }
  }

  private syncLunarFromSolarInput() {
    const solarInput = this.overlayEl.querySelector<HTMLInputElement>('#mf-solar-date');
    const preview = this.overlayEl.querySelector<HTMLElement>('#mf-dual-date-preview');
    if (!solarInput || !preview) return;
    const iso = solarInput.value;
    const lunar = getLunarFromISO(iso);
    if (!lunar) {
      preview.textContent = 'Vui lòng chọn ngày hợp lệ.';
      return;
    }
    preview.textContent = `Dương lịch: ${formatDateVN(iso)} · Âm lịch: ${formatLunarShort(iso)}`;

    const dEl = this.overlayEl.querySelector<HTMLSelectElement>('#mf-lunar-day');
    const mEl = this.overlayEl.querySelector<HTMLSelectElement>('#mf-lunar-month');
    const yEl = this.overlayEl.querySelector<HTMLSelectElement>('#mf-lunar-year');
    if (dEl) dEl.value = String(lunar.day);
    if (mEl) mEl.value = String(lunar.month);
    if (yEl) yEl.value = String(lunar.year);
  }

  private syncSolarFromLunarInputs() {
    const dEl = this.overlayEl.querySelector<HTMLSelectElement>('#mf-lunar-day');
    const mEl = this.overlayEl.querySelector<HTMLSelectElement>('#mf-lunar-month');
    const yEl = this.overlayEl.querySelector<HTMLSelectElement>('#mf-lunar-year');
    const solarInput = this.overlayEl.querySelector<HTMLInputElement>('#mf-solar-date');
    const preview = this.overlayEl.querySelector<HTMLElement>('#mf-dual-date-preview');
    if (!dEl || !mEl || !yEl || !solarInput || !preview) return;

    const iso = convertLunarToSolarISO(Number(dEl.value), Number(mEl.value), Number(yEl.value));
    if (iso) {
      solarInput.value = iso;
      preview.textContent = `Quy đổi Dương lịch: ${formatDateVN(iso)} · Âm lịch: ${formatLunarShort(iso)}`;
    } else {
      preview.textContent = 'Ngày Âm lịch này không tồn tại trong năm đã chọn.';
    }
  }

  private updateAmountPreview(inputSelector: string, previewSelector: string) {
    const input = this.overlayEl.querySelector<HTMLInputElement>(inputSelector);
    const preview = this.overlayEl.querySelector<HTMLElement>(previewSelector);
    if (!input || !preview) return;
    const amount = parseVNDInput(input.value);
    preview.textContent = amount > 0 ? `= ${formatVND(amount)}` : '0đ (không ghi tiền)';
  }

  private updateOverdraftPreview() {
    if (this.mode.kind !== 'detail') return;
    const targetId = this.mode.eventId;
    const ev = this.store.getState().events.find((e) => e.id === targetId);
    const warnEl = this.overlayEl.querySelector<HTMLElement>('#df-overdraft-warning');
    const amountInput = this.overlayEl.querySelector<HTMLInputElement>('#df-actual-amount');
    const sourceSelect = this.overlayEl.querySelector<HTMLSelectElement>('#df-payment-source');
    if (!ev || !warnEl || !amountInput || !sourceSelect) return;

    const amount = parseVNDInput(amountInput.value);
    const source = sourceSelect.value as PaymentSource;
    const summary = this.store.getFinancialSummary(ev.familyId);
    const prevFromFund =
      ev.expenseConfirmed && ev.paymentSource === PaymentSource.FAMILY_FUND ? ev.actualAmount : 0;
    const available = summary.fundBalance + prevFromFund;

    if (source === PaymentSource.FAMILY_FUND && amount > available) {
      warnEl.textContent = `Lưu ý: Khoản chi ${formatVND(amount)} vượt số dư Quỹ chung hiện có (${formatVND(available)}).`;
      warnEl.style.display = 'block';
    } else {
      warnEl.style.display = 'none';
    }
  }

  private handleEventFormSubmit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const title = String(fd.get('title') ?? '').trim();
    const eventType = (fd.get('eventType') as EventType) || EventType.FAMILY_EVENT;
    const priority = (fd.get('priority') as EventPriority) || EventPriority.NORMAL;
    const relatedPerson = String(fd.get('relatedPerson') ?? '').trim();
    const eventTime = String(fd.get('eventTime') ?? '').trim();
    const location = String(fd.get('location') ?? '').trim();
    const note = String(fd.get('note') ?? '').trim();
    const expectedAmount = parseVNDInput(String(fd.get('expectedAmount') ?? '0'));
    const paymentSource = (fd.get('paymentSource') as PaymentSource) || PaymentSource.PERSONAL;
    const repeatByLunar = fd.get('repeatByLunar') === 'on';
    const repeatYearly = fd.get('repeatYearly') === 'on' || repeatByLunar;

    let eventDate = String(fd.get('solarDate') ?? '').trim();
    if (this.dateInputMode === 'lunar') {
      const lDay = Number(fd.get('lunarDay') ?? 1);
      const lMonth = Number(fd.get('lunarMonth') ?? 1);
      const lYear = Number(fd.get('lunarYear') ?? new Date().getFullYear());
      const converted = convertLunarToSolarISO(lDay, lMonth, lYear);
      if (converted) eventDate = converted;
    }

    const reminders = fd
      .getAll('reminders')
      .map((v) => Number(v) as ReminderOffset)
      .filter((v) => !Number.isNaN(v));

    if (!title) {
      this.formError = 'Vui lòng nhập tên sự kiện.';
      audioFeedback.playWarning();
      this.renderErrorBanner();
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      this.formError = 'Vui lòng chọn ngày diễn ra hợp lệ.';
      audioFeedback.playWarning();
      this.renderErrorBanner();
      return;
    }

    const draft = {
      title,
      eventType,
      relatedPerson,
      eventDate,
      eventTime,
      location,
      priority,
      note,
      expectedAmount,
      paymentSource,
      repeatYearly,
      repeatByLunar,
      reminders,
    };

    audioFeedback.playSuccess();
    if (this.mode.kind === 'edit') {
      this.store.updateEvent(this.mode.eventId, draft);
    } else {
      this.store.addEvent(draft);
    }
    this.close();
  }

  private handleExpenseSubmit(form: HTMLFormElement) {
    if (this.mode.kind !== 'detail') return;
    const fd = new FormData(form);
    const amount = parseVNDInput(String(fd.get('actualAmount') ?? '0'));
    const source = (fd.get('paymentSource') as PaymentSource) || PaymentSource.PERSONAL;

    if (amount <= 0) {
      this.formError = 'Vui lòng nhập số tiền thực tế lớn hơn 0 (VD: 1000000 hoặc 2tr).';
      audioFeedback.playWarning();
      this.renderErrorBanner();
      return;
    }

    const {overdraftWarning} = this.store.confirmEventExpense(this.mode.eventId, amount, source);
    if (overdraftWarning) {
      audioFeedback.playWarning();
    } else {
      audioFeedback.playSuccess();
    }
    this.formError = '';
    this.render();
  }

  private renderErrorBanner() {
    const el = this.overlayEl.querySelector<HTMLElement>('#modal-form-error');
    if (el) {
      el.textContent = this.formError;
      el.style.display = this.formError ? 'block' : 'none';
    }
  }

  private render() {
    if (this.mode.kind === 'closed') {
      this.overlayEl.classList.add('is-hidden');
      return;
    }

    this.overlayEl.classList.remove('is-hidden');

    if (this.mode.kind === 'detail') {
      const targetId = this.mode.eventId;
      const ev = this.store.getState().events.find((e) => e.id === targetId);
      if (!ev) {
        this.close();
        return;
      }
      this.overlayEl.innerHTML = this.renderDetailMarkup(ev);
      this.updateOverdraftPreview();
      return;
    }

    const editId = this.mode.kind === 'edit' ? this.mode.eventId : null;
    const editingEvent = editId
      ? this.store.getState().events.find((e) => e.id === editId) ?? null
      : null;
    const initialDate =
      editingEvent?.eventDate ??
      (this.mode.kind === 'add' && this.mode.initialDate
        ? this.mode.initialDate
        : addDaysToISO(getTodayISO(), 3));

    this.overlayEl.innerHTML = this.renderEditorMarkup(editingEvent, initialDate);
    this.syncDateModePanels();
  }

  private renderEditorMarkup(ev: FamilyEvent | null, initialDate: string): string {
    const isEdit = Boolean(ev);
    const lunar = getLunarFromISO(initialDate) ?? {day: 1, month: 1, year: 2026, isLeap: false};
    const currentYear = Number(getTodayISO().slice(0, 4)) || 2026;
    const yearOptions = Array.from({length: 8}, (_, i) => currentYear - 1 + i);
    const activeReminders = ev?.reminders ?? [
      ReminderOffset.SEVEN_DAYS,
      ReminderOffset.THREE_DAYS,
      ReminderOffset.ONE_DAY,
      ReminderOffset.SAME_DAY,
    ];
    const defaultAmount = ev ? ev.expectedAmount : 1_000_000;

    return `
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">${isEdit ? 'Chỉnh sửa sự kiện' : 'Thêm sự kiện mới'}</h2>
            <p class="modal-subtitle">Nhập thông tin cơ bản — lịch Âm &amp; Dương được tự động quy đổi.</p>
          </div>
          <button type="button" class="modal-close-btn" data-modal-action="close" aria-label="Đóng">✕</button>
        </div>

        <form id="event-editor-form" class="modal-body">
          <div class="form-grid-2">
            <label class="form-field form-span-2">
              <span>Tên sự kiện *</span>
              <input
                name="title"
                type="text"
                required
                value="${escapeHtml(ev?.title ?? '')}"
                placeholder="VD: Ngày giỗ Ông nội, Đám cưới Anh Minh, Đầy tháng Bé Na..."
              />
            </label>

            <label class="form-field">
              <span>Loại sự kiện *</span>
              <select id="mf-event-type" name="eventType">
                ${EVENT_TYPE_LIST.map(
                  (t) =>
                    `<option value="${t}" ${ev?.eventType === t ? 'selected' : ''}>${escapeHtml(EVENT_TYPE_META[t].label)}</option>`,
                ).join('')}
              </select>
            </label>

            <label class="form-field">
              <span>Mức độ ưu tiên</span>
              <select name="priority">
                <option value="${EventPriority.IMPORTANT}" ${ev?.priority === EventPriority.IMPORTANT ? 'selected' : ''}>Quan trọng</option>
                <option value="${EventPriority.NORMAL}" ${!ev || ev.priority === EventPriority.NORMAL ? 'selected' : ''}>Bình thường</option>
                <option value="${EventPriority.OPTIONAL}" ${ev?.priority === EventPriority.OPTIONAL ? 'selected' : ''}>Không bắt buộc</option>
              </select>
            </label>

            <div class="form-field form-span-2">
              <div class="form-label-row">
                <span>Ngày diễn ra *</span>
                <div class="segmented-mini" role="group" aria-label="Chọn kiểu nhập ngày">
                  <button
                    type="button"
                    class="seg-mini-btn ${this.dateInputMode === 'solar' ? 'is-active' : ''}"
                    data-modal-action="set-date-mode"
                    data-mode="solar"
                  >Nhập Dương lịch</button>
                  <button
                    type="button"
                    class="seg-mini-btn ${this.dateInputMode === 'lunar' ? 'is-active' : ''}"
                    data-modal-action="set-date-mode"
                    data-mode="lunar"
                  >Nhập Âm lịch</button>
                </div>
              </div>

              <div id="mf-solar-panel" class="date-input-row">
                <input id="mf-solar-date" name="solarDate" type="date" value="${escapeHtml(initialDate)}" required />
                <div class="quick-btn-strip">
                  <button type="button" class="mini-btn" data-modal-action="quick-date" data-offset="0">Hôm nay</button>
                  <button type="button" class="mini-btn" data-modal-action="quick-date" data-offset="1">Ngày mai</button>
                  <button type="button" class="mini-btn" data-modal-action="quick-date" data-offset="3">+3 ngày</button>
                  <button type="button" class="mini-btn" data-modal-action="quick-date" data-offset="7">+7 ngày</button>
                </div>
              </div>

              <div id="mf-lunar-panel" class="lunar-picker-row" style="display: none;">
                <select id="mf-lunar-day" name="lunarDay" aria-label="Ngày Âm lịch">
                  ${Array.from({length: 30}, (_, i) => i + 1)
                    .map(
                      (d) => `<option value="${d}" ${lunar.day === d ? 'selected' : ''}>Ngày ${d} ÂL</option>`,
                    )
                    .join('')}
                </select>
                <select id="mf-lunar-month" name="lunarMonth" aria-label="Tháng Âm lịch">
                  ${Array.from({length: 12}, (_, i) => i + 1)
                    .map(
                      (m) => `<option value="${m}" ${lunar.month === m ? 'selected' : ''}>Tháng ${m} ÂL</option>`,
                    )
                    .join('')}
                </select>
                <select id="mf-lunar-year" name="lunarYear" aria-label="Năm Âm lịch">
                  ${yearOptions
                    .map(
                      (y) => `<option value="${y}" ${lunar.year === y ? 'selected' : ''}>Năm ${y}</option>`,
                    )
                    .join('')}
                </select>
              </div>

              <p id="mf-dual-date-preview" class="field-helper-text tabular-nums">
                Dương lịch: ${escapeHtml(formatDateVN(initialDate))} · Âm lịch: ${escapeHtml(formatLunarShort(initialDate))}
              </p>
            </div>

            <label class="form-field">
              <span>Giờ tổ chức</span>
              <input name="eventTime" type="time" value="${escapeHtml(ev?.eventTime ?? '10:00')}" />
            </label>

            <label class="form-field">
              <span>Người liên quan</span>
              <input
                name="relatedPerson"
                type="text"
                value="${escapeHtml(ev?.relatedPerson ?? '')}"
                placeholder="VD: Ông nội, Anh Hùng, Gia đình chú Tư..."
              />
            </label>

            <label class="form-field form-span-2">
              <span>Địa điểm</span>
              <input
                name="location"
                type="text"
                value="${escapeHtml(ev?.location ?? '')}"
                placeholder="VD: Nhà từ đường, Nhà hàng Sen Vàng..."
              />
            </label>

            <div class="form-field form-span-2">
              <div class="form-label-row">
                <span>Tiền đám dự kiến (VNĐ)</span>
                <span id="mf-amount-preview" class="field-amount-preview tabular-nums">= ${escapeHtml(formatVND(defaultAmount))}</span>
              </div>
              <input
                id="mf-amount"
                name="expectedAmount"
                type="text"
                value="${defaultAmount > 0 ? String(defaultAmount) : ''}"
                placeholder="Nhập số tiền (VD: 1000000 hoặc 2tr)"
              />
              <div class="quick-btn-strip">
                ${QUICK_AMOUNTS.map(
                  (q) =>
                    `<button type="button" class="mini-btn" data-modal-action="quick-amount" data-amount="${q.value}">${q.label}</button>`,
                ).join('')}
              </div>
            </div>

            <label class="form-field">
              <span>Nguồn chi dự kiến</span>
              <select name="paymentSource">
                <option value="${PaymentSource.PERSONAL}" ${!ev || ev.paymentSource === PaymentSource.PERSONAL ? 'selected' : ''}>Tiền cá nhân</option>
                <option value="${PaymentSource.FAMILY_FUND}" ${ev?.paymentSource === PaymentSource.FAMILY_FUND ? 'selected' : ''}>Quỹ chung dòng họ</option>
              </select>
            </label>

            <div class="form-field form-checkbox-stack">
              <label class="check-row">
                <input id="mf-repeat-lunar" name="repeatByLunar" type="checkbox" ${ev?.repeatByLunar ? 'checked' : ''} />
                <span>Lặp hằng năm theo Âm lịch (ngày giỗ, chạp)</span>
              </label>
              <label class="check-row">
                <input name="repeatYearly" type="checkbox" ${ev?.repeatYearly ? 'checked' : ''} />
                <span>Lặp lại hằng năm</span>
              </label>
            </div>

            <div class="form-field form-span-2">
              <span>Mốc nhắc lịch</span>
              <div class="reminder-check-row">
                ${REMINDER_OPTIONS.map(
                  (opt) => `
                  <label class="check-inline">
                    <input type="checkbox" name="reminders" value="${opt.offset}" ${activeReminders.includes(opt.offset) ? 'checked' : ''} />
                    <span>${escapeHtml(opt.label)}</span>
                  </label>
                `,
                ).join('')}
              </div>
            </div>

            <label class="form-field form-span-2">
              <span>Ghi chú</span>
              <textarea
                name="note"
                rows="2"
                placeholder="Ghi chú trang phục, quà mừng, phân công chuẩn bị..."
              >${escapeHtml(ev?.note ?? '')}</textarea>
            </label>
          </div>

          <p id="modal-form-error" class="qa-error" style="display: ${this.formError ? 'block' : 'none'};">${escapeHtml(this.formError)}</p>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" data-modal-action="close">Hủy</button>
            <button type="submit" class="btn-primary">${isEdit ? 'Lưu thay đổi' : 'Lưu sự kiện'}</button>
          </div>
        </form>
      </div>
    `;
  }

  private renderDetailMarkup(ev: FamilyEvent): string {
    const today = getTodayISO();
    const days = getDaysDifference(ev.eventDate, today);
    const typeMeta = EVENT_TYPE_META[ev.eventType];
    const prioMeta = PRIORITY_META[ev.priority];
    const attMeta = ATTENDANCE_META[ev.attendance];
    const suggestedActual = ev.expenseConfirmed ? ev.actualAmount : ev.expectedAmount;

    return `
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <p class="detail-kicker tabular-nums">
              ${escapeHtml(typeMeta.label)} · Ưu tiên: ${escapeHtml(prioMeta.label)} · ${escapeHtml(formatDaysUntilLabel(days))}
            </p>
            <h2 class="modal-title">${escapeHtml(ev.title)}</h2>
          </div>
          <button type="button" class="modal-close-btn" data-modal-action="close" aria-label="Đóng">✕</button>
        </div>

        <div class="modal-body detail-stack">
          <div class="detail-info-grid">
            <div class="detail-info-item">
              <span class="detail-info-label">Ngày Dương lịch</span>
              <strong class="tabular-nums">${escapeHtml(formatDateVN(ev.eventDate))}${ev.eventTime ? ` · ${escapeHtml(ev.eventTime)}` : ''}</strong>
            </div>
            <div class="detail-info-item">
              <span class="detail-info-label">Ngày Âm lịch</span>
              <strong class="tabular-nums">${escapeHtml(formatLunarShort(ev.eventDate))}${ev.repeatByLunar ? ' (Lặp hằng năm)' : ''}</strong>
            </div>
            ${
              ev.relatedPerson
                ? `
              <div class="detail-info-item">
                <span class="detail-info-label">Người liên quan</span>
                <strong>${escapeHtml(ev.relatedPerson)}</strong>
              </div>
            `
                : ''
            }
            ${
              ev.location
                ? `
              <div class="detail-info-item">
                <span class="detail-info-label">Địa điểm</span>
                <strong>${escapeHtml(ev.location)}</strong>
              </div>
            `
                : ''
            }
          </div>

          ${
            ev.note
              ? `<p class="detail-note-box"><strong>Ghi chú:</strong> ${escapeHtml(ev.note)}</p>`
              : ''
          }

          <div class="detail-section">
            <div class="detail-section-header">
              <h3>Trạng thái tham dự</h3>
              <span class="detail-current-label">${escapeHtml(attMeta.label)}</span>
            </div>
            <div class="detail-att-grid" role="group" aria-label="Cập nhật tham dự">
              ${[
                {status: AttendanceStatus.UNDECIDED, label: 'Chưa rõ', cls: 'is-active-neutral'},
                {status: AttendanceStatus.WILL_ATTEND, label: 'Sẽ đi', cls: 'is-active-primary'},
                {status: AttendanceStatus.ATTENDED, label: 'Đã đi', cls: 'is-active-success'},
                {status: AttendanceStatus.NOT_ATTENDING, label: 'Không đi', cls: 'is-active-neutral'},
              ]
                .map(
                  (item) => `
                <button
                  type="button"
                  class="detail-att-btn ${ev.attendance === item.status ? item.cls : ''}"
                  data-modal-action="detail-attendance"
                  data-status="${item.status}"
                >${item.label}</button>
              `,
                )
                .join('')}
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-header">
              <h3>Xác nhận tiền đám thực tế</h3>
              <span class="detail-current-label tabular-nums">
                ${ev.expenseConfirmed ? `Đã xác nhận ${formatVND(ev.actualAmount)}` : `Dự kiến ${formatVND(ev.expectedAmount)}`}
              </span>
            </div>

            ${
              ev.attendance === AttendanceStatus.NOT_ATTENDING
                ? `<p class="field-helper-text">Sự kiện đang ở trạng thái <strong>Không đi</strong> nên không tính vào khoản chi thực tế.</p>`
                : `
              <form id="event-expense-form" class="expense-confirm-form">
                <div class="form-grid-2">
                  <label class="form-field">
                    <div class="form-label-row">
                      <span>Số tiền thực tế (VNĐ)</span>
                      <span id="df-amount-preview" class="field-amount-preview tabular-nums">= ${escapeHtml(formatVND(suggestedActual))}</span>
                    </div>
                    <input
                      id="df-actual-amount"
                      name="actualAmount"
                      type="text"
                      value="${suggestedActual > 0 ? String(suggestedActual) : ''}"
                      placeholder="VD: 1000000 hoặc 2tr"
                    />
                  </label>

                  <label class="form-field">
                    <span>Nguồn chi</span>
                    <select id="df-payment-source" name="paymentSource">
                      <option value="${PaymentSource.PERSONAL}" ${ev.paymentSource === PaymentSource.PERSONAL ? 'selected' : ''}>Tiền cá nhân</option>
                      <option value="${PaymentSource.FAMILY_FUND}" ${ev.paymentSource === PaymentSource.FAMILY_FUND ? 'selected' : ''}>Quỹ chung dòng họ</option>
                    </select>
                  </label>
                </div>

                <div class="quick-btn-strip">
                  ${QUICK_AMOUNTS.map(
                    (q) =>
                      `<button type="button" class="mini-btn" data-modal-action="detail-quick-amount" data-amount="${q.value}">${q.label}</button>`,
                  ).join('')}
                </div>

                <p id="df-overdraft-warning" class="qa-warning" style="display: none;"></p>
                <p id="modal-form-error" class="qa-error" style="display: ${this.formError ? 'block' : 'none'};">${escapeHtml(this.formError)}</p>

                <button type="submit" class="btn-primary">
                  ${ev.expenseConfirmed ? 'Cập nhật khoản chi' : 'Xác nhận đã chi'}
                </button>
              </form>
            `
            }
          </div>

          <div class="modal-footer modal-footer-between">
            <div class="modal-footer-left">
              <button type="button" class="btn-secondary" data-modal-action="switch-to-edit">Chỉnh sửa</button>
              <button
                type="button"
                class="btn-danger-ghost ${this.confirmDeletePending ? 'is-confirming' : ''}"
                data-modal-action="delete-event"
              >${this.confirmDeletePending ? 'Nhấn lại để xác nhận xóa' : 'Xóa sự kiện'}</button>
            </div>
            <button type="button" class="btn-secondary" data-modal-action="close">Đóng</button>
          </div>
        </div>
      </div>
    `;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDownBound);
    this.overlayEl.remove();
  }
}
