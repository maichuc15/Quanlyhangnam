import * as THREE from 'three';
import * as xb from 'xrblocks';

import {COLORS} from '../constants';
import {FamilyStore} from '../store/familyStore';
import {FundTransactionType} from '../types';
import {SpatialCalendarStage} from './SpatialCalendarStage';
import {renderCenterHubCard} from './ui/CenterHubBuilder';
import {renderLeftRemindersCard} from './ui/LeftRemindersBuilder';
import {
  createInitialDraftState,
  renderRightInspectorCard,
  resetQuickAddDraft,
  RightPanelDraftState,
} from './ui/RightInspectorBuilder';

interface CardPose {
  position: THREE.Vector3;
  rotationY: number;
  size: {width: number; height: number};
}

const CARD_POSES: Record<'left' | 'center' | 'right', CardPose> = {
  left: {
    position: new THREE.Vector3(-0.74, 1.50, -1.16),
    rotationY: 0.30,
    size: {width: 0.48, height: 0.64},
  },
  center: {
    position: new THREE.Vector3(0, 1.50, -1.28),
    rotationY: 0,
    size: {width: 0.84, height: 0.68},
  },
  right: {
    position: new THREE.Vector3(0.76, 1.50, -1.16),
    rotationY: -0.30,
    size: {width: 0.52, height: 0.68},
  },
};

/**
 * SpatialWorkspaceScript owns the three ergonomic world-space UICard panels
 * arranged around the viewer above the 3D Spatial Calendar Stage, plus a subtle
 * view-space UIOverlay bar with the XR exit button and live guidance.
 */
export class SpatialWorkspace extends xb.Script {
  private store: FamilyStore;
  private stage: SpatialCalendarStage;
  private unsubscribe?: () => void;

  private leftCard!: xb.UICard;
  private centerCard!: xb.UICard;
  private rightCard!: xb.UICard;

  private leftBody!: xb.UIPanel;
  private centerBody!: xb.UIPanel;
  private rightBody!: xb.UIPanel;

  private overlay!: xb.UIOverlay;
  private statusText!: xb.UIText;

  private draft: RightPanelDraftState = createInitialDraftState();
  private isAutoRotating = false;
  private validationLogged = false;
  private frameCounter = 0;

  constructor(store: FamilyStore, stage: SpatialCalendarStage) {
    super();
    this.store = store;
    this.stage = stage;
    this.name = 'Không gian làm việc Lịch Gia Đình XR';
  }

  init() {
    // 1. Left Card — Smart Reminders & 3D Controls
    this.leftBody = new xb.UIPanel({
      style: {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        gap: 10,
      },
    });
    this.leftCard = new xb.UICard({
      size: {...CARD_POSES.left.size},
      manipulation: true,
      edge: true,
      style: {
        padding: 16,
        borderRadius: 20,
        backgroundColor: COLORS.surfaceDark,
        borderWidth: 1,
        borderColor: COLORS.borderSubtle,
      },
      children: [this.leftBody],
    });
    this.leftCard.name = 'Thẻ Nhắc nhở Thông minh';

    // 2. Center Card — 4-Tab Family & Clan Event Manager Hub
    this.centerBody = new xb.UIPanel({
      style: {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        gap: 10,
      },
    });
    this.centerCard = new xb.UICard({
      size: {...CARD_POSES.center.size},
      manipulation: true,
      edge: true,
      style: {
        padding: 18,
        borderRadius: 22,
        backgroundColor: COLORS.surfaceDark,
        borderWidth: 1,
        borderColor: COLORS.borderSubtle,
      },
      children: [this.centerBody],
    });
    this.centerCard.name = 'Bảng Chính Lịch Gia Đình';

    // 3. Right Card — Contextual Inspector (Detail / Quick Add / Fund Form)
    this.rightBody = new xb.UIPanel({
      style: {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        gap: 10,
      },
    });
    this.rightCard = new xb.UICard({
      size: {...CARD_POSES.right.size},
      manipulation: true,
      edge: true,
      style: {
        padding: 16,
        borderRadius: 20,
        backgroundColor: COLORS.surfaceDark,
        borderWidth: 1,
        borderColor: COLORS.borderSubtle,
      },
      children: [this.rightBody],
    });
    this.rightCard.name = 'Thẻ Chi tiết & Thêm nhanh';

    this.resetCardTransforms();
    this.add(this.leftCard, this.centerCard, this.rightCard);

    // 4. Compact View-Space Overlay (Exit XR + quiet hint)
    this.statusText = new xb.UIText({
      text: 'Chạm trực tiếp thẻ hoặc biểu tượng 3D trên bàn lịch · Kéo viền thẻ để di chuyển trong không gian XR',
      pointerEvents: 'none',
      style: {
        fontSize: 14,
        color: COLORS.textSecondary,
        textAlign: 'center',
      },
    });
    this.overlay = new xb.UIOverlay({
      style: {
        width: 700,
        position: 'absolute',
        left: '50%',
        bottom: 20,
        transform: {translateX: '-50%'},
        paddingLeft: 18,
        paddingRight: 18,
        paddingTop: 10,
        paddingBottom: 10,
        borderRadius: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.86)',
        borderWidth: 1,
        borderColor: COLORS.borderSubtle,
      },
      children: [new xb.UIExitButton(), this.statusText],
    });
    this.overlay.name = 'Thanh hướng dẫn XR';
    this.add(this.overlay);

    this.renderAll();
    this.unsubscribe = this.store.subscribe(() => this.renderAll());
  }

  setStatusHint(message: string) {
    if (this.statusText) {
      this.statusText.text = message;
    }
  }

  resetCardTransforms() {
    const entries: [xb.UICard, CardPose][] = [
      [this.leftCard, CARD_POSES.left],
      [this.centerCard, CARD_POSES.center],
      [this.rightCard, CARD_POSES.right],
    ];
    for (const [card, pose] of entries) {
      card.position.copy(pose.position);
      card.rotation.set(0, pose.rotationY, 0);
      card.scale.setScalar(1);
      card.size = {...pose.size};
    }
  }

  renderAll() {
    renderLeftRemindersCard(
      this.leftBody,
      this.store,
      {
        onRotateLeft: () => {
          this.isAutoRotating = false;
          this.stage.rotateDialBy(Math.PI / 6);
          this.renderLeftOnly();
        },
        onRotateRight: () => {
          this.isAutoRotating = false;
          this.stage.rotateDialBy(-Math.PI / 6);
          this.renderLeftOnly();
        },
        onToggleAutoRotate: () => {
          this.isAutoRotating = this.stage.toggleAutoRotate();
          this.renderLeftOnly();
          return this.isAutoRotating;
        },
        onResetCards: () => {
          this.resetCardTransforms();
          this.store.notify('Đã đặt lại vị trí các thẻ không gian XR.', 'info');
        },
      },
      this.isAutoRotating,
    );

    renderCenterHubCard(this.centerBody, this.store, {
      onQuickAdd: () => {
        resetQuickAddDraft(this.draft);
        this.store.openQuickAdd();
      },
      onOpenFundForm: (type: FundTransactionType) => {
        this.draft.fundType = type;
        this.draft.fundNote =
          type === FundTransactionType.EXPENSE
            ? 'Chi việc hiếu hỉ từ quỹ chung'
            : 'Đóng góp quỹ chung gia đình';
        this.draft.fundError = '';
        this.store.openFundForm();
      },
      onFocusMonthIn3D: (month: number) => {
        this.stage.focusMonth(month);
      },
    });

    this.renderRightOnly();
  }

  private renderLeftOnly() {
    renderLeftRemindersCard(
      this.leftBody,
      this.store,
      {
        onRotateLeft: () => {
          this.isAutoRotating = false;
          this.stage.rotateDialBy(Math.PI / 6);
          this.renderLeftOnly();
        },
        onRotateRight: () => {
          this.isAutoRotating = false;
          this.stage.rotateDialBy(-Math.PI / 6);
          this.renderLeftOnly();
        },
        onToggleAutoRotate: () => {
          this.isAutoRotating = this.stage.toggleAutoRotate();
          this.renderLeftOnly();
          return this.isAutoRotating;
        },
        onResetCards: () => {
          this.resetCardTransforms();
          this.store.notify('Đã đặt lại vị trí các thẻ không gian XR.', 'info');
        },
      },
      this.isAutoRotating,
    );
  }

  private renderRightOnly() {
    renderRightInspectorCard(this.rightBody, this.store, this.draft, () => {
      this.renderRightOnly();
    });
  }

  update() {
    // Run built-in spatial UI layout validation once after first rendered frames
    if (!this.validationLogged) {
      this.frameCounter++;
      if (this.frameCounter === 30 && xb.ui?.validate) {
        this.validationLogged = true;
        try {
          const report = xb.ui.validate();
          if (report && !report.ok && report.issues?.length) {
            console.warn('Spatial UI validation report:', report.issues);
          }
        } catch {
          // Ignore if validation is not ready yet
        }
      }
    }
  }

  dispose() {
    this.unsubscribe?.();
  }
}
