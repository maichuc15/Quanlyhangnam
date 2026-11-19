import * as xb from 'xrblocks';

import {COLORS, URGENCY_META} from '../../constants';
import {FamilyStore} from '../../store/familyStore';
import {audioFeedback} from '../../utils/audioFeedback';
import {
  formatDateVN,
  formatLunarShort,
  getTimeUrgency,
  getTodayISO,
} from '../../utils/lunarCalendar';
import {clearUIContainer, createActionButton, createDivider} from './uiHelpers';

export interface LeftPanelCallbacks {
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onToggleAutoRotate: () => boolean;
  onResetCards: () => void;
}

export function renderLeftRemindersCard(
  container: xb.UIPanel,
  store: FamilyStore,
  callbacks: LeftPanelCallbacks,
  isAutoRotating: boolean,
) {
  clearUIContainer(container);

  const today = getTodayISO();
  const alerts = store.getReminderAlerts();
  const reminderSettings = store.getState().reminderSettings;

  // Header
  const header = new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    children: [
      new xb.UIPanel({
        style: {flexDirection: 'row', alignItems: 'center', gap: 8},
        children: [
          new xb.UIIcon({
            icon: 'notifications',
            pointerEvents: 'none',
            style: {width: 24, height: 24, color: '#60A5FA'},
          }),
          new xb.UIText({
            text: 'Nhắc nhở thông minh',
            pointerEvents: 'none',
            style: {fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary},
          }),
        ],
      }),
      createActionButton({
        label: reminderSettings.enabled ? 'Đang bật' : 'Đang tắt',
        compact: true,
        tone: reminderSettings.enabled ? 'success' : 'neutral',
        onClick: () => store.toggleRemindersEnabled(),
      }),
    ],
  });

  // Today's Solar & Lunar Date Banner
  const todayBanner = new xb.UIPanel({
    pointerEvents: 'none',
    style: {
      width: '100%',
      flexDirection: 'column',
      gap: 2,
      padding: 10,
      borderRadius: 12,
      backgroundColor: COLORS.primarySoft,
      borderWidth: 1,
      borderColor: 'rgba(96, 165, 250, 0.35)',
    },
    children: [
      new xb.UIText({
        text: `Hôm nay: ${formatDateVN(today)}`,
        pointerEvents: 'none',
        style: {fontSize: 16, fontWeight: 'bold', color: '#FFFFFF'},
      }),
      new xb.UIText({
        text: `Âm lịch: ${formatLunarShort(today)} · Múi giờ Việt Nam`,
        pointerEvents: 'none',
        style: {fontSize: 13, color: '#DBEAFE'},
      }),
    ],
  });

  // Scrollable alerts list
  const scrollList = new xb.UIScrollView({
    ariaLabel: 'Danh sách nhắc nhở sắp tới',
    style: {
      width: '100%',
      flexGrow: 1,
      flexBasis: 0,
      minHeight: 160,
      flexDirection: 'column',
      gap: 10,
    },
  });

  if (!reminderSettings.enabled) {
    scrollList.add(
      new xb.UIText({
        text: 'Thông báo nhắc lịch đang tắt. Nhấn "Đang tắt" ở trên để bật lại.',
        pointerEvents: 'none',
        style: {fontSize: 14, color: COLORS.textMuted, lineHeight: 1.4},
      }),
    );
  } else if (alerts.length === 0) {
    scrollList.add(
      new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          width: '100%',
          padding: 12,
          borderRadius: 12,
          backgroundColor: COLORS.surfacePanel,
        },
        children: [
          new xb.UIText({
            text: 'Không có sự kiện gấp trong 7 ngày tới. Bạn hoàn toàn chủ động thời gian.',
            pointerEvents: 'none',
            style: {fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.45},
          }),
        ],
      }),
    );
  } else {
    for (const alert of alerts) {
      const urgency = getTimeUrgency(alert.daysUntil);
      const borderColor = alert.isOverdueUnconfirmed
        ? '#F59E0B'
        : alert.daysUntil <= 1
          ? '#EF4444'
          : 'rgba(148, 163, 184, 0.28)';
      const headerColor = alert.isOverdueUnconfirmed
        ? '#FCD34D'
        : alert.daysUntil <= 1
          ? '#FCA5A5'
          : URGENCY_META[urgency].colorCss;

      const cardBtn = new xb.UIButton({
        ariaLabel: `Mở sự kiện ${alert.event.title}`,
        onClick: () => {
          audioFeedback.playSelect();
          store.selectEvent(alert.event.id);
        },
        style: {
          width: '100%',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 4,
          padding: 10,
          borderRadius: 12,
          backgroundColor: alert.isOverdueUnconfirmed
            ? 'rgba(180, 83, 9, 0.24)'
            : COLORS.surfacePanel,
          borderWidth: 1,
          borderColor,
          ':hover': {backgroundColor: COLORS.surfaceElevated},
        },
        children: [
          new xb.UIText({
            text: alert.milestoneLabel,
            pointerEvents: 'none',
            style: {fontSize: 13, fontWeight: 'bold', color: headerColor},
          }),
          new xb.UIText({
            text: alert.headline,
            pointerEvents: 'none',
            style: {fontSize: 15, fontWeight: 'bold', color: COLORS.textPrimary},
          }),
          new xb.UIText({
            text: alert.detailLine,
            pointerEvents: 'none',
            style: {fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.35},
          }),
        ],
      });
      scrollList.add(cardBtn);
    }
  }

  // 3D Stage Controls footer
  const stageControls = new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'column',
      gap: 8,
    },
    children: [
      new xb.UIText({
        text: 'Tương tác không gian 3D',
        pointerEvents: 'none',
        style: {fontSize: 13, fontWeight: 'bold', color: COLORS.textMuted},
      }),
      new xb.UIPanel({
        style: {width: '100%', flexDirection: 'row', gap: 6},
        children: [
          createActionButton({
            label: 'Xoay trái',
            compact: true,
            grow: true,
            onClick: callbacks.onRotateLeft,
          }),
          createActionButton({
            label: isAutoRotating ? 'Dừng xoay' : 'Tự xoay',
            compact: true,
            grow: true,
            active: isAutoRotating,
            onClick: () => {
              callbacks.onToggleAutoRotate();
            },
          }),
          createActionButton({
            label: 'Xoay phải',
            compact: true,
            grow: true,
            onClick: callbacks.onRotateRight,
          }),
        ],
      }),
      createActionButton({
        label: 'Đặt lại vị trí bảng XR',
        icon: 'restart_alt',
        compact: true,
        onClick: callbacks.onResetCards,
      }),
    ],
  });

  container.add(header, todayBanner, scrollList, createDivider(), stageControls);
}
