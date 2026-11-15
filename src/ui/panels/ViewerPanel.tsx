import { CloseOutlined, ExpandOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useState } from 'react';
import { DropOverlay } from '../DropOverlay';
import { S } from '../strings';
import { useTakeoff } from '../takeoff';
import { useViewer } from '../viewer';

/** Hosts the 3D canvas (ViewerProvider boots the engine into it) and accepts dropped IFC files. */
export function ViewerPanel() {
  const { viewportRef } = useViewer();
  const { state, openFile, fitModel, clearSelection } = useTakeoff();
  const [dragOver, setDragOver] = useState(false);
  const ready = state.status.kind === 'ready';

  return (
    <section
      className="viewer-panel"
      aria-label="3D model"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) void openFile(f);
      }}
    >
      <div className="viewer" ref={viewportRef} />
      <DropOverlay dragOver={dragOver} />
      {ready && (
        <div className="view-controls" role="toolbar" aria-label="view controls">
          <Tooltip title={S.viewer.fit} placement="left">
            <Button icon={<ExpandOutlined />} aria-label={S.viewer.fit} onClick={fitModel} />
          </Tooltip>
          {state.selection.ids.length > 0 && (
            <Tooltip title={S.viewer.clear} placement="left">
              <Button icon={<CloseOutlined />} aria-label={S.viewer.clear} onClick={clearSelection} />
            </Tooltip>
          )}
        </div>
      )}
    </section>
  );
}
