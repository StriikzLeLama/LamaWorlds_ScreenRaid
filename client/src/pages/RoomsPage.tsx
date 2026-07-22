import { useEffect, useState, useCallback } from 'react';
import { Plus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, Button, Input, Badge, Modal } from '../components/ui';
import { ApiError } from '../services/api';
import { createRoom, joinRoom, joinRoomByToken, listRooms } from '../services/rooms';
import { extractInvitePayload } from '../lib/invites';
import type { RoomSummary } from '../types/room';

export function RoomsPage() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRooms();
      setRooms(res.rooms);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('screenraid:room', handler);
    return () => window.removeEventListener('screenraid:room', handler);
  }, [load]);

  const handleCreate = async () => {
    try {
      await createRoom(roomName);
      setShowCreate(false);
      setRoomName('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Create failed');
    }
  };

  const handleJoin = async () => {
    try {
      const payload = extractInvitePayload(inviteCode);
      if (!payload.value) {
        setError('Enter an invite code or paste a guest link');
        return;
      }
      if (payload.kind === 'token') {
        await joinRoomByToken(payload.value);
      } else {
        await joinRoom(payload.value.toUpperCase());
      }
      setShowJoin(false);
      setInviteCode('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Join failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">Rooms</h1>
          <p className="text-sm text-raid-text-secondary">Private spaces for your prank squad</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowJoin(true)}>
            Join with Code
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={18} />
            Create Room
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-raid-danger/30 bg-raid-danger/10 px-3 py-2 text-sm text-raid-danger">
          {error}
        </p>
      )}

      {loading ? (
        <Card><p className="text-sm text-raid-text-secondary">Loading rooms…</p></Card>
      ) : rooms.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-raid-text-secondary">You are not in any rooms yet.</p>
            <div className="mt-4 flex gap-3">
              <Button onClick={() => setShowCreate(true)}>Create Room</Button>
              <Button variant="secondary" onClick={() => setShowJoin(true)}>Join with Code</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Link key={room.id} to={`/rooms/${room.id}`}>
              <Card interactive>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-raid-text">{room.name}</h3>
                    <p className="mt-1 text-xs text-raid-text-secondary font-mono">{room.invite_code}</p>
                  </div>
                  <Badge variant={room.role === 'owner' ? 'accent' : 'neutral'}>{room.role}</Badge>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-raid-text-secondary">
                  <Users size={16} />
                  {room.member_count} members
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Room">
        <div className="space-y-4">
          <Input label="Room name" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Squad" />
          <Button className="w-full" onClick={handleCreate} disabled={!roomName.trim()}>Create</Button>
        </div>
      </Modal>

      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Join Room">
        <div className="space-y-4">
          <Input
            label="Invite code or guest link"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="ABC12345 or https://…/join?invite=…"
            className="font-mono"
          />
          <Button className="w-full" onClick={handleJoin} disabled={inviteCode.trim().length < 4}>
            Join
          </Button>
        </div>
      </Modal>
    </div>
  );
}
