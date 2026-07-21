pub mod admin;
pub mod auth;
pub mod consent;
pub mod friends;
pub mod gifs;
pub mod health;
pub mod media;
pub mod monitors;
pub mod pranks;
pub mod rooms;

pub use admin::{deactivate_user, delete_media_admin, list_admin_media, list_admin_users};
pub use auth::{
    change_display_name, change_password, change_username, login, logout, logout_all, me, refresh,
    register,
};
pub use consent::{
    check_can_receive, get_consent, grant_consent, pause_consent, resume_consent, revoke_consent,
    room_consent,
};
pub use friends::{
    accept_request, block_friend, decline_request, list_friends, list_requests, remove_friend,
    send_request,
};
pub use gifs::{import_gif, search_gifs};
pub use health::{health, ready};
pub use media::{delete_media, download_media, list_media, list_room_media, upload_media};
pub use monitors::{get_my_monitors, get_user_monitors, update_my_monitors};
pub use pranks::{ack_prank, list_pranks, send_prank};
pub use rooms::{
    change_member_role, create_room, delete_room, get_room, join_room, kick_member, leave_room,
    list_rooms,
};
