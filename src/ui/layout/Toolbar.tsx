import { MinusSquareOutlined, PlusSquareOutlined } from '@ant-design/icons';
import { Button, Select } from 'antd';
import type { BoqRow, GroupField } from '../../core';
import { S } from '../strings';
import { useTakeoff } from '../takeoff';

const GROUP_FIELDS = (Object.keys(S.toolbar.fields) as GroupField[]).map((value) => ({ value, label: S.toolbar.fields[value] }));
const groupKeys = (rows: BoqRow[]): string[] => rows.flatMap((r) => (r.children ? [r.key, ...groupKeys(r.children)] : []));

export function Toolbar() {
  const { state, boq, storeys, classes, setGroupBy, setFilters, setExpanded } = useTakeoff();
  const { groupBy, filters } = state;
  const disabled = state.status.kind !== 'ready';

  return (
    <div className="toolbar" role="toolbar" aria-label="takeoff options">
      <label className="field">
        <span>{S.toolbar.groupBy}</span>
        <Select mode="multiple" size="small" className="sel-group" value={groupBy} options={GROUP_FIELDS} onChange={setGroupBy} aria-label="group by" />
      </label>
      <span className="divider" aria-hidden="true" />
      <label className="field">
        <span>{S.toolbar.storeys}</span>
        <Select mode="multiple" size="small" className="sel-filter" allowClear maxTagCount="responsive" placeholder={S.toolbar.allStoreys} value={filters.storeys}
          options={storeys.map((s) => ({ value: s, label: s }))} onChange={(v) => setFilters({ ...filters, storeys: v })} disabled={disabled} aria-label="storeys" />
      </label>
      <label className="field">
        <span>{S.toolbar.hideClasses}</span>
        <Select mode="multiple" size="small" className="sel-filter" allowClear maxTagCount="responsive" placeholder={S.toolbar.noneHidden} value={filters.hiddenClasses}
          options={classes.map((c) => ({ value: c, label: c }))} onChange={(v) => setFilters({ ...filters, hiddenClasses: v })} disabled={disabled} aria-label="hide classes" />
      </label>
      <span className="spacer" />
      <Button size="small" type="text" icon={<PlusSquareOutlined />} disabled={disabled} onClick={() => setExpanded(groupKeys(boq.rows))}>{S.toolbar.expandAll}</Button>
      <Button size="small" type="text" icon={<MinusSquareOutlined />} disabled={disabled} onClick={() => setExpanded([])}>{S.toolbar.collapseAll}</Button>
    </div>
  );
}
