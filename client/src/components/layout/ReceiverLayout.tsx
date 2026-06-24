import { Outlet } from 'react-router-dom';
import { ReceiverSidebar } from './ReceiverSidebar';
import { TitleBar } from './TitleBar';

export function ReceiverLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <ReceiverSidebar />
        <main className="flex-1 overflow-y-auto bg-raid-bg p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
