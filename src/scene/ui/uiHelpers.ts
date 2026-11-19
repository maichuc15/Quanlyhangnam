import * as THREE from 'three';
import * as xb from 'xrblocks';

import {COLORS} from '../../constants';
import {audioFeedback} from '../../utils/audioFeedback';

export function clearUIContainer(container: THREE.Object3D) {
  while (container.children.length > 0) {
    container.remove(container.children[0]);
  }
}

export function createSectionTitle(text: string): xb.UIText {
  return new xb.UIText({
    text,
    pointerEvents: 'none',
    style: {
      fontSize: 16,
      fontWeight: 'bold',
      color: COLORS.textSecondary,
    },
  });
}

export function createDivider(): xb.UIPanel {
  return new xb.UIPanel({
    pointerEvents: 'none',
    style: {
      width: '100%',
      height: 1,
      backgroundColor: COLORS.borderSubtle,
    },
  });
}

export function createActionButton(options: {
  label: string;
  icon?: string;
  active?: boolean;
  tone?: 'primary' | 'danger' | 'success' | 'warning' | 'neutral';
  compact?: boolean;
  grow?: boolean;
  onClick: () => void;
}): xb.UIButton {
  const {
    label,
    icon,
    active = false,
    tone = 'neutral',
    compact = false,
    grow = false,
    onClick,
  } = options;

  let bg = 'rgba(51, 65, 85, 0.72)';
  let hoverBg = 'rgba(71, 85, 105, 0.88)';
  let color = COLORS.textPrimary;

  if (tone === 'primary' || active) {
    bg = COLORS.primary;
    hoverBg = COLORS.primaryHover;
    color = '#FFFFFF';
  } else if (tone === 'danger') {
    bg = 'rgba(220, 38, 38, 0.85)';
    hoverBg = '#B91C1C';
    color = '#FFFFFF';
  } else if (tone === 'success') {
    bg = 'rgba(22, 163, 74, 0.85)';
    hoverBg = '#15803D';
    color = '#FFFFFF';
  } else if (tone === 'warning') {
    bg = 'rgba(217, 119, 6, 0.85)';
    hoverBg = '#B45309';
    color = '#FFFFFF';
  }

  return new xb.UIButton({
    label,
    icon,
    onClick: () => {
      audioFeedback.playSelect();
      onClick();
    },
    style: {
      ...(grow ? {flexGrow: 1, flexBasis: 0} : {}),
      height: compact ? 36 : 42,
      paddingLeft: compact ? 10 : 14,
      paddingRight: compact ? 10 : 14,
      paddingTop: 0,
      paddingBottom: 0,
      fontSize: compact ? 14 : 15,
      fontWeight: 'bold',
      borderRadius: 10,
      backgroundColor: bg,
      color,
      borderWidth: 1,
      borderColor: active ? 'rgba(255,255,255,0.32)' : COLORS.borderSubtle,
      ':hover': {backgroundColor: hoverBg},
      ':active': {backgroundColor: hoverBg},
    },
  });
}

export function createMetricTile(
  label: string,
  value: string,
  accentColor: string,
  subText?: string,
): xb.UIPanel {
  const children: THREE.Object3D[] = [
    new xb.UIText({
      text: label,
      pointerEvents: 'none',
      style: {
        fontSize: 13,
        color: COLORS.textMuted,
      },
    }),
    new xb.UIText({
      text: value,
      pointerEvents: 'none',
      style: {
        fontSize: 19,
        fontWeight: 'bold',
        color: accentColor,
      },
    }),
  ];
  if (subText) {
    children.push(
      new xb.UIText({
        text: subText,
        pointerEvents: 'none',
        style: {
          fontSize: 12,
          color: COLORS.textSecondary,
        },
      }),
    );
  }
  return new xb.UIPanel({
    pointerEvents: 'none',
    style: {
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: 'column',
      gap: 3,
      padding: 10,
      borderRadius: 12,
      backgroundColor: COLORS.surfacePanel,
      borderWidth: 1,
      borderColor: COLORS.borderSubtle,
    },
    children,
  });
}

export function createLabeledInput(options: {
  label: string;
  ariaLabel: string;
  value: string;
  placeholder: string;
  onInput: (val: string) => void;
}): xb.UIPanel {
  const input = new xb.UITextInput({
    ariaLabel: options.ariaLabel,
    value: options.value,
    placeholder: options.placeholder,
    onInput: options.onInput,
    style: {
      width: '100%',
      height: 38,
      paddingLeft: 10,
      paddingRight: 10,
      fontSize: 15,
      borderRadius: 8,
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      color: '#FFFFFF',
      borderWidth: 1,
      borderColor: 'rgba(148, 163, 184, 0.36)',
    },
  });

  return new xb.UIPanel({
    style: {
      width: '100%',
      flexDirection: 'column',
      gap: 4,
    },
    children: [
      new xb.UIText({
        text: options.label,
        pointerEvents: 'none',
        style: {
          fontSize: 13,
          fontWeight: 'bold',
          color: COLORS.textSecondary,
        },
      }),
      input,
    ],
  });
}
