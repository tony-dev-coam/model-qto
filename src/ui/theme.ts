import { theme, type ThemeConfig } from 'antd';

// Design tokens (Swiss / dense workspace). Amber = 3D selection highlight in core/viewer.ts, reused for the selected BOQ row.
export const tokens = {
  navy: '#1E3A5F', // top bar, brand
  primary: '#2563EB', // interactive
  accent: '#f59e0b', // selection
  bg: '#F8FAFC',
  border: '#E4E7EB',
  text: '#0F172A',
  muted: '#475569', // 7.6:1 on white
};

const font = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: tokens.primary,
    colorText: tokens.text,
    colorTextSecondary: tokens.muted,
    colorTextDescription: tokens.muted,
    colorBorder: '#CBD2DA',
    colorBorderSecondary: tokens.border,
    colorBgLayout: tokens.bg,
    borderRadius: 4,
    borderRadiusSM: 3,
    borderRadiusLG: 6,
    fontFamily: font,
    fontSize: 13,
    controlHeight: 30,
    controlHeightSM: 24,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
    boxShadowSecondary: '0 4px 12px rgba(15, 23, 42, 0.12)',
  },
  components: {
    Table: {
      headerBg: '#F1F4F7',
      headerColor: tokens.muted,
      headerSplitColor: 'transparent',
      cellPaddingBlockSM: 5,
      cellPaddingInlineSM: 8,
      rowHoverBg: '#F1F5F9',
      footerBg: '#F1F4F7',
    },
    Tag: { defaultBg: '#F1F5F9' },
  },
};

// Top bar sits on navy: same tokens through antd's dark algorithm, so its buttons/focus rings stay native antd.
export const topBarTheme: ThemeConfig = {
  inherit: false, // don't pick up the light theme's colorText/colorBorder
  algorithm: theme.darkAlgorithm,
  token: { colorPrimary: tokens.primary, colorBgContainer: '#24466F', colorBorder: '#3B5B82', borderRadius: 4, fontSize: 13, controlHeight: 30, fontFamily: font },
};
