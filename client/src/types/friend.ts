export interface FriendSummary {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
}

export interface FriendRequestItem {
  id: string;
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  created_at: string;
}

export interface FriendRequestsResponse {
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
}
