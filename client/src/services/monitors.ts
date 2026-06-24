import { apiFetch } from './api';
import { syncMonitorsWs } from './websocket';

export interface MonitorDescriptor {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
}

export interface MonitorLayoutResponse {
  user_id: string;
  updated_at: string;
  monitors: MonitorDescriptor[];
}

export async function getMyMonitors(): Promise<MonitorLayoutResponse | null> {
  try {
    return await apiFetch<MonitorLayoutResponse>('/v1/users/me/monitors');
  } catch {
    return null;
  }
}

export async function updateMyMonitors(
  monitors: MonitorDescriptor[],
): Promise<MonitorLayoutResponse> {
  return apiFetch<MonitorLayoutResponse>('/v1/users/me/monitors', {
    method: 'PUT',
    body: JSON.stringify({ monitors }),
  });
}

export async function getUserMonitors(userId: string): Promise<MonitorLayoutResponse | null> {
  try {
    return await apiFetch<MonitorLayoutResponse>(`/v1/users/${userId}/monitors`);
  } catch {
    return null;
  }
}

export function syncMonitorsToServer(monitors: MonitorDescriptor[]): void {
  syncMonitorsWs(monitors);
}
