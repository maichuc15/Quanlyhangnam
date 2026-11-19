import {
  ATTENDANCE_META,
  EVENT_TYPE_META,
  PRIORITY_META,
} from '../constants';
import {FamilyStore} from '../store/familyStore';
import {
  AttendanceStatus,
  EventPriority,
  EventType,
  FamilyEvent,
  FundTransactionType,
  MainTab,
  MemberRole,
  NoteCategory,
  PaymentSource,
  PersonalNote,
  ReminderOffset,
  TimeUrgency,
} from '../types';
import {audioFeedback} from '../utils/audioFeedback';
import {
  formatDateVN,
  formatDaysUntilLabel,
  formatLunarShort,
  formatShortDateVN,
  formatVND,
  getDaysDifference,
  getTimeUrgency,
  getTodayISO,
  parseVNDInput,
} from '../utils/lunarCalendar';
import {renderCalendarMonthSection} from './CalendarMonthSection';
import {EventFormModal} from './EventFormModal';
import {renderFamilySettingsSection} from './FamilySettingsSection';
import {FundTxnFilter, renderFinanceFundSection} from './FinanceFundSection';
import {getFundBreakdownStats, renderFundRatioPieChart} from './FundRatioChart';
import {
  NoteFilter,
  renderPersonalNoteRowsMarkup,
  renderPersonalNotesSection,
} from './PersonalNotesSection';

type QuickFilter = 'all' | 'upcoming30' | 'memorial' | 'celebration' | 'past';

const URGENCY_TEXT_CLASS: Record<TimeUrgency, string> = {
  [TimeUrgency.TODAY]: 'urg-today',
  [TimeUrgency.SOON_1_3]: 'urg-soon-1-3',
  [TimeUrgency.SOON_4_7]: 'urg-soon-4-7',
  [TimeUrgency.UPCOMING_8_30]: 'urg-upcoming-8-30',
  [TimeUrgency.LATER_30_PLUS]: 'urg-later',
  [TimeUrgency.PAST]: 'urg-past',
};

const PRIORITY_TEXT_CLASS: Record<EventPriority, string> = {
  [EventPriority.IMPORTANT]: 'prio-important',
  [EventPriority.NORMAL]: 'prio-normal',
  [EventPriority.OPTIONAL]: 'prio-optional',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pure 2D responsive Vietnamese Family & Clan Event + Fund Manager view.
 * Covers Overview (with D3 Thu/Chi pie chart & scannable event list), Monthly Solar/Lunar
 * Calendar, Finance & Clan Fund ledgers, and Family & Reminder settings.
 */
export class HomeEventListView {
  private store: FamilyStore;
  private modal: EventFormModal;
  private rootEl: HTMLDivElement;
  private unsubscribe?: () => void;

  private activeFilter: QuickFilter = 'all';
  private searchText = '';
  private showQuickFund = false;
  private quickFundError = '';
  private financeFundError = '';
  private fundTxnFilter: FundTxnFilter = 'all';
  private confirmDeleteTxnId: string | null = null;
  private confirmResetPending = false;
  private noteFilter: NoteFilter = 'all';
  private noteSearchText = '';
  private editingNoteId: string | null = null;
  private confirmDeleteNoteId: string | null = null;
  private noteFormError = '';
  private isEditingFamilyInfo = false;
  private familyInfoError = '';
  private isAddingMember = false;
  private editingMemberId: string | null = null;
  private confirmDeleteMemberId: string | null = null;
  private memberFormError = '';

  constructor(store: FamilyStore) {
    this.store = store;
    this.modal = new EventFormModal(store);

    this.rootEl = document.createElement('div');
    this.rootEl.id = 'home-event-screen';
    this.rootEl.className = 'home-screen';

    const mountTarget = document.getElementById('root') ?? document.body;
    mountTarget.innerHTML = '';
    mountTarget.appendChild(this.rootEl);

    this.bindDelegatedEvents();
    this.render();
    this.unsubscribe = this.store.subscribe(() => {
      this.render();
      this.modal.refreshIfOpen();
    });
  }

  private getFilteredEvents(): FamilyEvent[] {
    const today = getTodayISO();
    const all = this.store.getFamilyEvents();
    const q = this.searchText.trim().toLowerCase();

    return all.filter((ev) => {
      const days = getDaysDifference(ev.eventDate, today);
      if (this.activeFilter === 'upcoming30') {
        const overdueUnconfirmed = days < 0 && ev.attendance === AttendanceStatus.UNDECIDED;
        if (!overdueUnconfirmed && (days < 0 || days > 30)) return false;
      } else if (this.activeFilter === 'memorial') {
        if (
          ev.eventType !== EventType.DEATH_ANNIVERSARY &&
          ev.eventType !== EventType.CLAN_CEREMONY &&
          ev.eventType !== EventType.FUNERAL
        ) {
          return false;
        }
      } else if (this.activeFilter === 'celebration') {
        if (
          ev.eventType !== EventType.WEDDING &&
          ev.eventType !== EventType.FULL_MONTH &&
          ev.eventType !== EventType.FIRST_BIRTHDAY &&
          ev.eventType !== EventType.BIRTHDAY &&
          ev.eventType !== EventType.FAMILY_EVENT
        ) {
          return false;
        }
      } else if (this.activeFilter === 'past') {
        if (days >= 0) return false;
      }

      if (q) {
        const hay = `${ev.title} ${ev.relatedPerson} ${ev.location} ${ev.note} ${EVENT_TYPE_META[ev.eventType].label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  private bindDelegatedEvents() {
    this.rootEl.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'set-tab') {
        const tab = target.dataset.tab as MainTab | undefined;
        if (tab) {
          audioFeedback.playSelect();
          this.confirmResetPending = false;
          this.confirmDeleteNoteId = null;
          this.confirmDeleteTxnId = null;
          this.isEditingFamilyInfo = false;
          this.isAddingMember = false;
          this.editingMemberId = null;
          this.confirmDeleteMemberId = null;
          this.familyInfoError = '';
          this.memberFormError = '';
          this.store.setTab(tab);
        }
      } else if (action === 'open-add') {
        audioFeedback.playSelect();
        this.modal.openAdd();
      } else if (action === 'open-add-date') {
        const date = target.dataset.date;
        audioFeedback.playSelect();
        this.modal.openAdd(date);
      } else if (action === 'open-detail') {
        const id = target.dataset.id;
        if (id) {
          audioFeedback.playSelect();
          this.store.selectEvent(id);
          this.modal.openDetail(id);
        }
      } else if (action === 'open-edit') {
        const id = target.dataset.id;
        if (id) {
          audioFeedback.playSelect();
          this.modal.openEdit(id);
        }
      } else if (action === 'switch-family') {
        const id = target.dataset.id;
        if (id) {
          audioFeedback.playSelect();
          this.confirmResetPending = false;
          this.editingNoteId = null;
          this.confirmDeleteNoteId = null;
          this.isEditingFamilyInfo = false;
          this.isAddingMember = false;
          this.editingMemberId = null;
          this.confirmDeleteMemberId = null;
          this.familyInfoError = '';
          this.memberFormError = '';
          this.store.switchFamily(id);
        }
      } else if (action === 'set-filter') {
        const filter = target.dataset.filter as QuickFilter | undefined;
        if (filter) {
          audioFeedback.playSelect();
          this.activeFilter = filter;
          this.render();
        }
      } else if (action === 'set-attendance') {
        const id = target.dataset.id;
        const status = target.dataset.status as AttendanceStatus | undefined;
        if (id && status) {
          audioFeedback.playConfirm();
          this.store.setAttendance(id, status);
        }
      } else if (action === 'toggle-quick-fund') {
        audioFeedback.playSelect();
        this.showQuickFund = !this.showQuickFund;
        this.quickFundError = '';
        this.render();
      } else if (action === 'fill-fin-amount') {
        const amount = Number(target.dataset.amount ?? 0);
        const input = this.rootEl.querySelector<HTMLInputElement>('#fin-fund-amount');
        if (input && amount > 0) {
          input.value = String(amount);
          input.focus();
        }
      } else if (action === 'cal-prev') {
        audioFeedback.playSelect();
        const st = this.store.getState();
        if (st.selectedMonth === 1) {
          this.store.setSelectedYear(st.selectedYear - 1);
          this.store.setSelectedMonth(12);
        } else {
          this.store.setSelectedMonth(st.selectedMonth - 1);
        }
      } else if (action === 'cal-next') {
        audioFeedback.playSelect();
        const st = this.store.getState();
        if (st.selectedMonth === 12) {
          this.store.setSelectedYear(st.selectedYear + 1);
          this.store.setSelectedMonth(1);
        } else {
          this.store.setSelectedMonth(st.selectedMonth + 1);
        }
      } else if (action === 'cal-today') {
        audioFeedback.playSelect();
        const today = getTodayISO();
        this.store.setSelectedYear(Number(today.slice(0, 4)));
        this.store.setSelectedMonth(Number(today.slice(5, 7)));
      } else if (action === 'request-browser-notif') {
        void this.store.requestBrowserNotifications();
      } else if (action === 'export-backup') {
        audioFeedback.playConfirm();
        this.store.exportBackupJSON();
      } else if (action === 'reset-demo') {
        if (!this.confirmResetPending) {
          this.confirmResetPending = true;
          audioFeedback.playWarning();
          this.render();
        } else {
          this.confirmResetPending = false;
          audioFeedback.playSelect();
          this.store.resetDemoData();
        }
      } else if (action === 'set-note-filter') {
        const filter = target.dataset.filter as NoteFilter | undefined;
        if (filter) {
          audioFeedback.playSelect();
          this.noteFilter = filter;
          this.confirmDeleteNoteId = null;
          this.render();
        }
      } else if (action === 'edit-note') {
        const id = target.dataset.id;
        if (id) {
          audioFeedback.playSelect();
          this.editingNoteId = id;
          this.confirmDeleteNoteId = null;
          this.noteFormError = '';
          this.render();
          const titleEl = this.rootEl.querySelector<HTMLInputElement>('#note-title-input');
          titleEl?.focus();
        }
      } else if (action === 'cancel-edit-note') {
        audioFeedback.playSelect();
        this.editingNoteId = null;
        this.noteFormError = '';
        this.render();
      } else if (action === 'toggle-pin-note') {
        const id = target.dataset.id;
        if (id) {
          audioFeedback.playSelect();
          this.confirmDeleteNoteId = null;
          this.store.toggleNotePin(id);
        }
      } else if (action === 'delete-note') {
        const id = target.dataset.id;
        if (!id) return;
        if (this.confirmDeleteNoteId !== id) {
          this.confirmDeleteNoteId = id;
          audioFeedback.playWarning();
          this.render();
        } else {
          this.confirmDeleteNoteId = null;
          if (this.editingNoteId === id) this.editingNoteId = null;
          audioFeedback.playSelect();
          this.store.deletePersonalNote(id);
        }
      } else if (action === 'set-fund-filter') {
        const filter = target.dataset.filter as FundTxnFilter | undefined;
        if (filter) {
          audioFeedback.playSelect();
          this.fundTxnFilter = filter;
          this.confirmDeleteTxnId = null;
          this.render();
        }
      } else if (action === 'delete-fund-txn') {
        const id = target.dataset.id;
        if (!id) return;
        if (this.confirmDeleteTxnId !== id) {
          this.confirmDeleteTxnId = id;
          audioFeedback.playWarning();
          this.render();
        } else {
          this.confirmDeleteTxnId = null;
          audioFeedback.playSelect();
          this.store.deleteFundTransaction(id);
        }
      } else if (action === 'open-edit-family') {
        audioFeedback.playSelect();
        this.isEditingFamilyInfo = true;
        this.familyInfoError = '';
        this.render();
        this.rootEl.querySelector<HTMLInputElement>('#family-name-input')?.focus();
      } else if (action === 'cancel-edit-family') {
        audioFeedback.playSelect();
        this.isEditingFamilyInfo = false;
        this.familyInfoError = '';
        this.render();
      } else if (action === 'open-add-member') {
        audioFeedback.playSelect();
        this.isAddingMember = true;
        this.editingMemberId = null;
        this.confirmDeleteMemberId = null;
        this.memberFormError = '';
        this.render();
        this.rootEl.querySelector<HTMLInputElement>('#member-fullname-input')?.focus();
      } else if (action === 'edit-member') {
        const id = target.dataset.id;
        if (id) {
          audioFeedback.playSelect();
          this.editingMemberId = id;
          this.isAddingMember = false;
          this.confirmDeleteMemberId = null;
          this.memberFormError = '';
          this.render();
          this.rootEl.querySelector<HTMLInputElement>('#member-fullname-input')?.focus();
        }
      } else if (action === 'cancel-member-form') {
        audioFeedback.playSelect();
        this.isAddingMember = false;
        this.editingMemberId = null;
        this.memberFormError = '';
        this.render();
      } else if (action === 'delete-member') {
        const id = target.dataset.id;
        if (!id) return;
        if (this.confirmDeleteMemberId !== id) {
          this.confirmDeleteMemberId = id;
          audioFeedback.playWarning();
          this.render();
        } else {
          this.confirmDeleteMemberId = null;
          if (this.editingMemberId === id) {
            this.editingMemberId = null;
          }
          audioFeedback.playSelect();
          this.store.deleteFamilyMember(id);
        }
      }
    });

    this.rootEl.addEventListener('change', (e) => {
      const el = e.target as HTMLElement;
      const action = el.dataset.action;
      if (action === 'toggle-reminders-enabled') {
        this.store.toggleRemindersEnabled();
      } else if (action === 'toggle-reminder-offset') {
        const offset = Number(el.dataset.offset) as ReminderOffset;
        if (!Number.isNaN(offset)) {
          this.store.toggleReminderOffset(offset);
        }
      }
    });

    this.rootEl.addEventListener('input', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'home-search-input') {
        this.searchText = (el as HTMLInputElement).value;
        this.renderEventListOnly();
      } else if (el.id === 'notes-search-input') {
        this.noteSearchText = (el as HTMLInputElement).value;
        this.renderNotesListOnly();
      }
    });

    this.rootEl.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;
      if (form.id === 'quick-fund-form') {
        e.preventDefault();
        this.handleQuickFundSubmit(form, false);
      } else if (form.id === 'finance-fund-form') {
        e.preventDefault();
        this.handleQuickFundSubmit(form, true);
      } else if (form.id === 'personal-note-form') {
        e.preventDefault();
        this.handlePersonalNoteSubmit(form);
      } else if (form.id === 'budget-update-form') {
        e.preventDefault();
        const fd = new FormData(form);
        const amount = parseVNDInput(String(fd.get('annualBudget') ?? '0'));
        if (amount >= 1_000_000) {
          audioFeedback.playSuccess();
          this.store.updateAnnualBudget(amount);
          this.store.notify(`Đã cập nhật ngân sách năm thành ${formatVND(amount)}`, 'success');
        } else {
          audioFeedback.playWarning();
          this.store.notify('Ngân sách năm tối thiểu là 1.000.000đ.', 'warning');
        }
      } else if (form.id === 'family-info-form') {
        e.preventDefault();
        this.handleFamilyInfoSubmit(form);
      } else if (form.id === 'family-member-form') {
        e.preventDefault();
        this.handleFamilyMemberSubmit(form);
      }
    });
  }

  private getFilteredNotes(): PersonalNote[] {
    const all = this.store.getPersonalNotes();
    const q = this.noteSearchText.trim().toLowerCase();
    return all.filter((n) => {
      if (this.noteFilter === 'pinned' && !n.pinned) return false;
      if (this.noteFilter !== 'all' && this.noteFilter !== 'pinned' && n.category !== this.noteFilter) {
        return false;
      }
      if (q) {
        const hay = `${n.title} ${n.content}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  private renderNotesListOnly() {
    const listEl = this.rootEl.querySelector<HTMLElement>('#personal-notes-list');
    const countEl = this.rootEl.querySelector<HTMLElement>('#notes-list-count');
    if (!listEl) return;
    const allNotes = this.store.getPersonalNotes();
    const filtered = this.getFilteredNotes();
    const eventMap = new Map(this.store.getFamilyEvents().map((ev) => [ev.id, ev]));
    listEl.innerHTML = renderPersonalNoteRowsMarkup(filtered, eventMap, this.confirmDeleteNoteId);
    if (countEl) {
      countEl.textContent = `${filtered.length} / ${allNotes.length} ghi chú`;
    }
  }

  private handlePersonalNoteSubmit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const noteId = String(fd.get('noteId') ?? '').trim();
    const title = String(fd.get('title') ?? '').trim();
    const content = String(fd.get('content') ?? '').trim();
    const category = (fd.get('category') as NoteCategory) || NoteCategory.PERSONAL;
    const linkedEventId = String(fd.get('linkedEventId') ?? '').trim() || undefined;
    const pinned = fd.get('pinned') === 'on';

    if (!title || !content) {
      this.noteFormError = 'Vui lòng nhập đầy đủ tiêu đề và nội dung ghi chú.';
      audioFeedback.playWarning();
      this.render();
      return;
    }

    this.noteFormError = '';
    this.editingNoteId = null;
    audioFeedback.playSuccess();
    if (noteId) {
      this.store.updatePersonalNote(noteId, {title, content, category, linkedEventId, pinned});
    } else {
      this.store.addPersonalNote({title, content, category, linkedEventId, pinned});
    }
  }

  private handleFamilyInfoSubmit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const name = String(fd.get('familyName') ?? '').trim();
    const description = String(fd.get('familyDescription') ?? '').trim();

    if (!name) {
      this.familyInfoError = 'Vui lòng nhập tên nhóm hoặc gia tộc.';
      audioFeedback.playWarning();
      this.render();
      return;
    }

    this.familyInfoError = '';
    this.isEditingFamilyInfo = false;
    audioFeedback.playSuccess();
    this.store.updateFamilyInfo({name, description});
  }

  private handleFamilyMemberSubmit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const memberId = String(fd.get('memberId') ?? '').trim();
    const fullName = String(fd.get('fullName') ?? '').trim();
    const relation = String(fd.get('relation') ?? '').trim();
    const phone = String(fd.get('phone') ?? '').trim();
    const role = (fd.get('role') as MemberRole) || MemberRole.MEMBER;

    if (!fullName || !relation) {
      this.memberFormError = 'Vui lòng nhập đầy đủ họ tên và mối quan hệ.';
      audioFeedback.playWarning();
      this.render();
      return;
    }

    this.memberFormError = '';
    this.isAddingMember = false;
    this.editingMemberId = null;
    audioFeedback.playSuccess();
    if (memberId) {
      this.store.updateFamilyMember(memberId, {fullName, relation, phone, role});
    } else {
      this.store.addFamilyMember({fullName, relation, phone, role});
    }
  }

  private handleQuickFundSubmit(form: HTMLFormElement, isFinanceTab: boolean) {
    const fd = new FormData(form);
    const type =
      (fd.get('fundType') as FundTransactionType) || FundTransactionType.CONTRIBUTION;
    const amount = parseVNDInput(String(fd.get('fundAmount') ?? '0'));
    const note = String(fd.get('fundNote') ?? '').trim();
    const actorName =
      String(fd.get('actorName') ?? '').trim() ||
      this.store.getActiveFamily().members[0]?.fullName ||
      'Chủ hộ';
    const transactionDate = String(fd.get('transactionDate') ?? '').trim() || getTodayISO();

    if (amount <= 0) {
      const msg = 'Vui lòng nhập số tiền lớn hơn 0 (VD: 500000 hoặc 2tr).';
      if (isFinanceTab) {
        this.financeFundError = msg;
      } else {
        this.quickFundError = msg;
      }
      audioFeedback.playWarning();
      this.render();
      return;
    }

    this.quickFundError = '';
    this.financeFundError = '';
    if (!isFinanceTab) {
      this.showQuickFund = false;
    }

    const {overdraftWarning} = this.store.addFundTransaction({
      type,
      amount,
      actorName,
      transactionDate,
      note:
        note ||
        (type === FundTransactionType.EXPENSE ? 'Chi quỹ dòng họ' : 'Đóng góp quỹ dòng họ'),
    });
    if (overdraftWarning) {
      audioFeedback.playWarning();
    } else {
      audioFeedback.playSuccess();
    }
  }

  private renderEventRowsMarkup(events: FamilyEvent[]): string {
    const today = getTodayISO();

    if (events.length === 0) {
      return `
        <div class="empty-state">
          <p class="empty-title">Không tìm thấy sự kiện phù hợp</p>
          <p class="empty-desc">Thử chuyển bộ lọc hoặc nhấn "+ Thêm sự kiện" để ghi nhận ngày giỗ, ngày đám mới.</p>
        </div>
      `;
    }

    return events
      .map((ev) => {
        const days = getDaysDifference(ev.eventDate, today);
        const urgency = getTimeUrgency(days);
        const urgencyClass = URGENCY_TEXT_CLASS[urgency];
        const priorityMeta = PRIORITY_META[ev.priority];
        const priorityClass = PRIORITY_TEXT_CLASS[ev.priority];
        const typeMeta = EVENT_TYPE_META[ev.eventType];
        const attMeta = ATTENDANCE_META[ev.attendance];
        const isOverdueUnconfirmed =
          days < 0 && ev.attendance === AttendanceStatus.UNDECIDED;

        const lunarText = formatLunarShort(ev.eventDate);
        const metaParts = [
          typeMeta.label,
          ev.eventTime,
          ev.location,
          ev.repeatYearly
            ? ev.repeatByLunar
              ? 'Lặp Âm lịch hằng năm'
              : 'Lặp hằng năm'
            : '',
        ].filter(Boolean);

        const moneyLine =
          ev.attendance === AttendanceStatus.NOT_ATTENDING
            ? 'Không tham dự'
            : ev.expenseConfirmed
              ? `Đã chi ${formatVND(ev.actualAmount)} · ${ev.paymentSource === PaymentSource.FAMILY_FUND ? 'Quỹ chung' : 'Cá nhân'}`
              : ev.expectedAmount > 0
                ? `Dự kiến ${formatVND(ev.expectedAmount)}`
                : 'Chưa dự kiến tiền';

        return `
          <article class="event-row ${isOverdueUnconfirmed ? 'is-overdue' : ''}">
            <div class="event-date-col">
              <div class="event-solar-day tabular-nums">${escapeHtml(formatShortDateVN(ev.eventDate))}</div>
              <div class="event-lunar-day tabular-nums">${escapeHtml(lunarText)}</div>
              <div class="event-urgency ${urgencyClass}">${escapeHtml(formatDaysUntilLabel(days))}</div>
            </div>

            <div class="event-main-col">
              <div class="event-title-line">
                <button
                  type="button"
                  class="event-title-btn"
                  data-action="open-detail"
                  data-id="${escapeHtml(ev.id)}"
                >${escapeHtml(ev.title)}</button>
                <span class="event-priority ${priorityClass}">Ưu tiên: ${escapeHtml(priorityMeta.label)}</span>
              </div>

              <div class="event-meta-line">
                ${metaParts.map((part) => `<span>${escapeHtml(part)}</span>`).join('<span class="sep" aria-hidden="true">·</span>')}
              </div>

              ${
                ev.relatedPerson || ev.note
                  ? `<div class="event-sub-note">${escapeHtml(
                      [ev.relatedPerson ? `Liên quan: ${ev.relatedPerson}` : '', ev.note]
                        .filter(Boolean)
                        .join(' — '),
                    )}</div>`
                  : ''
              }

              <div class="event-money-line tabular-nums">
                <span>${escapeHtml(moneyLine)}</span>
                <span class="sep" aria-hidden="true">·</span>
                <span class="att-status-text">${escapeHtml(attMeta.label)}${isOverdueUnconfirmed ? ' (Quá hạn chưa xác nhận)' : ''}</span>
              </div>
            </div>

            <div class="event-actions-col">
              <div class="att-btn-group" role="group" aria-label="Trạng thái tham dự">
                <button
                  type="button"
                  class="att-btn ${ev.attendance === AttendanceStatus.WILL_ATTEND ? 'is-active-primary' : ''}"
                  data-action="set-attendance"
                  data-id="${escapeHtml(ev.id)}"
                  data-status="${AttendanceStatus.WILL_ATTEND}"
                >Sẽ đi</button>
                <button
                  type="button"
                  class="att-btn ${ev.attendance === AttendanceStatus.ATTENDED ? 'is-active-success' : ''}"
                  data-action="set-attendance"
                  data-id="${escapeHtml(ev.id)}"
                  data-status="${AttendanceStatus.ATTENDED}"
                >Đã đi</button>
                <button
                  type="button"
                  class="att-btn ${ev.attendance === AttendanceStatus.NOT_ATTENDING ? 'is-active-neutral' : ''}"
                  data-action="set-attendance"
                  data-id="${escapeHtml(ev.id)}"
                  data-status="${AttendanceStatus.NOT_ATTENDING}"
                >Không đi</button>
              </div>
              <div class="row-link-group">
                <button
                  type="button"
                  class="open-3d-link"
                  data-action="open-detail"
                  data-id="${escapeHtml(ev.id)}"
                >Chi tiết &amp; tiền đám</button>
                <span class="sep" aria-hidden="true">·</span>
                <button
                  type="button"
                  class="row-edit-link"
                  data-action="open-edit"
                  data-id="${escapeHtml(ev.id)}"
                >Sửa</button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  private renderEventListOnly() {
    const listContainer = this.rootEl.querySelector<HTMLElement>('#home-event-list');
    const countEl = this.rootEl.querySelector<HTMLElement>('#home-list-count');
    if (!listContainer) return;
    const filtered = this.getFilteredEvents();
    listContainer.innerHTML = this.renderEventRowsMarkup(filtered);
    if (countEl) {
      countEl.textContent = `${filtered.length} sự kiện`;
    }
  }

  private renderDashboardTab(): string {
    const state = this.store.getState();
    const family = this.store.getActiveFamily();
    const allEvents = this.store.getFamilyEvents();
    const filteredEvents = this.getFilteredEvents();
    const summary = this.store.getFinancialSummary();
    const fundTransactions = this.store.getFamilyFundTransactions();
    const notesCount = this.store.getPersonalNotes().length;
    const fundStats = getFundBreakdownStats(summary, fundTransactions);
    const attCounts = this.store.getAttendanceCounts();
    const today = getTodayISO();
    const upcoming30Count = allEvents.filter((e) => {
      const d = getDaysDifference(e.eventDate, today);
      return d >= 0 && d <= 30;
    }).length;
    const alerts = this.store.getReminderAlerts();

    return `
      <section class="hero-summary">
        <div class="hero-top-grid">
          <div class="hero-heading-block">
            <p class="hero-date-line tabular-nums">
              Hôm nay ${escapeHtml(formatDateVN(today))} · ${escapeHtml(formatLunarShort(today))}
            </p>
            <h1 class="hero-title hero-title--gold">Gia tộc họ Mai Văn</h1>
            <p class="hero-subtitle">
              Theo dõi tập trung ngày giỗ, ngày chạp, đám cưới, đám tang và tình hình quỹ dòng họ năm ${state.selectedYear}.
            </p>
            <p class="hero-meta-note tabular-nums">
              ${family.members.length} thành viên · ${fundTransactions.length} giao dịch quỹ ·
              <button type="button" class="inline-meta-link" data-action="set-tab" data-tab="${MainTab.NOTES}">${notesCount} ghi chú cá nhân</button>
            </p>
          </div>

          <div class="fund-chart-panel" aria-label="Biểu đồ tỷ lệ thu chi quỹ dòng họ">
            <div class="fund-chart-header">
              <div>
                <h2 class="fund-chart-title">Tỷ lệ Thu / Chi Tiền quỹ</h2>
                <p class="fund-chart-subtitle tabular-nums">
                  ${fundTransactions.length} giao dịch · Năm ${state.selectedYear} ·
                  <button type="button" class="inline-meta-link" data-action="set-tab" data-tab="${MainTab.FINANCE}">Xem sổ Tiền quỹ</button>
                </p>
              </div>
              <button
                type="button"
                class="fund-quick-toggle"
                data-action="toggle-quick-fund"
              >${this.showQuickFund ? 'Đóng' : '+ Ghi thu / chi'}</button>
            </div>

            <div class="fund-chart-body">
              <div id="fund-ratio-chart" class="fund-pie-mount"></div>

              <div id="fund-ratio-legend" class="fund-legend">
                <div class="fund-legend-row" data-fund-slice="in" tabindex="0">
                  <div class="fund-legend-label-wrap">
                    <span class="fund-swatch fund-swatch-in" aria-hidden="true"></span>
                    <div class="fund-legend-text">
                      <span class="fund-legend-name">Tổng thu quỹ</span>
                      <span class="fund-legend-detail tabular-nums">
                        Đầu năm ${escapeHtml(formatVND(fundStats.initialTotal))} · Đóng góp ${escapeHtml(formatVND(fundStats.contributionTotal))}
                      </span>
                    </div>
                  </div>
                  <div class="fund-legend-metrics tabular-nums">
                    <span class="fund-legend-amount text-success">${escapeHtml(formatVND(summary.fundTotalIn))}</span>
                    <span class="fund-legend-pct">${escapeHtml(fundStats.inPctLabel)}</span>
                  </div>
                </div>

                <div class="fund-legend-row" data-fund-slice="out" tabindex="0">
                  <div class="fund-legend-label-wrap">
                    <span class="fund-swatch fund-swatch-out" aria-hidden="true"></span>
                    <div class="fund-legend-text">
                      <span class="fund-legend-name">Tổng chi quỹ</span>
                      <span class="fund-legend-detail tabular-nums">
                        ${fundStats.expenseCount} khoản chi từ quỹ chung
                      </span>
                    </div>
                  </div>
                  <div class="fund-legend-metrics tabular-nums">
                    <span class="fund-legend-amount text-danger">${escapeHtml(formatVND(summary.fundTotalOut))}</span>
                    <span class="fund-legend-pct">${escapeHtml(fundStats.outPctLabel)}</span>
                  </div>
                </div>

                <div class="fund-balance-row tabular-nums">
                  <span class="fund-balance-label">Số dư hiện tại</span>
                  <span class="fund-balance-value ${summary.fundBalance < 0 ? 'text-danger' : 'text-success'}">
                    ${escapeHtml(formatVND(summary.fundBalance))}${summary.fundBalance < 0 ? ' (Âm quỹ)' : ''}
                  </span>
                </div>
              </div>
            </div>

            ${
              this.showQuickFund
                ? `
              <form id="quick-fund-form" class="quick-fund-form">
                <div class="qf-row">
                  <select name="fundType" aria-label="Loại giao dịch quỹ">
                    <option value="${FundTransactionType.CONTRIBUTION}">Thu đóng góp</option>
                    <option value="${FundTransactionType.EXPENSE}">Chi từ quỹ</option>
                  </select>
                  <input
                    name="fundAmount"
                    type="text"
                    required
                    placeholder="Số tiền (VD: 1tr, 500000)"
                    aria-label="Số tiền giao dịch"
                  />
                  <input
                    name="fundNote"
                    type="text"
                    placeholder="Nội dung thu / chi..."
                    aria-label="Nội dung giao dịch"
                  />
                  <button type="submit" class="btn-primary qf-submit">Lưu</button>
                </div>
                ${this.quickFundError ? `<p class="qa-error">${escapeHtml(this.quickFundError)}</p>` : ''}
              </form>
            `
                : ''
            }
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-item">
            <div class="kpi-label">Sắp tới (30 ngày)</div>
            <div class="kpi-value tabular-nums">${upcoming30Count} <span class="kpi-sub">/ ${allEvents.length} sự kiện</span></div>
          </div>
          <div class="kpi-item">
            <div class="kpi-label">Cần xác nhận</div>
            <div class="kpi-value tabular-nums ${attCounts[AttendanceStatus.UNDECIDED] > 0 ? 'text-warning' : ''}">${attCounts[AttendanceStatus.UNDECIDED]} <span class="kpi-sub">chưa rõ</span></div>
          </div>
          <div class="kpi-item">
            <div class="kpi-label">Tiền đám đã chi</div>
            <div class="kpi-value tabular-nums">${escapeHtml(formatVND(summary.totalActualAll))}</div>
            <div class="kpi-note tabular-nums">Ngân sách còn ${escapeHtml(formatVND(summary.remainingBudget))}</div>
          </div>
          <div class="kpi-item">
            <div class="kpi-label">Số dư Quỹ chung</div>
            <div class="kpi-value tabular-nums ${summary.fundBalance < 0 ? 'text-danger' : 'text-success'}">${escapeHtml(formatVND(summary.fundBalance))}</div>
            <div class="kpi-note tabular-nums">Đã đi ${attCounts[AttendanceStatus.ATTENDED]} · Sẽ đi ${attCounts[AttendanceStatus.WILL_ATTEND]}</div>
          </div>
        </div>
      </section>

      ${
        alerts.length > 0
          ? `
        <section class="reminder-strip" aria-label="Nhắc nhở sắp tới">
          <div class="reminder-strip-label">Nhắc lịch gần nhất</div>
          <div class="reminder-strip-text">
            <strong>${escapeHtml(alerts[0].milestoneLabel)}</strong> — ${escapeHtml(alerts[0].headline)} · ${escapeHtml(alerts[0].detailLine)}
          </div>
          <button type="button" class="open-3d-link" data-action="open-detail" data-id="${escapeHtml(alerts[0].event.id)}">Xem ngay</button>
        </section>
      `
          : ''
      }

      <section class="list-toolbar">
        <div class="filter-tabs" role="tablist" aria-label="Lọc danh sách sự kiện">
          <button type="button" class="filter-tab ${this.activeFilter === 'all' ? 'is-active' : ''}" data-action="set-filter" data-filter="all">Tất cả (${allEvents.length})</button>
          <button type="button" class="filter-tab ${this.activeFilter === 'upcoming30' ? 'is-active' : ''}" data-action="set-filter" data-filter="upcoming30">30 ngày tới</button>
          <button type="button" class="filter-tab ${this.activeFilter === 'memorial' ? 'is-active' : ''}" data-action="set-filter" data-filter="memorial">Ngày giỗ &amp; Chạp</button>
          <button type="button" class="filter-tab ${this.activeFilter === 'celebration' ? 'is-active' : ''}" data-action="set-filter" data-filter="celebration">Đám cưới &amp; Hỉ</button>
          <button type="button" class="filter-tab ${this.activeFilter === 'past' ? 'is-active' : ''}" data-action="set-filter" data-filter="past">Đã qua</button>
        </div>

        <div class="toolbar-right">
          <input
            id="home-search-input"
            type="search"
            class="search-input"
            value="${escapeHtml(this.searchText)}"
            placeholder="Tìm tên sự kiện, địa điểm..."
            aria-label="Tìm kiếm sự kiện"
          />
        </div>
      </section>

      <section class="event-list-section" aria-label="Danh sách sự kiện gia đình">
        <div class="list-header">
          <h2 class="list-heading">Danh sách ngày giỗ, đám &amp; ngày đặc biệt</h2>
          <span id="home-list-count" class="list-count tabular-nums">${filteredEvents.length} sự kiện</span>
        </div>
        <div id="home-event-list" class="event-list">
          ${this.renderEventRowsMarkup(filteredEvents)}
        </div>
      </section>
    `;
  }

  private render() {
    const state = this.store.getState();
    const family = this.store.getActiveFamily();
    const allEvents = this.store.getFamilyEvents();
    const summary = this.store.getFinancialSummary();
    const fundTransactions = this.store.getFamilyFundTransactions();

    const familyShortName = (id: string) => {
      if (id === 'fam-noi') return 'Bên Nội';
      if (id === 'fam-ngoai') return 'Bên Ngoại';
      return 'Gia tộc';
    };

    let tabBody = '';
    if (state.activeTab === MainTab.CALENDAR) {
      tabBody = renderCalendarMonthSection(state.selectedYear, state.selectedMonth, allEvents);
    } else if (state.activeTab === MainTab.FINANCE) {
      tabBody = renderFinanceFundSection({
        family,
        year: state.selectedYear,
        summary,
        transactions: fundTransactions,
        events: allEvents,
        fundError: this.financeFundError,
        txnFilter: this.fundTxnFilter,
        confirmDeleteTxnId: this.confirmDeleteTxnId,
      });
    } else if (state.activeTab === MainTab.NOTES) {
      const allNotes = this.store.getPersonalNotes();
      const filteredNotes = this.getFilteredNotes();
      const editingNote = this.editingNoteId
        ? allNotes.find((n) => n.id === this.editingNoteId) ?? null
        : null;
      tabBody = renderPersonalNotesSection({
        notes: filteredNotes,
        allNotesCount: allNotes.length,
        events: allEvents,
        activeFilter: this.noteFilter,
        searchText: this.noteSearchText,
        editingNote,
        confirmDeleteNoteId: this.confirmDeleteNoteId,
        formError: this.noteFormError,
      });
    } else if (state.activeTab === MainTab.PROFILE) {
      const editingMember = this.editingMemberId
        ? family.members.find((m) => m.id === this.editingMemberId) ?? null
        : null;
      tabBody = renderFamilySettingsSection({
        family,
        state,
        confirmResetPending: this.confirmResetPending,
        isEditingFamilyInfo: this.isEditingFamilyInfo,
        familyInfoError: this.familyInfoError,
        isAddingMember: this.isAddingMember,
        editingMember,
        confirmDeleteMemberId: this.confirmDeleteMemberId,
        memberFormError: this.memberFormError,
      });
    } else {
      tabBody = this.renderDashboardTab();
    }

    const navTabs: {tab: MainTab; label: string}[] = [
      {tab: MainTab.DASHBOARD, label: 'Tổng quan'},
      {tab: MainTab.CALENDAR, label: 'Lịch tháng'},
      {tab: MainTab.FINANCE, label: 'Tiền quỹ'},
      {tab: MainTab.NOTES, label: 'Ghi chú'},
      {tab: MainTab.PROFILE, label: 'Gia đình'},
    ];

    this.rootEl.innerHTML = `
      <header class="top-bar">
        <div class="top-bar-inner">
          <div class="brand-wordmark">Lịch Gia Đình</div>

          <nav class="family-nav" aria-label="Điều hướng chính">
            ${navTabs
              .map(
                (item) => `
              <button
                type="button"
                class="nav-link ${state.activeTab === item.tab ? 'is-active' : ''}"
                data-action="set-tab"
                data-tab="${item.tab}"
              >${item.label}</button>
            `,
              )
              .join('')}
          </nav>

          <div class="top-bar-cta">
            <button type="button" class="btn-primary" data-action="open-add">
              + Thêm sự kiện
            </button>
          </div>
        </div>
      </header>

      <main class="home-main">
        <div class="family-switcher-bar" role="region" aria-label="Chọn nhóm gia đình">
          <span class="family-switcher-label">Nhóm đang xem:</span>
          <div class="family-switcher-group">
            ${state.families
              .map(
                (f) => `
              <button
                type="button"
                class="family-switch-btn ${f.id === state.activeFamilyId ? 'is-active' : ''}"
                data-action="switch-family"
                data-id="${escapeHtml(f.id)}"
              >${escapeHtml(familyShortName(f.id))}</button>
            `,
              )
              .join('')}
          </div>
        </div>

        ${tabBody}
      </main>
    `;

    // Mount D3 Pie Chart on whichever tab is currently visible
    if (state.activeTab === MainTab.DASHBOARD) {
      const chartMount = this.rootEl.querySelector<HTMLElement>('#fund-ratio-chart');
      const legendMount = this.rootEl.querySelector<HTMLElement>('#fund-ratio-legend');
      if (chartMount) {
        renderFundRatioPieChart(chartMount, summary, fundTransactions, legendMount);
      }
    } else if (state.activeTab === MainTab.FINANCE) {
      const chartMount = this.rootEl.querySelector<HTMLElement>('#finance-fund-ratio-chart');
      const legendMount = this.rootEl.querySelector<HTMLElement>('#finance-fund-ratio-legend');
      if (chartMount) {
        renderFundRatioPieChart(chartMount, summary, fundTransactions, legendMount);
      }
    }
  }

  dispose() {
    this.unsubscribe?.();
    this.modal.dispose();
    this.rootEl.remove();
  }
}
