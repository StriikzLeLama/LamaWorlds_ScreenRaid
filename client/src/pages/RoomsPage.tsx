import { useCallback, useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Button, Input, Badge, Modal } from '../components/ui';
import { ApiError } from '../services/api';
import { createRoom, joinRoomById, listRooms } from '../services/rooms';
import type { RoomSummary } from '../types/room';

export function RoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');

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
      const room = await createRoom(roomName);
      setShowCreate(false);
      setRoomName('');
      navigate(`/rooms/${room.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Create failed');
    }
  };

  const handleJoin = async (roomId: string) => {
    setJoiningId(roomId);
    setError('');
    try {
      await joinRoomById(roomId);
      navigate(`/rooms/${roomId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Join failed');
      load();
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">Rooms</h1>
          <p className="text-sm text-raid-text-secondary">
            Toutes les rooms entre potes — rejoins en un clic
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={18} />
          Create Room
        </Button>
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
            <p className="text-raid-text-secondary">Aucune room pour l’instant.</p>
            <div className="mt-4">
              <Button onClick={() => setShowCreate(true)}>Create Room</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const member = room.is_member !== false;
            return (
              <Card key={room.id} interactive={member}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-raid-text">{room.name}</h3>
                    <div className="mt-4 flex items-center gap-2 text-sm text-raid-text-secondary">
                      <Users size={16} />
                      {room.member_count} members
                    </div>
                  </div>
                  <Badge variant={member ? (room.role === 'owner' ? 'accent' : 'neutral') : 'warning'}>
                    {member ? room.role : 'not joined'}
                  </Badge>
                </div>
                <div className="mt-4">
                  {member ? (
                    <Link to={`/rooms/${room.id}`}>
                      <Button className="w-full" variant="secondary">
                        Open
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={joiningId === room.id}
                      onClick={() => void handleJoin(room.id)}
                    >
                      {joiningId === room.id ? 'Joining…' : 'Join'}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Room">
        <div className="space-y-4">
          <Input label="Room name" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Squad" />
          <Button className="w-full" onClick={() => void handleCreate()} disabled={!roomName.trim()}>
            Create
          </Button>
        </div>
      </Modal>
    </div>
  );
}
