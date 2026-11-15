import { TableOutlined, WarningOutlined } from '@ant-design/icons';
import { InputNumber, Select, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect } from 'react';
import { sourceLabel, UNIT_LABEL, WARNING_LABEL, type BoqRow, type Unit } from '../../core';
import { S } from '../strings';
import { useTakeoff } from '../takeoff';

const qty = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const money = int;
const UNITS = (Object.keys(UNIT_LABEL) as Unit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }));
const SOURCE_COLOR: Record<string, string> = { Qto: 'green', Computed: 'default', Counted: 'default' };
const stop = (e: React.SyntheticEvent) => e.stopPropagation(); // editing a cell must not select the row
const C = S.boq.columns;
const leafCount = (rows: BoqRow[]): number => rows.reduce((n, r) => n + (r.children ? leafCount(r.children) : 1), 0);

export function BoqPanel() {
  const { state, boq, setPrice, setExpanded, selectRow } = useTakeoff();
  const selectedKey = state.selection.rowKey;
  const ready = state.status.kind === 'ready';

  // A 3D pick expands the row's ancestors; scroll once they have rendered.
  useEffect(() => {
    if (!selectedKey) return;
    requestAnimationFrame(() => document.querySelector(`tr[data-row-key="${CSS.escape(selectedKey)}"]`)?.scrollIntoView({ block: 'nearest' }));
  }, [selectedKey]);

  const columns: ColumnsType<BoqRow> = [
    {
      title: C.item,
      dataIndex: 'label',
      ellipsis: { showTitle: false },
      // ponytail: display-only, drops the Revit family prefix ("Basic Wall:") that repeats on every wall line; tooltip and Excel keep the full name.
      render: (label: string, row) => (
        <>
          <span title={label}>{label.replace(/^[^:]{2,40}:(?=\S)/, '')}</span>
          {row.warnings.length > 0 && (
            <Tooltip title={row.warnings.map((w) => <div key={w}>{WARNING_LABEL[w] ?? w}</div>)}>
              <WarningOutlined className="row-warning" aria-label="warnings" />
            </Tooltip>
          )}
        </>
      ),
    },
    {
      title: C.source,
      width: 88,
      render: (_, row) => {
        const s = sourceLabel(row);
        return s && <Tag color={SOURCE_COLOR[s] ?? 'gold'}>{s}</Tag>;
      },
    },
    { title: C.count, dataIndex: 'count', width: 56, align: 'right', className: 'num', render: (v: number) => int.format(v) },
    {
      title: C.unit,
      width: 60,
      render: (_, row) =>
        row.priceKey && (
          <div onClick={stop} onKeyDown={stop}>
            <Select size="small" variant="borderless" value={row.unit} options={UNITS} popupMatchSelectWidth={false} className="unit-select" aria-label="unit"
              onChange={(unit) => setPrice(row.priceKey!, { unit, unitPrice: row.unitPrice ?? 0 })} />
          </div>
        ),
    },
    {
      title: C.quantity,
      width: 88,
      align: 'right',
      className: 'num',
      render: (_, row) => row.quantity !== undefined && (row.unit === 'count' ? int : qty).format(row.quantity),
    },
    {
      title: C.unitPrice,
      width: 92,
      align: 'right',
      render: (_, row) =>
        row.priceKey && (
          <div onClick={stop} onKeyDown={stop}>
            <InputNumber size="small" min={0} value={row.unitPrice || null} placeholder="0" className="price-input" aria-label="unit price"
              onChange={(v) => setPrice(row.priceKey!, { unit: row.unit!, unitPrice: Math.max(0, Number(v) || 0) })} />
          </div>
        ),
    },
    {
      title: C.amount,
      dataIndex: 'amount',
      width: 92,
      align: 'right',
      className: 'num',
      render: (v: number) => (v ? money.format(v) : <span className="dim">–</span>),
    },
  ];

  return (
    <section className="boq-panel" aria-label={S.boq.region}>
      <div className="panel-head">
        <h2>{S.boq.title}</h2>
        {ready && <span className="panel-meta num">{S.boq.meta(leafCount(boq.rows), new Set(state.elements.map((e) => e.expressId)).size)}</span>}
      </div>
      <div className="boq-body">
        {!ready ? (
          <div className="boq-empty">
            <TableOutlined aria-hidden="true" />
            <p>{S.boq.empty}</p>
          </div>
        ) : (
          <Table<BoqRow>
            size="small"
            rowKey="key"
            columns={columns}
            dataSource={boq.rows}
            pagination={false}
            sticky
            tableLayout="fixed"
            scroll={{ x: 640 }}
            expandable={{ expandedRowKeys: state.expanded, onExpandedRowsChange: (keys) => setExpanded(keys as string[]), indentSize: 14 }}
            rowClassName={(row) => [row.key === selectedKey && 'row-selected', row.children && 'row-group'].filter(Boolean).join(' ')}
            onRow={(row) => ({
              onClick: () => selectRow(row),
              tabIndex: 0,
              'aria-selected': row.key === selectedKey,
              onKeyDown: (e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  selectRow(row);
                }
              },
            })}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row className="row-total">
                  <Table.Summary.Cell index={0} colSpan={6}>{S.boq.total}</Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right"><b className="num">{money.format(boq.total)}</b></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        )}
      </div>
    </section>
  );
}
