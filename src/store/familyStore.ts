import {
  ATTENDANCE_META,
  createSeedData,
  EVENT_TYPE_META,
} from '../constants';
import {
  AppState,
  AttendanceStatus,
  EventPriority,
  EventType,
  FamilyEvent,
  FamilyGroup,
  FamilyMember,
  FinancialSummary,
  FundTransaction,
  FundTransactionType,
  MainTab,
  MemberRole,
  NoteCategory,
  PaymentSource,
  PersonalNote,
  ReminderAlert,
  ReminderOffset,
  RightPanelMode,
} from '../types';
import {
  formatDateVN,
  getDaysDifference,
  getTodayISO,
} from '../utils/lunarCalendar';

const STORAGE_KEY = 'lich_gia_dinh_xr_state_v1';

export type StoreListener = (state: AppState) => void;

export interface EventDraftInput {
  title: string;
  eventType: EventType;
  relatedPerson: string;
  eventDate: string;
  eventTime: string;
  location: string;
  priority: EventPriority;
  note: string;
  expectedAmount: number;
  paymentSource: PaymentSource;
  repeatYearly: boolean;
  repeatByLunar: boolean;
  reminders: ReminderOffset[];
}

export interface FundTransactionInput {
  type: FundTransactionType;
  amount: number;
  actorName: string;
  transactionDate: string;
  note: string;
  eventId?: string;
}

export interface PersonalNoteInput {
  title: string;
  content: string;
  category: NoteCategory;
  linkedEventId?: string;
  pinned?: boolean;
}

export interface FamilyMemberInput {
  fullName: string;
  relation: string;
  phone?: string;
  role: MemberRole;
}

export class FamilyStore {
  private state: AppState;
  private listeners = new Set<StoreListener>();
  private toastCallback?: (message: string, tone?: 'info' | 'success' | 'warning') => void;

  constructor() {
    this.state = this.loadInitialState();
  }

  setToastHandler(cb: (message: string, tone?: 'info' | 'success' | 'warning') => void) {
    this.toastCallback = cb;
  }

  notify(message: string, tone: 'info' | 'success' | 'warning' = 'info') {
    this.toastCallback?.(message, tone);
  }

  private loadInitialState(): AppState {
    const today = getTodayISO();
    const year = Number(today.slice(0, 4)) || 2026;
    const month = Number(today.slice(5, 7)) || 11;
    const seed = createSeedData();

    const fallback: AppState = {
      activeFamilyId: seed.families[0].id,
      selectedYear: year,
      selectedMonth: month,
      activeTab: MainTab.DASHBOARD,
      rightPanelMode: RightPanelMode.DETAIL,
      selectedEventId: seed.events[1]?.id ?? seed.events[0]?.id ?? null,
      dashboardRange: '30d',
      calendarMode: 'month',
      financeSubTab: 'expenses',
      searchQuery: '',
      filterEventType: 'all',
      families: seed.families,
      events: seed.events,
      fundTransactions: seed.fundTransactions,
      personalNotes: seed.personalNotes,
      reminderSettings: {
        enabled: true,
        browserNotifications: false,
        defaultOffsets: [
          ReminderOffset.SEVEN_DAYS,
          ReminderOffset.THREE_DAYS,
          ReminderOffset.ONE_DAY,
          ReminderOffset.SAME_DAY,
        ],
      },
    };

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<AppState>;
      if (!Array.isArray(parsed.families) || parsed.families.length === 0) {
        return fallback;
      }
      return {
        ...fallback,
        ...parsed,
        personalNotes: Array.isArray(parsed.personalNotes)
          ? parsed.personalNotes
          : fallback.personalNotes,
        activeTab: parsed.activeTab ?? MainTab.DASHBOARD,
        rightPanelMode: RightPanelMode.DETAIL,
      };
    } catch {
      return fallback;
    }
  }

  private save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage quota or restricted iframe — fail gracefully
    }
  }

  private emit() {
    this.save();
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): AppState {
    return this.state;
  }

  getActiveFamily(): FamilyGroup {
    return (
      this.state.families.find((f) => f.id === this.state.activeFamilyId) ??
      this.state.families[0]
    );
  }

  getFamilyEvents(familyId: string = this.state.activeFamilyId): FamilyEvent[] {
    const today = getTodayISO();
    return this.state.events
      .filter((e) => e.familyId === familyId)
      .slice()
      .sort((a, b) => {
        const da = getDaysDifference(a.eventDate, today);
        const db = getDaysDifference(b.eventDate, today);
        // Upcoming events sorted soonest first; past events after upcoming (most recent past first)
        const aPast = da < 0;
        const bPast = db < 0;
        if (aPast !== bPast) return aPast ? 1 : -1;
        if (!aPast) return da - db;
        return db - da;
      });
  }

  getDashboardEvents(): FamilyEvent[] {
    const today = getTodayISO();
    const all = this.getFamilyEvents();
    const range = this.state.dashboardRange;
    if (range === 'unconfirmed') {
      return all.filter(
        (e) =>
          e.attendance === AttendanceStatus.UNDECIDED ||
          (getDaysDifference(e.eventDate, today) < 0 &&
            e.attendance === AttendanceStatus.ATTENDED &&
            !e.expenseConfirmed),
      );
    }
    if (range === 'year') {
      return all.filter((e) => Number(e.eventDate.slice(0, 4)) === this.state.selectedYear);
    }
    // Default 30d: include overdue unconfirmed + next 30 days
    return all.filter((e) => {
      const diff = getDaysDifference(e.eventDate, today);
      const isOverdueUnconfirmed = diff < 0 && e.attendance === AttendanceStatus.UNDECIDED;
      return isOverdueUnconfirmed || (diff >= 0 && diff <= 30);
    });
  }

  getFilteredCalendarEvents(): FamilyEvent[] {
    const query = this.state.searchQuery.trim().toLowerCase();
    const filterType = this.state.filterEventType;
    return this.getFamilyEvents().filter((e) => {
      const year = Number(e.eventDate.slice(0, 4));
      const month = Number(e.eventDate.slice(5, 7));
      if (year !== this.state.selectedYear) return false;
      if (this.state.calendarMode === 'month' && month !== this.state.selectedMonth) {
        return false;
      }
      if (filterType !== 'all' && e.eventType !== filterType) return false;
      if (query) {
        const hay = `${e.title} ${e.relatedPerson} ${e.location} ${e.note}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }

  getSelectedEvent(): FamilyEvent | null {
    if (!this.state.selectedEventId) return null;
    return this.state.events.find((e) => e.id === this.state.selectedEventId) ?? null;
  }

  getFamilyFundTransactions(familyId: string = this.state.activeFamilyId): FundTransaction[] {
    return this.state.fundTransactions
      .filter((t) => t.familyId === familyId)
      .slice()
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }

  getPersonalNotes(familyId: string = this.state.activeFamilyId): PersonalNote[] {
    return this.state.personalNotes
      .filter((n) => n.familyId === familyId)
      .slice()
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }

  getFinancialSummary(familyId: string = this.state.activeFamilyId): FinancialSummary {
    const family =
      this.state.families.find((f) => f.id === familyId) ?? this.getActiveFamily();
    const yearStr = String(this.state.selectedYear);
    const eventsInYear = this.state.events.filter(
      (e) => e.familyId === familyId && e.eventDate.startsWith(yearStr),
    );

    let totalExpected = 0;
    let totalActualPersonal = 0;
    let totalActualFromFund = 0;
    let confirmedExpenseCount = 0;

    for (const ev of eventsInYear) {
      if (ev.attendance !== AttendanceStatus.NOT_ATTENDING) {
        totalExpected += ev.expectedAmount;
      }
      if (ev.expenseConfirmed && ev.attendance !== AttendanceStatus.NOT_ATTENDING) {
        confirmedExpenseCount += 1;
        if (ev.paymentSource === PaymentSource.FAMILY_FUND) {
          totalActualFromFund += ev.actualAmount;
        } else {
          totalActualPersonal += ev.actualAmount;
        }
      }
    }

    const totalActualAll = totalActualPersonal + totalActualFromFund;
    const remainingBudget = family.annualBudget - totalActualAll;

    const txns = this.getFamilyFundTransactions(familyId);
    let fundTotalIn = 0;
    let fundTotalOut = 0;
    for (const t of txns) {
      if (t.type === FundTransactionType.EXPENSE) {
        fundTotalOut += t.amount;
      } else {
        fundTotalIn += t.amount;
      }
    }

    return {
      annualBudget: family.annualBudget,
      totalExpected,
      totalActualPersonal,
      totalActualFromFund,
      totalActualAll,
      confirmedExpenseCount,
      remainingBudget,
      fundTotalIn,
      fundTotalOut,
      fundBalance: fundTotalIn - fundTotalOut,
    };
  }

  getAttendanceCounts(familyId: string = this.state.activeFamilyId): Record<AttendanceStatus, number> {
    const counts: Record<AttendanceStatus, number> = {
      [AttendanceStatus.UNDECIDED]: 0,
      [AttendanceStatus.WILL_ATTEND]: 0,
      [AttendanceStatus.NOT_ATTENDING]: 0,
      [AttendanceStatus.ATTENDED]: 0,
    };
    for (const ev of this.getFamilyEvents(familyId)) {
      counts[ev.attendance] += 1;
    }
    return counts;
  }

  getReminderAlerts(): ReminderAlert[] {
    if (!this.state.reminderSettings.enabled) return [];
    const today = getTodayISO();
    const events = this.getFamilyEvents();
    const alerts: ReminderAlert[] = [];

    for (const ev of events) {
      const daysUntil = getDaysDifference(ev.eventDate, today);
      // Overdue unconfirmed alert (PRD §5.1)
      if (daysUntil < 0 && ev.attendance === AttendanceStatus.UNDECIDED) {
        alerts.push({
          id: `overdue-${ev.id}`,
          event: ev,
          daysUntil,
          milestoneLabel: 'Quá hạn chưa xác nhận',
          headline: `${ev.title} (${formatDateVN(ev.eventDate)})`,
          detailLine: 'Vui lòng đánh dấu Đã đi hoặc Không đi để cập nhật báo cáo.',
          isOverdueUnconfirmed: true,
        });
        continue;
      }

      if (daysUntil < 0 || daysUntil > 7) continue;

      const enabledOffsets = ev.reminders.length > 0 ? ev.reminders : this.state.reminderSettings.defaultOffsets;
      let matchedMilestone: string | null = null;
      if (daysUntil === 0 && enabledOffsets.includes(ReminderOffset.SAME_DAY)) {
        matchedMilestone = 'Hôm nay có sự kiện!';
      } else if (daysUntil === 1 && enabledOffsets.includes(ReminderOffset.ONE_DAY)) {
        matchedMilestone = `Ngày mai có ${EVENT_TYPE_META[ev.eventType].label.toLowerCase()}!`;
      } else if (daysUntil <= 3 && enabledOffsets.includes(ReminderOffset.THREE_DAYS)) {
        matchedMilestone = `Còn ${daysUntil} ngày – Nhắc chuẩn bị`;
      } else if (daysUntil <= 7 && enabledOffsets.includes(ReminderOffset.SEVEN_DAYS)) {
        matchedMilestone = `Còn ${daysUntil} ngày – Sắp tới có sự kiện`;
      }

      if (matchedMilestone) {
        const timePart = ev.eventTime ? `${ev.eventTime} · ` : '';
        const placePart = ev.location ? `${ev.location} · ` : '';
        const attPart = ATTENDANCE_META[ev.attendance].label;
        alerts.push({
          id: `rem-${ev.id}`,
          event: ev,
          daysUntil,
          milestoneLabel: matchedMilestone,
          headline: `${ev.title} (${formatDateVN(ev.eventDate)})`,
          detailLine: `${timePart}${placePart}Trạng thái: ${attPart}`,
          isOverdueUnconfirmed: false,
        });
      }
    }

    return alerts.sort((a, b) => {
      if (a.isOverdueUnconfirmed !== b.isOverdueUnconfirmed) {
        return a.isOverdueUnconfirmed ? -1 : 1;
      }
      return a.daysUntil - b.daysUntil;
    });
  }

  // ============================================================================
  // UI Navigation Actions
  // ============================================================================

  setTab(tab: MainTab) {
    this.state = {...this.state, activeTab: tab};
    this.emit();
  }

  setDashboardRange(range: '30d' | 'year' | 'unconfirmed') {
    this.state = {...this.state, dashboardRange: range};
    this.emit();
  }

  setCalendarMode(mode: 'month' | 'year') {
    this.state = {...this.state, calendarMode: mode};
    this.emit();
  }

  setFinanceSubTab(subTab: 'expenses' | 'fund') {
    this.state = {...this.state, financeSubTab: subTab};
    this.emit();
  }

  setSelectedMonth(month: number) {
    const clamped = ((month - 1 + 12) % 12) + 1;
    this.state = {...this.state, selectedMonth: clamped};
    this.emit();
  }

  setSelectedYear(year: number) {
    this.state = {...this.state, selectedYear: Math.max(2020, Math.min(2035, year))};
    this.emit();
  }

  setSearchQuery(query: string) {
    this.state = {...this.state, searchQuery: query};
    this.emit();
  }

  setFilterEventType(type: EventType | 'all') {
    this.state = {...this.state, filterEventType: type};
    this.emit();
  }

  selectEvent(eventId: string | null) {
    this.state = {
      ...this.state,
      selectedEventId: eventId,
      rightPanelMode: RightPanelMode.DETAIL,
    };
    this.emit();
  }

  openQuickAdd() {
    this.state = {
      ...this.state,
      rightPanelMode: RightPanelMode.QUICK_ADD,
    };
    this.emit();
  }

  openEditEvent(eventId: string) {
    this.state = {
      ...this.state,
      selectedEventId: eventId,
      rightPanelMode: RightPanelMode.EDIT_EVENT,
    };
    this.emit();
  }

  openFundForm() {
    this.state = {
      ...this.state,
      rightPanelMode: RightPanelMode.FUND_FORM,
    };
    this.emit();
  }

  switchFamily(familyId: string) {
    const family = this.state.families.find((f) => f.id === familyId);
    if (!family) return;
    const famEvents = this.getFamilyEvents(familyId);
    this.state = {
      ...this.state,
      activeFamilyId: familyId,
      selectedEventId: famEvents[0]?.id ?? null,
      rightPanelMode: RightPanelMode.DETAIL,
    };
    this.notify(`Đã chuyển sang ${family.name}`, 'info');
    this.emit();
  }

  // ============================================================================
  // Domain CRUD Actions (PRD Business Rules)
  // ============================================================================

  addEvent(draft: EventDraftInput): FamilyEvent {
    const id = `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newEvent: FamilyEvent = {
      id,
      familyId: this.state.activeFamilyId,
      title: draft.title.trim(),
      eventType: draft.eventType,
      relatedPerson: draft.relatedPerson.trim(),
      eventDate: draft.eventDate,
      eventTime: draft.eventTime.trim(),
      location: draft.location.trim(),
      priority: draft.priority,
      note: draft.note.trim(),
      attendance: AttendanceStatus.UNDECIDED, // PRD §5.6 default
      expectedAmount: Math.max(0, draft.expectedAmount),
      actualAmount: 0,
      expenseConfirmed: false,
      paymentSource: draft.paymentSource,
      repeatYearly: draft.repeatYearly,
      repeatByLunar: draft.repeatByLunar,
      reminders: draft.reminders,
      createdAt: getTodayISO(),
    };

    this.state = {
      ...this.state,
      events: [newEvent, ...this.state.events],
      selectedEventId: id,
      rightPanelMode: RightPanelMode.DETAIL,
    };
    this.notify(`Đã thêm sự kiện "${newEvent.title}"`, 'success');
    this.emit();
    return newEvent;
  }

  updateEvent(eventId: string, draft: EventDraftInput) {
    const existing = this.state.events.find((e) => e.id === eventId);
    if (!existing) return;

    const updated: FamilyEvent = {
      ...existing,
      title: draft.title.trim(),
      eventType: draft.eventType,
      relatedPerson: draft.relatedPerson.trim(),
      eventDate: draft.eventDate,
      eventTime: draft.eventTime.trim(),
      location: draft.location.trim(),
      priority: draft.priority,
      note: draft.note.trim(),
      expectedAmount: Math.max(0, draft.expectedAmount),
      paymentSource: draft.paymentSource,
      repeatYearly: draft.repeatYearly,
      repeatByLunar: draft.repeatByLunar,
      reminders: draft.reminders,
    };

    this.state = {
      ...this.state,
      events: this.state.events.map((e) => (e.id === eventId ? updated : e)),
      rightPanelMode: RightPanelMode.DETAIL,
    };
    this.syncLinkedFundTransaction(updated);
    this.notify(`Đã cập nhật "${updated.title}"`, 'success');
    this.emit();
  }

  deleteEvent(eventId: string) {
    const target = this.state.events.find((e) => e.id === eventId);
    if (!target) return;

    const remaining = this.state.events.filter((e) => e.id !== eventId);
    // Cancel linked fund transaction if any
    const remainingTxns = this.state.fundTransactions.filter((t) => t.eventId !== eventId);
    const nextEvent = remaining.find((e) => e.familyId === this.state.activeFamilyId) ?? null;

    this.state = {
      ...this.state,
      events: remaining,
      fundTransactions: remainingTxns,
      selectedEventId: nextEvent?.id ?? null,
      rightPanelMode: RightPanelMode.DETAIL,
    };
    this.notify(`Đã xóa sự kiện "${target.title}" và hủy nhắc nhở liên quan`, 'info');
    this.emit();
  }

  setAttendance(eventId: string, status: AttendanceStatus) {
    const target = this.state.events.find((e) => e.id === eventId);
    if (!target) return;

    const updated: FamilyEvent = {
      ...target,
      attendance: status,
    };

    // PRD §5.4 & §5.6: If NOT_ATTENDING, do not count actual expense
    if (status === AttendanceStatus.NOT_ATTENDING) {
      updated.expenseConfirmed = false;
      updated.actualAmount = 0;
    }

    this.state = {
      ...this.state,
      events: this.state.events.map((e) => (e.id === eventId ? updated : e)),
    };
    this.syncLinkedFundTransaction(updated);

    if (status === AttendanceStatus.ATTENDED && !updated.expenseConfirmed) {
      this.notify('Đã đánh dấu Đã đi — bạn có thể xác nhận số tiền thực tế bên dưới.', 'success');
    } else {
      this.notify(`Trạng thái: ${ATTENDANCE_META[status].label}`, 'info');
    }
    this.emit();
  }

  confirmEventExpense(
    eventId: string,
    actualAmount: number,
    paymentSource: PaymentSource,
  ): {overdraftWarning: boolean} {
    const target = this.state.events.find((e) => e.id === eventId);
    if (!target) return {overdraftWarning: false};

    const amount = Math.max(0, Math.round(actualAmount));
    const summaryBefore = this.getFinancialSummary(target.familyId);
    const prevLinkedOut =
      target.expenseConfirmed && target.paymentSource === PaymentSource.FAMILY_FUND
        ? target.actualAmount
        : 0;
    const effectiveBalance = summaryBefore.fundBalance + prevLinkedOut;
    const overdraftWarning =
      paymentSource === PaymentSource.FAMILY_FUND && amount > effectiveBalance;

    const updated: FamilyEvent = {
      ...target,
      actualAmount: amount,
      paymentSource,
      expenseConfirmed: amount > 0,
      expenseDate: getTodayISO(),
      attendance:
        target.attendance === AttendanceStatus.UNDECIDED ||
        target.attendance === AttendanceStatus.WILL_ATTEND
          ? AttendanceStatus.ATTENDED
          : target.attendance,
    };

    this.state = {
      ...this.state,
      events: this.state.events.map((e) => (e.id === eventId ? updated : e)),
    };
    this.syncLinkedFundTransaction(updated);

    if (overdraftWarning) {
      this.notify('Cảnh báo: Khoản chi vượt quá số dư Quỹ chung hiện tại!', 'warning');
    } else {
      this.notify('Đã xác nhận khoản chi tiền đám.', 'success');
    }
    this.emit();
    return {overdraftWarning};
  }

  /**
   * Ensures a single linked FundTransaction exists when an event is confirmed with FAMILY_FUND,
   * preventing double counting per PRD §5.5.
   */
  private syncLinkedFundTransaction(event: FamilyEvent) {
    const existingIdx = this.state.fundTransactions.findIndex((t) => t.eventId === event.id);
    const shouldHaveFundTxn =
      event.expenseConfirmed &&
      event.actualAmount > 0 &&
      event.paymentSource === PaymentSource.FAMILY_FUND &&
      event.attendance !== AttendanceStatus.NOT_ATTENDING;

    if (!shouldHaveFundTxn) {
      if (existingIdx >= 0) {
        this.state = {
          ...this.state,
          fundTransactions: this.state.fundTransactions.filter((t) => t.eventId !== event.id),
        };
      }
      return;
    }

    const txn: FundTransaction = {
      id: existingIdx >= 0 ? this.state.fundTransactions[existingIdx].id : `ft-evt-${event.id}`,
      familyId: event.familyId,
      type: FundTransactionType.EXPENSE,
      amount: event.actualAmount,
      eventId: event.id,
      actorName: this.getActiveFamily().members[0]?.fullName ?? 'Chủ hộ',
      transactionDate: event.expenseDate ?? getTodayISO(),
      note: `Chi từ quỹ cho sự kiện: ${event.title}`,
    };

    if (existingIdx >= 0) {
      const next = this.state.fundTransactions.slice();
      next[existingIdx] = txn;
      this.state = {...this.state, fundTransactions: next};
    } else {
      this.state = {
        ...this.state,
        fundTransactions: [txn, ...this.state.fundTransactions],
      };
    }
  }

  addFundTransaction(input: FundTransactionInput): {overdraftWarning: boolean} {
    const amount = Math.max(0, Math.round(input.amount));
    if (amount <= 0) return {overdraftWarning: false};

    const summary = this.getFinancialSummary();
    const overdraftWarning =
      input.type === FundTransactionType.EXPENSE && amount > summary.fundBalance;

    const txn: FundTransaction = {
      id: `ft-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      familyId: this.state.activeFamilyId,
      type: input.type,
      amount,
      eventId: input.eventId,
      actorName: input.actorName.trim() || this.getActiveFamily().members[0]?.fullName || 'Thành viên',
      transactionDate: input.transactionDate || getTodayISO(),
      note: input.note.trim() || (input.type === FundTransactionType.EXPENSE ? 'Chi từ quỹ chung' : 'Đóng góp vào quỹ'),
    };

    this.state = {
      ...this.state,
      fundTransactions: [txn, ...this.state.fundTransactions],
      rightPanelMode: RightPanelMode.DETAIL,
    };

    if (overdraftWarning) {
      this.notify('Cảnh báo: Số dư quỹ chung không đủ cho khoản chi này!', 'warning');
    } else {
      this.notify(
        input.type === FundTransactionType.EXPENSE
          ? 'Đã ghi nhận khoản rút từ quỹ chung.'
          : 'Đã thêm khoản đóng góp vào quỹ chung.',
        'success',
      );
    }
    this.emit();
    return {overdraftWarning};
  }

  deleteFundTransaction(txnId: string) {
    const target = this.state.fundTransactions.find((t) => t.id === txnId);
    if (!target) return;

    const nextTxns = this.state.fundTransactions.filter((t) => t.id !== txnId);
    const nextEvents = target.eventId
      ? this.state.events.map((ev) =>
          ev.id === target.eventId
            ? {...ev, expenseConfirmed: false, actualAmount: 0}
            : ev,
        )
      : this.state.events;

    this.state = {
      ...this.state,
      fundTransactions: nextTxns,
      events: nextEvents,
    };
    this.notify('Đã xóa giao dịch tiền quỹ.', 'info');
    this.emit();
  }

  updateAnnualBudget(newBudget: number) {
    const safe = Math.max(1_000_000, Math.round(newBudget));
    this.state = {
      ...this.state,
      families: this.state.families.map((f) =>
        f.id === this.state.activeFamilyId ? {...f, annualBudget: safe} : f,
      ),
    };
    this.emit();
  }

  // ============================================================================
  // Family Info & Members CRUD
  // ============================================================================

  updateFamilyInfo(input: {name: string; description: string}) {
    const name = input.name.trim();
    if (!name) return;
    const description = input.description.trim();
    this.state = {
      ...this.state,
      families: this.state.families.map((f) =>
        f.id === this.state.activeFamilyId ? {...f, name, description} : f,
      ),
    };
    this.notify(`Đã cập nhật thông tin "${name}".`, 'success');
    this.emit();
  }

  addFamilyMember(input: FamilyMemberInput): FamilyMember | null {
    const fullName = input.fullName.trim();
    const relation = input.relation.trim();
    if (!fullName || !relation) return null;
    const phone = input.phone?.trim() || undefined;
    const member: FamilyMember = {
      id: `mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      fullName,
      relation,
      phone,
      role: input.role,
    };
    this.state = {
      ...this.state,
      families: this.state.families.map((f) =>
        f.id === this.state.activeFamilyId ? {...f, members: [...f.members, member]} : f,
      ),
    };
    this.notify(`Đã thêm thành viên "${fullName}".`, 'success');
    this.emit();
    return member;
  }

  updateFamilyMember(memberId: string, input: FamilyMemberInput) {
    const fullName = input.fullName.trim();
    const relation = input.relation.trim();
    if (!fullName || !relation) return;
    const phone = input.phone?.trim() || undefined;
    this.state = {
      ...this.state,
      families: this.state.families.map((f) =>
        f.id === this.state.activeFamilyId
          ? {
              ...f,
              members: f.members.map((m) =>
                m.id === memberId ? {...m, fullName, relation, phone, role: input.role} : m,
              ),
            }
          : f,
      ),
    };
    this.notify(`Đã cập nhật thành viên "${fullName}".`, 'success');
    this.emit();
  }

  deleteFamilyMember(memberId: string) {
    const active = this.getActiveFamily();
    const target = active.members.find((m) => m.id === memberId);
    if (!target) return;
    this.state = {
      ...this.state,
      families: this.state.families.map((f) =>
        f.id === this.state.activeFamilyId
          ? {...f, members: f.members.filter((m) => m.id !== memberId)}
          : f,
      ),
    };
    this.notify(`Đã xóa thành viên "${target.fullName}".`, 'info');
    this.emit();
  }

  // ============================================================================
  // Personal Notes CRUD
  // ============================================================================

  addPersonalNote(input: PersonalNoteInput): PersonalNote {
    const note: PersonalNote = {
      id: `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      familyId: this.state.activeFamilyId,
      title: input.title.trim(),
      content: input.content.trim(),
      category: input.category,
      linkedEventId: input.linkedEventId || undefined,
      pinned: Boolean(input.pinned),
      updatedAt: getTodayISO(),
    };
    this.state = {
      ...this.state,
      personalNotes: [note, ...this.state.personalNotes],
    };
    this.notify(`Đã lưu ghi chú "${note.title}"`, 'success');
    this.emit();
    return note;
  }

  updatePersonalNote(noteId: string, input: PersonalNoteInput) {
    const existing = this.state.personalNotes.find((n) => n.id === noteId);
    if (!existing) return;
    const updated: PersonalNote = {
      ...existing,
      title: input.title.trim(),
      content: input.content.trim(),
      category: input.category,
      linkedEventId: input.linkedEventId || undefined,
      pinned: input.pinned ?? existing.pinned,
      updatedAt: getTodayISO(),
    };
    this.state = {
      ...this.state,
      personalNotes: this.state.personalNotes.map((n) => (n.id === noteId ? updated : n)),
    };
    this.notify(`Đã cập nhật ghi chú "${updated.title}"`, 'success');
    this.emit();
  }

  toggleNotePin(noteId: string) {
    const existing = this.state.personalNotes.find((n) => n.id === noteId);
    if (!existing) return;
    const nextPinned = !existing.pinned;
    this.state = {
      ...this.state,
      personalNotes: this.state.personalNotes.map((n) =>
        n.id === noteId ? {...n, pinned: nextPinned} : n,
      ),
    };
    this.notify(nextPinned ? 'Đã ghim ghi chú lên đầu.' : 'Đã bỏ ghim ghi chú.', 'info');
    this.emit();
  }

  deletePersonalNote(noteId: string) {
    const existing = this.state.personalNotes.find((n) => n.id === noteId);
    if (!existing) return;
    this.state = {
      ...this.state,
      personalNotes: this.state.personalNotes.filter((n) => n.id !== noteId),
    };
    this.notify(`Đã xóa ghi chú "${existing.title}"`, 'info');
    this.emit();
  }

  toggleReminderOffset(offset: ReminderOffset) {
    const current = this.state.reminderSettings.defaultOffsets;
    const exists = current.includes(offset);
    const next = exists ? current.filter((o) => o !== offset) : [...current, offset];
    this.state = {
      ...this.state,
      reminderSettings: {
        ...this.state.reminderSettings,
        defaultOffsets: next,
      },
    };
    this.emit();
  }

  toggleRemindersEnabled() {
    this.state = {
      ...this.state,
      reminderSettings: {
        ...this.state.reminderSettings,
        enabled: !this.state.reminderSettings.enabled,
      },
    };
    this.notify(
      this.state.reminderSettings.enabled ? 'Đã bật nhắc nhở sự kiện' : 'Đã tạm tắt nhắc nhở',
      'info',
    );
    this.emit();
  }

  async requestBrowserNotifications(): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.notify('Trình duyệt hiện tại không hỗ trợ thông báo đẩy.', 'warning');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      this.state = {
        ...this.state,
        reminderSettings: {
          ...this.state.reminderSettings,
          browserNotifications: granted,
        },
      };
      this.emit();
      if (granted) {
        const first = this.getReminderAlerts()[0];
        if (first) {
          new Notification(first.milestoneLabel, {
            body: `${first.headline} — ${first.detailLine}`,
          });
        }
        this.notify('Đã bật thông báo nhắc lịch trên trình duyệt!', 'success');
      } else {
        this.notify('Chưa cấp quyền thông báo trình duyệt.', 'warning');
      }
    } catch {
      this.notify('Không thể kích hoạt thông báo trong khung xem thử.', 'info');
    }
  }

  exportBackupJSON() {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich-gia-dinh-xr-backup-${getTodayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.notify('Đã tải xuống tệp sao lưu JSON.', 'success');
  }

  resetDemoData() {
    window.localStorage.removeItem(STORAGE_KEY);
    this.state = this.loadInitialState();
    this.notify('Đã khôi phục dữ liệu mẫu ban đầu.', 'info');
    this.emit();
  }
}
