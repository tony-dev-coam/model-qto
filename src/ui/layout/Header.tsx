import { DownloadOutlined, FileOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Tooltip } from 'antd';
import { S } from '../strings';
import { useTakeoff } from '../takeoff';
import { topBarTheme } from '../theme';
import { useViewer } from '../viewer';

export const FILE_INPUT_ID = 'ifc-file-input'; // the one file input; the empty state's "Choose file" clicks it too

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
      <rect width="32" height="32" rx="5" fill="#2B5486" />
      <path d="M16 6 25 11 16 16 7 11Z" fill="#93C5FD" />
      <path d="M7 11 16 16V26L7 21Z" fill="#fff" />
      <path d="M25 11 16 16V26L25 21Z" fill="#60A5FA" />
    </svg>
  );
}

export function Header() {
  const { state, boq, openFile, openSample, exportExcel } = useTakeoff();
  const { viewer } = useViewer();
  const { file, status } = state;

  return (
    <ConfigProvider theme={topBarTheme}>
      <header className="topbar">
        <div className="brand">
          <LogoMark />
          <h1>{S.appName}</h1>
          <span className="descriptor">{S.descriptor}</span>
        </div>
        <div className="file-info" title={file?.name}>
          <FileOutlined aria-hidden="true" />
          {file ? (
            <>
              <span className="file-name">{file.name}</span>
              <span className="file-meta">{[mb(file.size), file.schema].filter(Boolean).join(' · ')}</span>
            </>
          ) : (
            <span className="file-meta">{S.header.noFile}</span>
          )}
        </div>
        <div className="actions">
          <Button icon={<FolderOpenOutlined />} onClick={() => document.getElementById(FILE_INPUT_ID)?.click()}>{S.header.open}</Button>
          <Tooltip title={S.footer.sample}>
            <Button onClick={openSample} disabled={!viewer}>{S.header.sample}</Button>
          </Tooltip>
          <Button type="primary" icon={<DownloadOutlined />} disabled={status.kind !== 'ready' || boq.rows.length === 0} onClick={exportExcel}>
            {S.header.export}
          </Button>
        </div>
        <input id={FILE_INPUT_ID} type="file" accept=".ifc" hidden onChange={(e) => e.target.files?.[0] && void openFile(e.target.files[0])} />
      </header>
    </ConfigProvider>
  );
}
