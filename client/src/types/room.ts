export interface RoomSummary {
  id: string;
  name: string;
  invite_code: string;
  role: string;
  member_count: number;
  /** False when visible but not joined yet. Defaults true for older payloads. */
  is_member?: boolean;
}

export interface RoomMember {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  consent_status: string;
  presence: string;
}

export interface RoomDetail {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  max_members: number;
  members: RoomMember[];
}
