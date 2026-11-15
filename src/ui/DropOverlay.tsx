import { FolderOpenOutlined, InboxOutlined, LockOutlined } from '@ant-design/icons';
import { Alert, Button, Progress } from 'antd';
import { FILE_INPUT_ID } from './layout/Header';
import { S } from './strings';
import { useTakeoff } from './takeoff';
import { useViewer } from './viewer';

/** Over the 3D view: drop target + sample button before a model is loaded, progress while loading. */
export function DropOverlay({ dragOver }: { dragOver: boolean }) {
  const { state, openSample } = useTakeoff();
  const { viewer } = useViewer();
  const { status } = state;
  if (status.kind === 'ready' && !dragOver) return null;

  return (
    <div className="overlay">
      {(status.kind === 'idle' || status.kind === 'error' || dragOver) && (
        <div className={`drop${dragOver ? ' over' : ''}`}>
          {status.kind === 'error' && <Alert type="error" showIcon title={status.text} className="drop-error" />}
          <InboxOutlined className="drop-icon" aria-hidden="true" />
          <h2>{S.drop.title}</h2>
          <p className="drop-hint">{S.drop.hint}</p>
          <div className="drop-actions">
            <Button type="primary" onClick={openSample} disabled={!viewer}>{S.drop.sample}</Button>
            <Button icon={<FolderOpenOutlined />} onClick={() => document.getElementById(FILE_INPUT_ID)?.click()}>{S.drop.browse}</Button>
          </div>
          <p className="drop-privacy"><LockOutlined aria-hidden="true" /> {S.drop.privacy}</p>
        </div>
      )}
      {status.kind === 'loading' && (
        <div className="progress" role="status">
          <span>{S.progress[status.stage]}</span>
          <Progress percent={Math.round(status.progress * 100)} size="small" />
        </div>
      )}
    </div>
  );
}
