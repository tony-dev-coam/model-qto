import { AppstoreOutlined, BorderInnerOutlined, BorderOutlined, ColumnHeightOutlined, DeleteOutlined, EyeInvisibleOutlined, EyeOutlined, GatewayOutlined, LineOutlined } from '@ant-design/icons';
import { Popover, Tooltip } from 'antd';
import { useSyncExternalStore, type ReactNode } from 'react';
import type { Store } from '../core/store';
import type { ToolId } from '../core/tools/toolManager';
import type { Viewer } from '../core';
import { S } from './strings';

const useStore = <T,>(s: Store<T>) => useSyncExternalStore(s.subscribe, s.getSnapshot);

/** Diagonal ruler with tick marks, the usual "measure" glyph in BIM viewers (antd has no ruler icon). */
const RulerIcon = () => (
  <svg viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
    <path d="M3.5 16.5 16.5 3.5l4 4-13 13z" />
    <path d="M7 13l2 2M9.5 10.5l1.5 1.5M12 8l2 2M14.5 5.5l1.5 1.5" />
  </svg>
);

interface Item { key: string; label: string; icon: ReactNode; onClick(): void; active?: boolean; disabled?: boolean }

function ItemButton({ item, more }: { item: Item; more?: boolean }) {
  const button = (
    <button type="button" className="tb-btn" aria-label={item.label} aria-pressed={item.active} disabled={item.disabled} data-more={more || undefined} onClick={item.onClick}>
      {item.icon}
    </button>
  );
  // The bar key opens the menu on hover, so a tooltip would cover it.
  return more ? button : <Tooltip title={item.label} placement="right" mouseEnterDelay={0.2}>{button}</Tooltip>;
}

/** Left-edge Measurement key; its menu holds the same tools as bcf-viewer's Measurement group. */
export function MeasureMenu({ viewer }: { viewer: Viewer }) {
  const { active } = useStore(viewer.tools.store);
  const meas = useStore(viewer.measure.store);
  const mode = (id: ToolId, label: string, icon: ReactNode): Item => ({ key: id, label, icon, active: active === id, onClick: () => viewer.tools.activate(id) });
  // Default tool first (closest to the bar key), destructive last.
  const items: Item[] = [
    mode('length-free', S.measure.lengthFree, <ColumnHeightOutlined />),
    mode('length-edge', S.measure.lengthEdge, <LineOutlined />),
    mode('area-free', S.measure.areaFree, <GatewayOutlined />),
    mode('area-rect', S.measure.areaRect, <BorderInnerOutlined />),
    mode('area-face', S.measure.areaFace, <BorderOutlined />),
    mode('volume', S.measure.volume, <AppstoreOutlined />),
    { key: 'm-vis', label: meas.visible ? S.measure.hide : S.measure.show, icon: meas.visible ? <EyeInvisibleOutlined /> : <EyeOutlined />, onClick: () => viewer.measure.setVisible(!meas.visible) },
    { key: 'm-del', label: S.measure.deleteAll, icon: <DeleteOutlined />, onClick: () => viewer.measure.deleteAll(), disabled: !meas.count },
  ];
  // The bar key always shows the ruler (recognisable at a glance), lit while a measuring tool is on; a click starts Length free.
  const bar: Item = { key: 'measure', label: S.measure.group, icon: <RulerIcon />, active: active !== 'select', onClick: () => viewer.tools.activate('length-free') };

  return (
    <div className="measure-bar" role="toolbar" aria-label={S.measure.group}>
      <Popover
        content={<div className="tb-menu" role="menu" aria-label={S.measure.group}>{items.map((i) => <ItemButton key={i.key} item={i} />)}</div>}
        placement="rightTop" trigger="hover" arrow={false} mouseLeaveDelay={0.15}
        styles={{ container: { padding: 0, borderRadius: 8 } }}
      >
        <span className="inline-flex"><ItemButton item={bar} more /></span>
      </Popover>
    </div>
  );
}
