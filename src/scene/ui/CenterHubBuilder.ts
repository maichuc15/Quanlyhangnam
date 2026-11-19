import * as xb from 'xrblocks';

import {
  ATTENDANCE_META,
  COLORS,
  EVENT_TYPE_META,
  MONTH_NAMES_VI,
  PRIORITY_META,
  REMINDER_OPTIONS,
  ROLE_LABELS,
  URGENCY_META,
} from '../../constants';
import {FamilyStore} from '../../store/familyStore';
import {
  AttendanceStatus,
  EventType,
  FamilyEvent,
  FundTransactionType,
  MainTab,
  PaymentSource,
} from '../../types';
import {audioFeedback} from '../../utils/audioFeedback';
import {
  formatDateVN,
  formatDaysUntilLabel,
  formatLunarShort,
  formatShortVND,
  formatVND,
  getDaysDifference,
  getTimeUrgency,
} from '../../utils/lunarCalendar';
import {
  clearUIContainer,
  createActionButton,
  createDivider,
  createMetricTile,
} from './uiHelpers';

export interface CenterHubCallbacks {
  onQuickAdd: () => void;
  onOpenFundForm: (type: FundTransactionType) => void;
  onFocusMonthIn3D: (month: number) => void;
}

export function renderCenterHubCard(
  container: xb.UIPanel,
  store: FamilyStore,
  callbacks: CenterHubCallbacks,
) {
  clearUIContainer(container);
  const state = store.getState();
  const family = store.getActiveFamily();

  // Top Header Bar
  const header = new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    children: [
      new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          flexGrow: 1,
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 2,
        },
        children: [
          new xb.UIText({
            text: family.name,
            pointerEvents: 'none',
            style: {fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary},
          }),
          new xb.UIText({
            text: `Năm ${state.selectedYear} · Lịch ngày đặc biệt & tài chính gia đình`,
            pointerEvents: 'none',
            style: {fontSize: 13, color: COLORS.textMuted},
          }),
        ],
      }),
      createActionButton({
        label: '+ Thêm nhanh',
        icon: 'add',
        tone: 'primary',
        onClick: callbacks.onQuickAdd,
      }),
    ],
  });

  // Tab Body Container
  const body = new xb.UIPanel({
    style: {
      width: '100%',
      flexGrow: 1,
      flexBasis: 0,
      minHeight: 260,
      flexDirection: 'column',
      gap: 10,
    },
  });

  if (state.activeTab === MainTab.DASHBOARD) {
    buildDashboardTab(body, store);
  } else if (state.activeTab === MainTab.CALENDAR) {
    buildCalendarTab(body, store, callbacks);
  } else if (state.activeTab === MainTab.FINANCE) {
    buildFinanceTab(body, store, callbacks);
  } else {
    buildProfileTab(body, store);
  }

  // Bottom 4-Tab Navigation Bar (PRD §7)
  const navBar = new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      gap: 8,
      paddingTop: 6,
    },
    children: [
      createActionButton({
        label: 'Trang chủ',
        icon: 'home',
        grow: true,
        active: state.activeTab === MainTab.DASHBOARD,
        onClick: () => store.setTab(MainTab.DASHBOARD),
      }),
      createActionButton({
        label: 'Lịch',
        icon: 'calendar_month',
        grow: true,
        active: state.activeTab === MainTab.CALENDAR,
        onClick: () => store.setTab(MainTab.CALENDAR),
      }),
      createActionButton({
        label: 'Tài chính',
        icon: 'account_balance_wallet',
        grow: true,
        active: state.activeTab === MainTab.FINANCE,
        onClick: () => store.setTab(MainTab.FINANCE),
      }),
      createActionButton({
        label: 'Cá nhân',
        icon: 'person',
        grow: true,
        active: state.activeTab === MainTab.PROFILE,
        onClick: () => store.setTab(MainTab.PROFILE),
      }),
    ],
  });

  container.add(header, createDivider(), body, createDivider(), navBar);
}

function buildDashboardTab(body: xb.UIPanel, store: FamilyStore) {
  const state = store.getState();
  const allEvents = store.getFamilyEvents();
  const upcoming30 = allEvents.filter((e) => {
    const d = getDaysDifference(e.eventDate);
    return d >= 0 && d <= 30;
  });
  const summary = store.getFinancialSummary();
  const attCounts = store.getAttendanceCounts();

  // Summary KPI Row (PRD §5.1)
  const kpiRow = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 8},
    children: [
      createMetricTile(
        'Sự kiện sắp tới',
        `${upcoming30.length} / ${allEvents.length}`,
        '#93C5FD',
        'Trong 30 ngày tới',
      ),
      createMetricTile(
        'Tiền đám đã chi',
        formatShortVND(summary.totalActualAll),
        '#FCD34D',
        `Còn ngân sách: ${formatShortVND(summary.remainingBudget)}`,
      ),
      createMetricTile(
        'Quỹ chung gia đình',
        formatShortVND(summary.fundBalance),
        '#4ADE80',
        `Đã đi ${attCounts[AttendanceStatus.ATTENDED]} · Sẽ đi ${attCounts[AttendanceStatus.WILL_ATTEND]}`,
      ),
    ],
  });

  // Range Filter Controls + Attendance inline summary
  const filterRow = new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 6,
    },
    children: [
      createActionButton({
        label: '30 ngày tới',
        compact: true,
        grow: true,
        active: state.dashboardRange === '30d',
        onClick: () => store.setDashboardRange('30d'),
      }),
      createActionButton({
        label: `Toàn năm ${state.selectedYear}`,
        compact: true,
        grow: true,
        active: state.dashboardRange === 'year',
        onClick: () => store.setDashboardRange('year'),
      }),
      createActionButton({
        label: `Cần xác nhận (${attCounts[AttendanceStatus.UNDECIDED]})`,
        compact: true,
        grow: true,
        tone:
          state.dashboardRange === 'unconfirmed'
            ? 'warning'
            : attCounts[AttendanceStatus.UNDECIDED] > 0
              ? 'neutral'
              : 'neutral',
        onClick: () => store.setDashboardRange('unconfirmed'),
      }),
    ],
  });

  const listEvents = store.getDashboardEvents();
  const listView = new xb.UIScrollView({
    ariaLabel: 'Danh sách sự kiện gia đình',
    style: {
      width: '100%',
      flexGrow: 1,
      flexBasis: 0,
      minHeight: 160,
      flexDirection: 'column',
      gap: 8,
    },
  });

  if (listEvents.length === 0) {
    listView.add(
      new xb.UIText({
        text: 'Không có sự kiện nào trong mục lọc này. Nhấn "+ Thêm nhanh" để tạo mới.',
        pointerEvents: 'none',
        style: {fontSize: 15, color: COLORS.textMuted, padding: 12},
      }),
    );
  } else {
    for (const ev of listEvents) {
      listView.add(createEventListRow(ev, state.selectedEventId === ev.id, store));
    }
  }

  body.add(kpiRow, filterRow, listView);
}

function createEventListRow(
  ev: FamilyEvent,
  isSelected: boolean,
  store: FamilyStore,
): xb.UIButton {
  const daysUntil = getDaysDifference(ev.eventDate);
  const urgency = getTimeUrgency(daysUntil);
  const urgencyMeta = URGENCY_META[urgency];
  const priorityMeta = PRIORITY_META[ev.priority];
  const typeMeta = EVENT_TYPE_META[ev.eventType];
  const attMeta = ATTENDANCE_META[ev.attendance];
  const isOverdueUnconfirmed = daysUntil < 0 && ev.attendance === AttendanceStatus.UNDECIDED;

  const amountLabel =
    ev.attendance === AttendanceStatus.NOT_ATTENDING
      ? 'Không tham dự'
      : ev.expenseConfirmed
        ? `Đã chi ${formatShortVND(ev.actualAmount)}`
        : ev.expectedAmount > 0
          ? `Dự kiến ${formatShortVND(ev.expectedAmount)}`
          : 'Chưa dự kiến tiền';

  const borderColor = isSelected
    ? '#60A5FA'
    : isOverdueUnconfirmed
      ? '#F59E0B'
      : COLORS.borderSubtle;

  return new xb.UIButton({
    ariaLabel: `${ev.title}, ngày ${formatDateVN(ev.eventDate)}, ${priorityMeta.label}`,
    onClick: () => {
      audioFeedback.playSelect();
      store.selectEvent(ev.id);
    },
    style: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      padding: 11,
      borderRadius: 12,
      backgroundColor: isSelected
        ? 'rgba(37, 99, 235, 0.28)'
        : isOverdueUnconfirmed
          ? 'rgba(180, 83, 9, 0.20)'
          : COLORS.surfacePanel,
      borderWidth: isSelected ? 2 : 1,
      borderColor,
      ':hover': {backgroundColor: 'rgba(51, 65, 85, 0.85)'},
    },
    children: [
      new xb.UIIcon({
        icon: typeMeta.icon,
        pointerEvents: 'none',
        style: {width: 26, height: 26, color: typeMeta.colorCss},
      }),
      new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          flexGrow: 1,
          flexBasis: 0,
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 3,
        },
        children: [
          new xb.UIText({
            text: ev.title,
            pointerEvents: 'none',
            style: {fontSize: 16, fontWeight: 'bold', color: '#FFFFFF'},
          }),
          new xb.UIText({
            text: `${formatDateVN(ev.eventDate)} (${formatLunarShort(ev.eventDate)}) · ${typeMeta.label} · ${amountLabel}`,
            pointerEvents: 'none',
            style: {fontSize: 13, color: COLORS.textSecondary},
          }),
          new xb.UIText({
            text: `Ưu tiên: ${priorityMeta.label}  ·  ${attMeta.label}${isOverdueUnconfirmed ? ' (Quá hạn chưa xác nhận)' : ''}`,
            pointerEvents: 'none',
            style: {fontSize: 12, color: isOverdueUnconfirmed ? '#FCD34D' : priorityMeta.colorCss},
          }),
        ],
      }),
      new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 5,
          paddingBottom: 5,
          borderRadius: 8,
          backgroundColor: urgencyMeta.bgCss,
        },
        children: [
          new xb.UIText({
            text: formatDaysUntilLabel(daysUntil),
            pointerEvents: 'none',
            style: {fontSize: 13, fontWeight: 'bold', color: urgencyMeta.colorCss},
          }),
        ],
      }),
    ],
  });
}

function buildCalendarTab(
  body: xb.UIPanel,
  store: FamilyStore,
  callbacks: CenterHubCallbacks,
) {
  const state = store.getState();

  // Mode toggle + Year / Month selector
  const topControls = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6},
    children: [
      createActionButton({
        label: 'Theo tháng',
        compact: true,
        active: state.calendarMode === 'month',
        onClick: () => store.setCalendarMode('month'),
      }),
      createActionButton({
        label: 'Tổng quan năm',
        compact: true,
        active: state.calendarMode === 'year',
        onClick: () => store.setCalendarMode('year'),
      }),
      createActionButton({
        label: '<',
        compact: true,
        onClick: () => {
          if (state.calendarMode === 'month') {
            const prev = state.selectedMonth === 1 ? 12 : state.selectedMonth - 1;
            store.setSelectedMonth(prev);
            callbacks.onFocusMonthIn3D(prev);
          } else {
            store.setSelectedYear(state.selectedYear - 1);
          }
        },
      }),
      new xb.UIText({
        text:
          state.calendarMode === 'month'
            ? `${MONTH_NAMES_VI[state.selectedMonth - 1]} / ${state.selectedYear}`
            : `Năm ${state.selectedYear}`,
        pointerEvents: 'none',
        style: {
          flexGrow: 1,
          fontSize: 16,
          fontWeight: 'bold',
          textAlign: 'center',
          color: '#FFFFFF',
        },
      }),
      createActionButton({
        label: '>',
        compact: true,
        onClick: () => {
          if (state.calendarMode === 'month') {
            const next = state.selectedMonth === 12 ? 1 : state.selectedMonth + 1;
            store.setSelectedMonth(next);
            callbacks.onFocusMonthIn3D(next);
          } else {
            store.setSelectedYear(state.selectedYear + 1);
          }
        },
      }),
    ],
  });

  // Search & Type Filter row
  const searchInput = new xb.UITextInput({
    ariaLabel: 'Tìm kiếm sự kiện theo tên hoặc địa điểm',
    value: state.searchQuery,
    placeholder: 'Tìm theo tên, người liên quan, địa điểm...',
    onInput: (val) => store.setSearchQuery(val),
    style: {
      flexGrow: 1,
      height: 36,
      paddingLeft: 10,
      paddingRight: 10,
      fontSize: 14,
      borderRadius: 8,
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      color: '#FFFFFF',
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
    },
  });

  const filterRow = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 6, alignItems: 'center'},
    children: [
      searchInput,
      createActionButton({
        label: 'Tất cả',
        compact: true,
        active: state.filterEventType === 'all',
        onClick: () => store.setFilterEventType('all'),
      }),
      createActionButton({
        label: 'Đám cưới',
        compact: true,
        active: state.filterEventType === EventType.WEDDING,
        onClick: () => store.setFilterEventType(EventType.WEDDING),
      }),
      createActionButton({
        label: 'Đám giỗ',
        compact: true,
        active: state.filterEventType === EventType.DEATH_ANNIVERSARY,
        onClick: () => store.setFilterEventType(EventType.DEATH_ANNIVERSARY),
      }),
    ],
  });

  const scroll = new xb.UIScrollView({
    ariaLabel: 'Lịch sự kiện gia đình',
    style: {
      width: '100%',
      flexGrow: 1,
      flexBasis: 0,
      minHeight: 170,
      flexDirection: 'column',
      gap: 8,
    },
  });

  if (state.calendarMode === 'year') {
    // Annual Overview: 12 Months summary cards (3 rows of 4 months)
    const allInYear = store
      .getFamilyEvents()
      .filter((e) => Number(e.eventDate.slice(0, 4)) === state.selectedYear);

    for (let row = 0; row < 3; row++) {
      const monthRow = new xb.UIPanel({
        style: {width: '100%', flexDirection: 'row', gap: 8},
      });
      for (let col = 0; col < 4; col++) {
        const m = row * 4 + col + 1;
        const inMonth = allInYear.filter((e) => Number(e.eventDate.slice(5, 7)) === m);
        const expectedSum = inMonth.reduce(
          (acc, e) => acc + (e.attendance === AttendanceStatus.NOT_ATTENDING ? 0 : e.expectedAmount),
          0,
        );
        const isCurrentSelected = m === state.selectedMonth;
        monthRow.add(
          new xb.UIButton({
            ariaLabel: `${MONTH_NAMES_VI[m - 1]}, ${inMonth.length} sự kiện`,
            onClick: () => {
              audioFeedback.playSelect();
              store.setSelectedMonth(m);
              store.setCalendarMode('month');
              callbacks.onFocusMonthIn3D(m);
            },
            style: {
              flexGrow: 1,
              flexBasis: 0,
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 3,
              padding: 10,
              borderRadius: 10,
              backgroundColor:
                inMonth.length > 0 ? 'rgba(37, 99, 235, 0.24)' : COLORS.surfacePanel,
              borderWidth: isCurrentSelected ? 2 : 1,
              borderColor: isCurrentSelected ? '#60A5FA' : COLORS.borderSubtle,
              ':hover': {backgroundColor: COLORS.surfaceElevated},
            },
            children: [
              new xb.UIText({
                text: MONTH_NAMES_VI[m - 1],
                pointerEvents: 'none',
                style: {fontSize: 14, fontWeight: 'bold', color: '#FFFFFF'},
              }),
              new xb.UIText({
                text: inMonth.length > 0 ? `${inMonth.length} sự kiện` : 'Trống',
                pointerEvents: 'none',
                style: {
                  fontSize: 13,
                  color: inMonth.length > 0 ? '#93C5FD' : COLORS.textMuted,
                },
              }),
              new xb.UIText({
                text: expectedSum > 0 ? formatShortVND(expectedSum) : '0đ',
                pointerEvents: 'none',
                style: {fontSize: 12, color: COLORS.textSecondary},
              }),
            ],
          }),
        );
      }
      scroll.add(monthRow);
    }
  } else {
    const filtered = store.getFilteredCalendarEvents();
    if (filtered.length === 0) {
      scroll.add(
        new xb.UIText({
          text: `Không có sự kiện nào trong ${MONTH_NAMES_VI[state.selectedMonth - 1]}/${state.selectedYear}. Chuyển sang "Tổng quan năm" để xem cả 12 tháng.`,
          pointerEvents: 'none',
          style: {fontSize: 15, color: COLORS.textMuted, padding: 12, lineHeight: 1.4},
        }),
      );
    } else {
      for (const ev of filtered) {
        scroll.add(createEventListRow(ev, state.selectedEventId === ev.id, store));
      }
    }
  }

  body.add(topControls, filterRow, scroll);
}

function buildFinanceTab(
  body: xb.UIPanel,
  store: FamilyStore,
  callbacks: CenterHubCallbacks,
) {
  const state = store.getState();
  const summary = store.getFinancialSummary();

  const subTabs = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 8},
    children: [
      createActionButton({
        label: 'Tiền đám & Ngân sách',
        icon: 'payments',
        compact: true,
        grow: true,
        active: state.financeSubTab === 'expenses',
        onClick: () => store.setFinanceSubTab('expenses'),
      }),
      createActionButton({
        label: `Quỹ chung (${formatShortVND(summary.fundBalance)})`,
        icon: 'savings',
        compact: true,
        grow: true,
        active: state.financeSubTab === 'fund',
        onClick: () => store.setFinanceSubTab('fund'),
      }),
    ],
  });

  if (state.financeSubTab === 'expenses') {
    // PRD §5.4 5 key metrics clearly distinguished
    const row1 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 8},
      children: [
        createMetricTile(
          'Ngân sách đầu năm',
          formatVND(summary.annualBudget),
          '#FFFFFF',
          'Hạn mức năm ' + state.selectedYear,
        ),
        createMetricTile(
          'Tổng tiền dự kiến',
          formatVND(summary.totalExpected),
          '#93C5FD',
          'Các sự kiện dự định đi',
        ),
      ],
    });

    const row2 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 8},
      children: [
        createMetricTile(
          `Đã chi (${summary.confirmedExpenseCount} sự kiện)`,
          formatVND(summary.totalActualAll),
          '#FCD34D',
          `Cá nhân ${formatShortVND(summary.totalActualPersonal)} · Quỹ ${formatShortVND(summary.totalActualFromFund)}`,
        ),
        createMetricTile(
          'Ngân sách còn lại',
          formatVND(summary.remainingBudget),
          summary.remainingBudget < 0 ? '#FCA5A5' : '#4ADE80',
          'Ngân sách − Đã chi thực tế',
        ),
      ],
    });

    const budgetAdjustRow = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6},
      children: [
        new xb.UIText({
          text: 'Điều chỉnh ngân sách năm:',
          pointerEvents: 'none',
          style: {flexGrow: 1, fontSize: 13, color: COLORS.textSecondary},
        }),
        createActionButton({
          label: '- 2tr',
          compact: true,
          onClick: () => store.updateAnnualBudget(summary.annualBudget - 2_000_000),
        }),
        createActionButton({
          label: '+ 2tr',
          compact: true,
          onClick: () => store.updateAnnualBudget(summary.annualBudget + 2_000_000),
        }),
      ],
    });

    const scroll = new xb.UIScrollView({
      ariaLabel: 'Danh sách chi tiêu tiền đám',
      style: {
        width: '100%',
        flexGrow: 1,
        flexBasis: 0,
        minHeight: 110,
        flexDirection: 'column',
        gap: 6,
      },
    });

    const events = store.getFamilyEvents();
    for (const ev of events) {
      if (ev.attendance === AttendanceStatus.NOT_ATTENDING) continue;
      const statusText = ev.expenseConfirmed
        ? `Đã chi: ${formatVND(ev.actualAmount)} (${ev.paymentSource === PaymentSource.FAMILY_FUND ? 'Quỹ chung' : 'Cá nhân'})`
        : `Dự kiến: ${formatVND(ev.expectedAmount)} · Chưa xác nhận chi`;
      scroll.add(
        new xb.UIButton({
          ariaLabel: `Chi phí sự kiện ${ev.title}`,
          onClick: () => {
            audioFeedback.playSelect();
            store.selectEvent(ev.id);
          },
          style: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 9,
            borderRadius: 10,
            backgroundColor: COLORS.surfacePanel,
            borderWidth: 1,
            borderColor: COLORS.borderSubtle,
            ':hover': {backgroundColor: COLORS.surfaceElevated},
          },
          children: [
            new xb.UIPanel({
              pointerEvents: 'none',
              style: {flexDirection: 'column', alignItems: 'flex-start', gap: 2},
              children: [
                new xb.UIText({
                  text: `${ev.title} (${formatDateVN(ev.eventDate)})`,
                  pointerEvents: 'none',
                  style: {fontSize: 14, fontWeight: 'bold', color: '#FFFFFF'},
                }),
                new xb.UIText({
                  text: statusText,
                  pointerEvents: 'none',
                  style: {
                    fontSize: 12,
                    color: ev.expenseConfirmed ? '#86EFAC' : '#FDE68A',
                  },
                }),
              ],
            }),
          ],
        }),
      );
    }

    body.add(subTabs, row1, row2, budgetAdjustRow, scroll);
  } else {
    // PRD §5.5 Family Fund Management
    const fundMetrics = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 8},
      children: [
        createMetricTile('Số dư Quỹ hiện tại', formatVND(summary.fundBalance), '#4ADE80', 'Tổng thu − Tổng chi'),
        createMetricTile('Tổng thu / đóng góp', formatVND(summary.fundTotalIn), '#93C5FD'),
        createMetricTile('Tổng chi từ quỹ', formatVND(summary.fundTotalOut), '#FCA5A5'),
      ],
    });

    const fundActions = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 8},
      children: [
        createActionButton({
          label: '+ Đóng góp vào quỹ',
          icon: 'arrow_upward',
          tone: 'success',
          grow: true,
          compact: true,
          onClick: () => callbacks.onOpenFundForm(FundTransactionType.CONTRIBUTION),
        }),
        createActionButton({
          label: '- Rút / Chi từ quỹ',
          icon: 'arrow_downward',
          tone: 'danger',
          grow: true,
          compact: true,
          onClick: () => callbacks.onOpenFundForm(FundTransactionType.EXPENSE),
        }),
      ],
    });

    const txns = store.getFamilyFundTransactions();
    const scroll = new xb.UIScrollView({
      ariaLabel: 'Lịch sử thu chi quỹ gia đình',
      style: {
        width: '100%',
        flexGrow: 1,
        flexBasis: 0,
        minHeight: 140,
        flexDirection: 'column',
        gap: 6,
      },
    });

    for (const t of txns) {
      const isOut = t.type === FundTransactionType.EXPENSE;
      scroll.add(
        new xb.UIPanel({
          pointerEvents: 'none',
          style: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 10,
            borderRadius: 10,
            backgroundColor: COLORS.surfacePanel,
            borderWidth: 1,
            borderColor: COLORS.borderSubtle,
          },
          children: [
            new xb.UIPanel({
              pointerEvents: 'none',
              style: {flexDirection: 'column', alignItems: 'flex-start', gap: 2, flexGrow: 1},
              children: [
                new xb.UIText({
                  text: t.note,
                  pointerEvents: 'none',
                  style: {fontSize: 14, fontWeight: 'bold', color: '#FFFFFF'},
                }),
                new xb.UIText({
                  text: `${formatDateVN(t.transactionDate)} · ${t.actorName}${t.eventId ? ' · Liên kết sự kiện' : ''}`,
                  pointerEvents: 'none',
                  style: {fontSize: 12, color: COLORS.textMuted},
                }),
              ],
            }),
            new xb.UIText({
              text: `${isOut ? '-' : '+'}${formatVND(t.amount)}`,
              pointerEvents: 'none',
              style: {
                fontSize: 15,
                fontWeight: 'bold',
                color: isOut ? '#FCA5A5' : '#4ADE80',
              },
            }),
          ],
        }),
      );
    }

    body.add(subTabs, fundMetrics, fundActions, scroll);
  }
}

function buildProfileTab(body: xb.UIPanel, store: FamilyStore) {
  const state = store.getState();
  const family = store.getActiveFamily();

  const scroll = new xb.UIScrollView({
    ariaLabel: 'Cài đặt gia đình, thành viên và sao lưu',
    style: {
      width: '100%',
      flexGrow: 1,
      flexBasis: 0,
      minHeight: 220,
      flexDirection: 'column',
      gap: 10,
    },
  });

  // Multi-Family / Clan Switcher (PRD §14.3)
  scroll.add(
    new xb.UIText({
      text: 'Chuyển đổi Gia đình / Dòng họ (dữ liệu tách biệt)',
      pointerEvents: 'none',
      style: {fontSize: 15, fontWeight: 'bold', color: COLORS.textPrimary},
    }),
  );

  const famRow = new xb.UIPanel({
    style: {width: '100%', flexDirection: 'row', gap: 6},
    children: state.families.map((f) =>
      createActionButton({
        label:
          f.id === 'fam-noi'
            ? 'Bên Nội'
            : f.id === 'fam-ngoai'
              ? 'Bên Ngoại'
              : 'Gia tộc',
        compact: true,
        grow: true,
        active: f.id === state.activeFamilyId,
        onClick: () => store.switchFamily(f.id),
      }),
    ),
  });
  scroll.add(famRow);

  // Members & Roles (PRD §3.2)
  scroll.add(
    new xb.UIText({
      text: `Thành viên (${family.members.length}) & Phân quyền`,
      pointerEvents: 'none',
      style: {fontSize: 15, fontWeight: 'bold', color: COLORS.textPrimary},
    }),
  );

  for (const m of family.members) {
    scroll.add(
      new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 9,
          borderRadius: 10,
          backgroundColor: COLORS.surfacePanel,
        },
        children: [
          new xb.UIText({
            text: `${m.fullName} · ${m.relation}`,
            pointerEvents: 'none',
            style: {fontSize: 14, color: '#FFFFFF'},
          }),
          new xb.UIText({
            text: ROLE_LABELS[m.role],
            pointerEvents: 'none',
            style: {fontSize: 13, color: '#93C5FD'},
          }),
        ],
      }),
    );
  }

  // Reminder milestone settings (PRD §5.7)
  scroll.add(
    createDivider(),
    new xb.UIText({
      text: 'Mốc nhắc nhở mặc định (bật / tắt từng mốc)',
      pointerEvents: 'none',
      style: {fontSize: 15, fontWeight: 'bold', color: COLORS.textPrimary},
    }),
    new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 6},
      children: REMINDER_OPTIONS.map((opt) => {
        const active = state.reminderSettings.defaultOffsets.includes(opt.offset);
        return createActionButton({
          label: opt.short,
          compact: true,
          grow: true,
          active,
          onClick: () => store.toggleReminderOffset(opt.offset),
        });
      }),
    }),
    createActionButton({
      label: state.reminderSettings.browserNotifications
        ? 'Thông báo trình duyệt: ĐÃ BẬT'
        : 'Bật thông báo đẩy trình duyệt',
      icon: 'notifications',
      compact: true,
      tone: state.reminderSettings.browserNotifications ? 'success' : 'primary',
      onClick: () => void store.requestBrowserNotifications(),
    }),
    createDivider(),
    new xb.UIText({
      text: 'Sao lưu & Khôi phục dữ liệu (lưu cục bộ trên thiết bị)',
      pointerEvents: 'none',
      style: {fontSize: 15, fontWeight: 'bold', color: COLORS.textPrimary},
    }),
    new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 8},
      children: [
        createActionButton({
          label: 'Xuất tệp sao lưu JSON',
          icon: 'download',
          compact: true,
          grow: true,
          onClick: () => store.exportBackupJSON(),
        }),
        createActionButton({
          label: 'Khôi phục dữ liệu mẫu',
          icon: 'refresh',
          compact: true,
          grow: true,
          tone: 'warning',
          onClick: () => store.resetDemoData(),
        }),
      ],
    }),
  );

  body.add(scroll);
}
