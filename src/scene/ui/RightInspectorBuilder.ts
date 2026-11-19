import * as xb from 'xrblocks';

import {
  ATTENDANCE_META,
  COLORS,
  EVENT_TYPE_LIST,
  EVENT_TYPE_META,
  PRIORITY_META,
  REMINDER_OPTIONS,
  URGENCY_META,
} from '../../constants';
import {EventDraftInput, FamilyStore} from '../../store/familyStore';
import {
  AttendanceStatus,
  EventPriority,
  EventType,
  FamilyEvent,
  FundTransactionType,
  PaymentSource,
  ReminderOffset,
  RightPanelMode,
} from '../../types';
import {audioFeedback} from '../../utils/audioFeedback';
import {
  addDaysToISO,
  formatDateVN,
  formatDaysUntilLabel,
  formatDualDate,
  formatLunarShort,
  formatVND,
  getDaysDifference,
  getTimeUrgency,
  getTodayISO,
  parseVietnameseDateInput,
  parseVNDInput,
} from '../../utils/lunarCalendar';
import {
  clearUIContainer,
  createActionButton,
  createDivider,
  createLabeledInput,
} from './uiHelpers';

export interface RightPanelDraftState {
  // Event Quick Add / Edit form state
  editingEventId: string | null;
  title: string;
  eventType: EventType;
  relatedPerson: string;
  dateText: string; // DD/MM/YYYY
  eventTime: string;
  location: string;
  priority: EventPriority;
  expectedAmountText: string;
  paymentSource: PaymentSource;
  repeatYearly: boolean;
  repeatByLunar: boolean;
  reminders: ReminderOffset[];
  note: string;
  formError: string;

  // Detail expense input state
  detailEventId: string | null;
  actualAmountText: string;
  detailSource: PaymentSource;
  confirmDeleteArmed: boolean;

  // Fund Transaction form state
  fundType: FundTransactionType;
  fundAmountText: string;
  fundActor: string;
  fundNote: string;
  fundError: string;
}

export function createInitialDraftState(): RightPanelDraftState {
  const today = getTodayISO();
  return {
    editingEventId: null,
    title: '',
    eventType: EventType.WEDDING,
    relatedPerson: '',
    dateText: formatDateVN(addDaysToISO(today, 3)),
    eventTime: '11:00',
    location: '',
    priority: EventPriority.IMPORTANT,
    expectedAmountText: '1000000',
    paymentSource: PaymentSource.PERSONAL,
    repeatYearly: false,
    repeatByLunar: false,
    reminders: [
      ReminderOffset.SEVEN_DAYS,
      ReminderOffset.THREE_DAYS,
      ReminderOffset.ONE_DAY,
      ReminderOffset.SAME_DAY,
    ],
    note: '',
    formError: '',

    detailEventId: null,
    actualAmountText: '',
    detailSource: PaymentSource.PERSONAL,
    confirmDeleteArmed: false,

    fundType: FundTransactionType.CONTRIBUTION,
    fundAmountText: '1000000',
    fundActor: 'Thành viên gia đình',
    fundNote: 'Đóng góp quỹ chung hiếu hỉ',
    fundError: '',
  };
}

export function populateDraftFromEvent(draft: RightPanelDraftState, ev: FamilyEvent) {
  draft.editingEventId = ev.id;
  draft.title = ev.title;
  draft.eventType = ev.eventType;
  draft.relatedPerson = ev.relatedPerson;
  draft.dateText = formatDateVN(ev.eventDate);
  draft.eventTime = ev.eventTime;
  draft.location = ev.location;
  draft.priority = ev.priority;
  draft.expectedAmountText = ev.expectedAmount > 0 ? String(ev.expectedAmount) : '';
  draft.paymentSource = ev.paymentSource;
  draft.repeatYearly = ev.repeatYearly;
  draft.repeatByLunar = ev.repeatByLunar;
  draft.reminders = ev.reminders.slice();
  draft.note = ev.note;
  draft.formError = '';
}

export function resetQuickAddDraft(draft: RightPanelDraftState) {
  const fresh = createInitialDraftState();
  Object.assign(draft, {
    editingEventId: null,
    title: '',
    eventType: fresh.eventType,
    relatedPerson: '',
    dateText: fresh.dateText,
    eventTime: fresh.eventTime,
    location: '',
    priority: fresh.priority,
    expectedAmountText: fresh.expectedAmountText,
    paymentSource: fresh.paymentSource,
    repeatYearly: false,
    repeatByLunar: false,
    reminders: fresh.reminders,
    note: '',
    formError: '',
  });
}

export function renderRightInspectorCard(
  container: xb.UIPanel,
  store: FamilyStore,
  draft: RightPanelDraftState,
  onRerender: () => void,
) {
  clearUIContainer(container);
  const state = store.getState();

  if (state.rightPanelMode === RightPanelMode.QUICK_ADD || state.rightPanelMode === RightPanelMode.EDIT_EVENT) {
    renderEventForm(container, store, draft, state.rightPanelMode === RightPanelMode.EDIT_EVENT, onRerender);
    return;
  }

  if (state.rightPanelMode === RightPanelMode.FUND_FORM) {
    renderFundForm(container, store, draft, onRerender);
    return;
  }

  renderEventDetail(container, store, draft, onRerender);
}

function renderEventDetail(
  container: xb.UIPanel,
  store: FamilyStore,
  draft: RightPanelDraftState,
  onRerender: () => void,
) {
  const ev = store.getSelectedEvent();

  if (!ev) {
    container.add(
      new xb.UIText({
        text: 'Chi tiết sự kiện',
        pointerEvents: 'none',
        style: {fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary},
      }),
      new xb.UIText({
        text: 'Chạm vào một sự kiện trong danh sách hoặc biểu tượng 3D trên bàn lịch để xem chi tiết, xác nhận đi/không đi và ghi nhận tiền đám.',
        pointerEvents: 'none',
        style: {fontSize: 15, color: COLORS.textSecondary, lineHeight: 1.45},
      }),
      createActionButton({
        label: 'Thêm sự kiện mới',
        icon: 'add',
        tone: 'primary',
        onClick: () => {
          resetQuickAddDraft(draft);
          store.openQuickAdd();
        },
      }),
    );
    return;
  }

  // Sync detail inputs when switching selected event
  if (draft.detailEventId !== ev.id) {
    draft.detailEventId = ev.id;
    const defaultAmt = ev.expenseConfirmed ? ev.actualAmount : ev.expectedAmount;
    draft.actualAmountText = defaultAmt > 0 ? String(defaultAmt) : '1000000';
    draft.detailSource = ev.paymentSource;
    draft.confirmDeleteArmed = false;
  }

  const daysUntil = getDaysDifference(ev.eventDate);
  const urgency = getTimeUrgency(daysUntil);
  const urgencyMeta = URGENCY_META[urgency];
  const priorityMeta = PRIORITY_META[ev.priority];
  const typeMeta = EVENT_TYPE_META[ev.eventType];

  // Header row with Edit & Delete
  const header = new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    children: [
      new xb.UIText({
        text: 'Chi tiết sự kiện',
        pointerEvents: 'none',
        style: {fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary},
      }),
      new xb.UIPanel({
        style: {flexDirection: 'row', gap: 6},
        children: [
          createActionButton({
            label: 'Sửa',
            icon: 'edit',
            compact: true,
            onClick: () => {
              populateDraftFromEvent(draft, ev);
              store.openEditEvent(ev.id);
            },
          }),
          createActionButton({
            label: draft.confirmDeleteArmed ? 'Xác nhận xóa?' : 'Xóa',
            icon: 'delete',
            compact: true,
            tone: draft.confirmDeleteArmed ? 'danger' : 'neutral',
            onClick: () => {
              if (!draft.confirmDeleteArmed) {
                draft.confirmDeleteArmed = true;
                onRerender();
              } else {
                draft.confirmDeleteArmed = false;
                store.deleteEvent(ev.id);
              }
            },
          }),
        ],
      }),
    ],
  });

  const bodyScroll = new xb.UIScrollView({
    ariaLabel: 'Nội dung chi tiết sự kiện',
    style: {
      width: '100%',
      flexGrow: 1,
      flexBasis: 0,
      minHeight: 200,
      flexDirection: 'column',
      gap: 12,
    },
  });

  // Title + distinct metadata lines (Priority vs Time Urgency separated per PRD §5.3)
  const infoBlock = new xb.UIPanel({
    pointerEvents: 'none',
    style: {
      width: '100%',
      flexDirection: 'column',
      gap: 6,
      padding: 12,
      borderRadius: 12,
      backgroundColor: COLORS.surfacePanel,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
    },
    children: [
      new xb.UIText({
        text: ev.title,
        pointerEvents: 'none',
        style: {fontSize: 20, fontWeight: 'bold', color: '#FFFFFF'},
      }),
      new xb.UIText({
        text: `${typeMeta.label} · Ưu tiên: ${priorityMeta.label}`,
        pointerEvents: 'none',
        style: {fontSize: 14, fontWeight: 'bold', color: priorityMeta.colorCss},
      }),
      new xb.UIText({
        text: `Thời gian: ${formatDualDate(ev.eventDate)}${ev.eventTime ? ` lúc ${ev.eventTime}` : ''} · ${formatDaysUntilLabel(daysUntil)}`,
        pointerEvents: 'none',
        style: {fontSize: 14, color: urgencyMeta.colorCss},
      }),
      ...(ev.relatedPerson
        ? [
            new xb.UIText({
              text: `Người liên quan: ${ev.relatedPerson}`,
              pointerEvents: 'none',
              style: {fontSize: 14, color: COLORS.textSecondary},
            }),
          ]
        : []),
      ...(ev.location
        ? [
            new xb.UIText({
              text: `Địa điểm: ${ev.location}`,
              pointerEvents: 'none',
              style: {fontSize: 14, color: COLORS.textSecondary},
            }),
          ]
        : []),
      ...(ev.repeatYearly
        ? [
            new xb.UIText({
              text: ev.repeatByLunar
                ? 'Lặp lại hằng năm theo Âm lịch'
                : 'Lặp lại hằng năm theo Dương lịch',
              pointerEvents: 'none',
              style: {fontSize: 13, color: '#93C5FD'},
            }),
          ]
        : []),
      ...(ev.note
        ? [
            new xb.UIText({
              text: `Ghi chú: ${ev.note}`,
              pointerEvents: 'none',
              style: {fontSize: 13, color: COLORS.textMuted, lineHeight: 1.35},
            }),
          ]
        : []),
    ],
  });

  // 1-Tap Attendance Control (4 PRD states)
  const attendanceTitle = new xb.UIText({
    text: `Trạng thái tham dự: ${ATTENDANCE_META[ev.attendance].label}`,
    pointerEvents: 'none',
    style: {fontSize: 15, fontWeight: 'bold', color: COLORS.textPrimary},
  });

  const attRow1 = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 6},
    children: [
      createActionButton({
        label: 'Sẽ đi',
        icon: 'event_available',
        compact: true,
        grow: true,
        active: ev.attendance === AttendanceStatus.WILL_ATTEND,
        onClick: () => store.setAttendance(ev.id, AttendanceStatus.WILL_ATTEND),
      }),
      createActionButton({
        label: 'Đã đi',
        icon: 'check_circle',
        compact: true,
        grow: true,
        tone: ev.attendance === AttendanceStatus.ATTENDED ? 'success' : 'neutral',
        onClick: () => {
          audioFeedback.playConfirm();
          store.setAttendance(ev.id, AttendanceStatus.ATTENDED);
        },
      }),
    ],
  });

  const attRow2 = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 6},
    children: [
      createActionButton({
        label: 'Không đi',
        icon: 'cancel',
        compact: true,
        grow: true,
        tone: ev.attendance === AttendanceStatus.NOT_ATTENDING ? 'danger' : 'neutral',
        onClick: () => store.setAttendance(ev.id, AttendanceStatus.NOT_ATTENDING),
      }),
      createActionButton({
        label: 'Chưa xác định',
        icon: 'help',
        compact: true,
        grow: true,
        tone: ev.attendance === AttendanceStatus.UNDECIDED ? 'warning' : 'neutral',
        onClick: () => store.setAttendance(ev.id, AttendanceStatus.UNDECIDED),
      }),
    ],
  });

  bodyScroll.add(infoBlock, attendanceTitle, attRow1, attRow2, createDivider());

  // Money Tracking Block (PRD §5.4 + §5.6 business rule: hide expense requirement if NOT_ATTENDING)
  if (ev.attendance === AttendanceStatus.NOT_ATTENDING) {
    bodyScroll.add(
      new xb.UIText({
        text: 'Bạn đã chọn Không đi — không yêu cầu ghi nhận tiền đám và không tính vào tổng đã chi.',
        pointerEvents: 'none',
        style: {fontSize: 14, color: COLORS.textMuted, lineHeight: 1.4},
      }),
    );
  } else {
    const moneyHeader = new xb.UIText({
      text: `Tiền đám · Dự kiến: ${formatVND(ev.expectedAmount)}`,
      pointerEvents: 'none',
      style: {fontSize: 15, fontWeight: 'bold', color: COLORS.textPrimary},
    });

    const confirmedLine = new xb.UIText({
      text: ev.expenseConfirmed
        ? `Đã xác nhận chi: ${formatVND(ev.actualAmount)} (${ev.paymentSource === PaymentSource.FAMILY_FUND ? 'Từ Quỹ chung' : 'Tiền cá nhân'})`
        : 'Chưa xác nhận chi thực tế (chỉ cộng vào báo cáo khi xác nhận)',
      pointerEvents: 'none',
      style: {
        fontSize: 13,
        color: ev.expenseConfirmed ? '#86EFAC' : '#FDE68A',
        lineHeight: 1.35,
      },
    });

    const sourceRow = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 6},
      children: [
        createActionButton({
          label: 'Tiền cá nhân',
          compact: true,
          grow: true,
          active: draft.detailSource === PaymentSource.PERSONAL,
          onClick: () => {
            draft.detailSource = PaymentSource.PERSONAL;
            onRerender();
          },
        }),
        createActionButton({
          label: 'Quỹ chung',
          compact: true,
          grow: true,
          active: draft.detailSource === PaymentSource.FAMILY_FUND,
          onClick: () => {
            draft.detailSource = PaymentSource.FAMILY_FUND;
            onRerender();
          },
        }),
      ],
    });

    const quickAmtRow = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 6},
      children: [500_000, 1_000_000, 2_000_000, 3_000_000].map((amt) =>
        createActionButton({
          label: amt >= 1_000_000 ? `${amt / 1_000_000}tr` : `${amt / 1000}k`,
          compact: true,
          grow: true,
          active: parseVNDInput(draft.actualAmountText) === amt,
          onClick: () => {
            draft.actualAmountText = String(amt);
            onRerender();
          },
        }),
      ),
    });

    const amountInput = createLabeledInput({
      label: 'Số tiền thực tế (VNĐ, VD: 1500000 hoặc 1.5tr)',
      ariaLabel: 'Số tiền thực tế đã chi',
      value: draft.actualAmountText,
      placeholder: 'Nhập số tiền...',
      onInput: (val) => {
        draft.actualAmountText = val;
      },
    });

    const summary = store.getFinancialSummary();
    const pendingAmt = parseVNDInput(draft.actualAmountText);
    const willOverdraft =
      draft.detailSource === PaymentSource.FAMILY_FUND && pendingAmt > summary.fundBalance;

    const confirmBtn = createActionButton({
      label: ev.expenseConfirmed ? 'Cập nhật khoản chi' : 'Xác nhận đã chi tiền đám',
      icon: 'payments',
      tone: 'success',
      onClick: () => {
        const parsed = parseVNDInput(draft.actualAmountText);
        if (parsed <= 0) {
          audioFeedback.playWarning();
          store.notify('Vui lòng nhập số tiền lớn hơn 0.', 'warning');
          return;
        }
        const res = store.confirmEventExpense(ev.id, parsed, draft.detailSource);
        if (res.overdraftWarning) audioFeedback.playWarning();
        else audioFeedback.playSuccess();
      },
    });

    bodyScroll.add(moneyHeader, confirmedLine, sourceRow, quickAmtRow, amountInput);
    if (willOverdraft) {
      bodyScroll.add(
        new xb.UIText({
          text: `Lưu ý: Quỹ chung còn ${formatVND(summary.fundBalance)}, khoản chi này vượt số dư hiện tại.`,
          pointerEvents: 'none',
          style: {fontSize: 13, color: '#FCA5A5', lineHeight: 1.35},
        }),
      );
    }
    bodyScroll.add(confirmBtn);
  }

  container.add(header, bodyScroll);
}

function renderEventForm(
  container: xb.UIPanel,
  store: FamilyStore,
  draft: RightPanelDraftState,
  isEdit: boolean,
  onRerender: () => void,
) {
  const header = new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    children: [
      new xb.UIText({
        text: isEdit ? 'Chỉnh sửa sự kiện' : 'Thêm nhanh sự kiện',
        pointerEvents: 'none',
        style: {fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary},
      }),
      createActionButton({
        label: 'Đóng',
        icon: 'close',
        compact: true,
        onClick: () => {
          store.selectEvent(store.getState().selectedEventId);
        },
      }),
    ],
  });

  const scroll = new xb.UIScrollView({
    ariaLabel: 'Biểu mẫu thêm sự kiện nhanh',
    style: {
      width: '100%',
      flexGrow: 1,
      flexBasis: 0,
      minHeight: 200,
      flexDirection: 'column',
      gap: 10,
    },
  });

  const titleField = createLabeledInput({
    label: 'Tên sự kiện *',
    ariaLabel: 'Tên sự kiện',
    value: draft.title,
    placeholder: 'VD: Đám cưới Anh Nam, Giỗ Ông nội...',
    onInput: (val) => {
      draft.title = val;
    },
  });

  // Event type selector (cycles or quick pills in 2 compact rows)
  const typeLabel = new xb.UIText({
    text: `Loại sự kiện: ${EVENT_TYPE_META[draft.eventType].label}`,
    pointerEvents: 'none',
    style: {fontSize: 13, fontWeight: 'bold', color: COLORS.textSecondary},
  });

  const typeRow1 = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 5},
    children: EVENT_TYPE_LIST.slice(0, 4).map((t) =>
      createActionButton({
        label: EVENT_TYPE_META[t].label,
        compact: true,
        grow: true,
        active: draft.eventType === t,
        onClick: () => {
          draft.eventType = t;
          // Auto-suggest lunar repeat for death anniversary & clan ceremony
          if (t === EventType.DEATH_ANNIVERSARY || t === EventType.CLAN_CEREMONY) {
            draft.repeatYearly = true;
            draft.repeatByLunar = true;
          }
          onRerender();
        },
      }),
    ),
  });

  const typeRow2 = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 5},
    children: EVENT_TYPE_LIST.slice(4, 9).map((t) =>
      createActionButton({
        label: t === EventType.FAMILY_EVENT ? 'Gia đình' : EVENT_TYPE_META[t].label,
        compact: true,
        grow: true,
        active: draft.eventType === t,
        onClick: () => {
          draft.eventType = t;
          onRerender();
        },
      }),
    ),
  });

  // Date input + quick date buttons + live Lunar conversion preview
  const parsedISO = parseVietnameseDateInput(draft.dateText);
  const lunarPreviewText = parsedISO
    ? `Quy đổi Âm lịch: ${formatLunarShort(parsedISO)}`
    : 'Nhập định dạng DD/MM/YYYY (VD: 25/11/2026)';

  const dateField = createLabeledInput({
    label: 'Ngày diễn ra (DD/MM/YYYY) *',
    ariaLabel: 'Ngày diễn ra sự kiện',
    value: draft.dateText,
    placeholder: 'DD/MM/YYYY',
    onInput: (val) => {
      draft.dateText = val;
    },
  });

  const today = getTodayISO();
  const quickDateRow = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 5},
    children: [
      {label: 'Hôm nay', offset: 0},
      {label: '+1 ngày', offset: 1},
      {label: '+3 ngày', offset: 3},
      {label: '+7 ngày', offset: 7},
    ].map((item) =>
      createActionButton({
        label: item.label,
        compact: true,
        grow: true,
        onClick: () => {
          draft.dateText = formatDateVN(addDaysToISO(today, item.offset));
          onRerender();
        },
      }),
    ),
  });

  const lunarPreview = new xb.UIText({
    text: lunarPreviewText,
    pointerEvents: 'none',
    style: {fontSize: 13, color: parsedISO ? '#93C5FD' : '#FCA5A5'},
  });

  // Priority selector (3 PRD levels)
  const priorityRow = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 5},
    children: [
      {p: EventPriority.IMPORTANT, tone: 'danger' as const},
      {p: EventPriority.NORMAL, tone: 'warning' as const},
      {p: EventPriority.OPTIONAL, tone: 'primary' as const},
    ].map(({p, tone}) =>
      createActionButton({
        label: PRIORITY_META[p].label,
        compact: true,
        grow: true,
        tone: draft.priority === p ? tone : 'neutral',
        onClick: () => {
          draft.priority = p;
          onRerender();
        },
      }),
    ),
  });

  // Repeat annually & Lunar toggle
  const repeatRow = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 6},
    children: [
      createActionButton({
        label: draft.repeatYearly ? 'Lặp hằng năm: BẬT' : 'Lặp hằng năm: TẮT',
        icon: 'repeat',
        compact: true,
        grow: true,
        active: draft.repeatYearly,
        onClick: () => {
          draft.repeatYearly = !draft.repeatYearly;
          onRerender();
        },
      }),
      createActionButton({
        label: draft.repeatByLunar ? 'Theo Âm lịch' : 'Theo Dương lịch',
        compact: true,
        grow: true,
        active: draft.repeatByLunar,
        onClick: () => {
          draft.repeatByLunar = !draft.repeatByLunar;
          onRerender();
        },
      }),
    ],
  });

  // Expected amount & related person & location
  const personField = createLabeledInput({
    label: 'Người liên quan',
    ariaLabel: 'Người liên quan',
    value: draft.relatedPerson,
    placeholder: 'VD: Anh Hùng, Ông nội...',
    onInput: (val) => {
      draft.relatedPerson = val;
    },
  });

  const locationField = createLabeledInput({
    label: 'Địa điểm & Giờ',
    ariaLabel: 'Địa điểm tổ chức',
    value: draft.location,
    placeholder: 'VD: Nhà hàng Sen Vàng, Nhà từ đường...',
    onInput: (val) => {
      draft.location = val;
    },
  });

  const moneyField = createLabeledInput({
    label: 'Tiền đám dự kiến (VNĐ)',
    ariaLabel: 'Tiền đám dự kiến',
    value: draft.expectedAmountText,
    placeholder: 'VD: 1000000 hoặc 2tr',
    onInput: (val) => {
      draft.expectedAmountText = val;
    },
  });

  // Reminder milestone multi-select
  const remRow = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 5},
    children: REMINDER_OPTIONS.map((opt) => {
      const selected = draft.reminders.includes(opt.offset);
      return createActionButton({
        label: opt.short,
        compact: true,
        grow: true,
        active: selected,
        onClick: () => {
          draft.reminders = selected
            ? draft.reminders.filter((r) => r !== opt.offset)
            : [...draft.reminders, opt.offset];
          onRerender();
        },
      });
    }),
  });

  const noteField = createLabeledInput({
    label: 'Ghi chú',
    ariaLabel: 'Ghi chú sự kiện',
    value: draft.note,
    placeholder: 'Thông tin chuẩn bị...',
    onInput: (val) => {
      draft.note = val;
    },
  });

  scroll.add(
    titleField,
    typeLabel,
    typeRow1,
    typeRow2,
    dateField,
    quickDateRow,
    lunarPreview,
    new xb.UIText({
      text: 'Mức độ quan trọng',
      pointerEvents: 'none',
      style: {fontSize: 13, fontWeight: 'bold', color: COLORS.textSecondary},
    }),
    priorityRow,
    repeatRow,
    personField,
    locationField,
    moneyField,
    new xb.UIText({
      text: 'Mốc nhắc nhở (chọn nhiều)',
      pointerEvents: 'none',
      style: {fontSize: 13, fontWeight: 'bold', color: COLORS.textSecondary},
    }),
    remRow,
    noteField,
  );

  const errorText = new xb.UIText({
    text: draft.formError,
    visible: Boolean(draft.formError),
    pointerEvents: 'none',
    style: {fontSize: 13, color: '#FCA5A5'},
  });

  const saveBtn = createActionButton({
    label: isEdit ? 'Lưu thay đổi' : 'Lưu sự kiện nhanh',
    icon: 'check_circle',
    tone: 'primary',
    onClick: () => {
      if (!draft.title.trim()) {
        draft.formError = 'Vui lòng nhập tên sự kiện.';
        audioFeedback.playWarning();
        onRerender();
        return;
      }
      const iso = parseVietnameseDateInput(draft.dateText);
      if (!iso) {
        draft.formError = 'Ngày chưa đúng định dạng DD/MM/YYYY (VD: 25/11/2026).';
        audioFeedback.playWarning();
        onRerender();
        return;
      }
      draft.formError = '';
      const payload: EventDraftInput = {
        title: draft.title.trim(),
        eventType: draft.eventType,
        relatedPerson: draft.relatedPerson,
        eventDate: iso,
        eventTime: draft.eventTime,
        location: draft.location,
        priority: draft.priority,
        note: draft.note,
        expectedAmount: parseVNDInput(draft.expectedAmountText),
        paymentSource: draft.paymentSource,
        repeatYearly: draft.repeatYearly,
        repeatByLunar: draft.repeatByLunar,
        reminders: draft.reminders,
      };
      audioFeedback.playSuccess();
      if (isEdit && draft.editingEventId) {
        store.updateEvent(draft.editingEventId, payload);
      } else {
        store.addEvent(payload);
      }
    },
  });

  container.add(header, scroll, errorText, saveBtn);
}

function renderFundForm(
  container: xb.UIPanel,
  store: FamilyStore,
  draft: RightPanelDraftState,
  onRerender: () => void,
) {
  const summary = store.getFinancialSummary();
  const amountVal = parseVNDInput(draft.fundAmountText);
  const isOverdraft =
    draft.fundType === FundTransactionType.EXPENSE && amountVal > summary.fundBalance;

  const header = new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    children: [
      new xb.UIText({
        text: 'Giao dịch Quỹ chung',
        pointerEvents: 'none',
        style: {fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary},
      }),
      createActionButton({
        label: 'Đóng',
        icon: 'close',
        compact: true,
        onClick: () => store.selectEvent(store.getState().selectedEventId),
      }),
    ],
  });

  const balanceBox = new xb.UIPanel({
    pointerEvents: 'none',
    style: {
      width: '100%',
      padding: 12,
      borderRadius: 12,
      backgroundColor: COLORS.surfacePanel,
      flexDirection: 'column',
      gap: 3,
    },
    children: [
      new xb.UIText({
        text: 'Số dư Quỹ chung hiện tại',
        pointerEvents: 'none',
        style: {fontSize: 13, color: COLORS.textMuted},
      }),
      new xb.UIText({
        text: formatVND(summary.fundBalance),
        pointerEvents: 'none',
        style: {fontSize: 22, fontWeight: 'bold', color: '#4ADE80'},
      }),
    ],
  });

  const typeRow = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 8},
    children: [
      createActionButton({
        label: '+ Đóng góp quỹ',
        compact: true,
        grow: true,
        tone: draft.fundType === FundTransactionType.CONTRIBUTION ? 'success' : 'neutral',
        onClick: () => {
          draft.fundType = FundTransactionType.CONTRIBUTION;
          onRerender();
        },
      }),
      createActionButton({
        label: '- Chi từ quỹ',
        compact: true,
        grow: true,
        tone: draft.fundType === FundTransactionType.EXPENSE ? 'danger' : 'neutral',
        onClick: () => {
          draft.fundType = FundTransactionType.EXPENSE;
          onRerender();
        },
      }),
    ],
  });

  const quickAmtRow = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 6},
    children: [500_000, 1_000_000, 2_000_000, 5_000_000].map((amt) =>
      createActionButton({
        label: amt >= 1_000_000 ? `${amt / 1_000_000}tr` : `${amt / 1000}k`,
        compact: true,
        grow: true,
        active: amountVal === amt,
        onClick: () => {
          draft.fundAmountText = String(amt);
          onRerender();
        },
      }),
    ),
  });

  const amountInput = createLabeledInput({
    label: 'Số tiền giao dịch (VNĐ) *',
    ariaLabel: 'Số tiền giao dịch quỹ chung',
    value: draft.fundAmountText,
    placeholder: 'VD: 2000000',
    onInput: (val) => {
      draft.fundAmountText = val;
    },
  });

  const actorInput = createLabeledInput({
    label: 'Thành viên thực hiện',
    ariaLabel: 'Tên thành viên',
    value: draft.fundActor,
    placeholder: 'VD: Nguyễn Văn Minh, Anh Nam...',
    onInput: (val) => {
      draft.fundActor = val;
    },
  });

  const noteInput = createLabeledInput({
    label: 'Nội dung thu / chi',
    ariaLabel: 'Ghi chú giao dịch quỹ',
    value: draft.fundNote,
    placeholder: 'VD: Đóng góp quý 4, Chi hoa quả ngày giỗ...',
    onInput: (val) => {
      draft.fundNote = val;
    },
  });

  const warnText = new xb.UIText({
    text: isOverdraft
      ? `Cảnh báo: Số tiền chi (${formatVND(amountVal)}) vượt số dư quỹ (${formatVND(summary.fundBalance)})!`
      : draft.fundError,
    visible: isOverdraft || Boolean(draft.fundError),
    pointerEvents: 'none',
    style: {fontSize: 13, color: '#FCA5A5', lineHeight: 1.35},
  });

  const submitBtn = createActionButton({
    label:
      draft.fundType === FundTransactionType.EXPENSE
        ? 'Xác nhận rút quỹ'
        : 'Xác nhận đóng góp vào quỹ',
    icon: 'savings',
    tone: draft.fundType === FundTransactionType.EXPENSE ? 'danger' : 'success',
    onClick: () => {
      const amt = parseVNDInput(draft.fundAmountText);
      if (amt <= 0) {
        draft.fundError = 'Vui lòng nhập số tiền lớn hơn 0.';
        audioFeedback.playWarning();
        onRerender();
        return;
      }
      draft.fundError = '';
      const res = store.addFundTransaction({
        type: draft.fundType,
        amount: amt,
        actorName: draft.fundActor,
        transactionDate: getTodayISO(),
        note: draft.fundNote,
      });
      if (res.overdraftWarning) audioFeedback.playWarning();
      else audioFeedback.playSuccess();
    },
  });

  const scroll = new xb.UIScrollView({
    ariaLabel: 'Biểu mẫu giao dịch quỹ chung',
    style: {
      width: '100%',
      flexGrow: 1,
      flexBasis: 0,
      minHeight: 180,
      flexDirection: 'column',
      gap: 10,
    },
    children: [balanceBox, typeRow, quickAmtRow, amountInput, actorInput, noteInput],
  });

  container.add(header, scroll, warnText, submitBtn);
}
