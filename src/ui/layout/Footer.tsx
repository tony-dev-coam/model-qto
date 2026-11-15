import { DISCLAIMER } from '../../core';
import { S } from '../strings';
import { useTakeoff } from '../takeoff';

const n = (v: number) => v.toLocaleString('en');

/** Status bar: model facts on the left, disclaimer + sample credit on the right. */
export function Footer() {
  const { state, storeys } = useTakeoff();
  const { status, file, elements } = state;
  const elementCount = new Set(elements.map((e) => e.expressId)).size;

  return (
    <footer className="statusbar">
      <span className={`status-dot ${status.kind}`} aria-hidden="true" />
      <span>{S.status[status.kind]}</span>
      {status.kind === 'ready' && (
        <>
          <span className="sep" aria-hidden="true" />
          <span className="num">{n(elementCount)} {S.status.elements}</span>
          <span className="sep" aria-hidden="true" />
          <span className="num">{storeys.length} {S.status.storeys}</span>
          {file?.schema && (<><span className="sep" aria-hidden="true" /><span>{file.schema}</span></>)}
        </>
      )}
      <span className="spacer" />
      <span className="disclaimer">{DISCLAIMER}</span>
      <span className="sep" aria-hidden="true" />
      <span>{S.footer.sample}</span>
    </footer>
  );
}
