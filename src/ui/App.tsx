import { App as AntApp, ConfigProvider } from 'antd';
import { AppLayout } from './layout/AppLayout';
import { Footer } from './layout/Footer';
import { Header } from './layout/Header';
import { Toolbar } from './layout/Toolbar';
import { BoqPanel } from './panels/BoqPanel';
import { ViewerPanel } from './panels/ViewerPanel';
import { TakeoffProvider } from './takeoff';
import { antdTheme } from './theme';
import { ViewerProvider } from './viewer';

export default function App() {
  return (
    <ConfigProvider theme={antdTheme}>
      <AntApp component={false}>
        <ViewerProvider>
          <TakeoffProvider>
            <AppLayout header={<Header />} toolbar={<Toolbar />} viewer={<ViewerPanel />} boq={<BoqPanel />} footer={<Footer />} />
          </TakeoffProvider>
        </ViewerProvider>
      </AntApp>
    </ConfigProvider>
  );
}
