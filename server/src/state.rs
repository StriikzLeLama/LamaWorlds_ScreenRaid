use std::sync::Arc;

use sqlx::SqlitePool;

use crate::api::middleware::rate_limit::{api_limiter, login_limiter, register_limiter, RateLimiter};
use crate::config::Config;
use crate::repository::{
    ConsentRepository, FriendRepository, MediaRepository, MonitorRepository, PrankRepository,
    RoomRepository, UserRepository,
};
use crate::service::{
    AuthService, ConsentService, FriendService, MediaService, MonitorService, PrankService,
    RoomService,
};
use crate::websocket::WsHub;

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: Arc<Config>,
    pub auth: Arc<AuthService>,
    pub rooms: Arc<RoomService>,
    pub friends: Arc<FriendService>,
    pub consent: Arc<ConsentService>,
    pub media: Arc<MediaService>,
    pub pranks: Arc<PrankService>,
    pub monitors: Arc<MonitorService>,
    pub ws_hub: Arc<WsHub>,
    pub login_limiter: Arc<RateLimiter>,
    pub register_limiter: Arc<RateLimiter>,
    pub api_limiter: Arc<RateLimiter>,
}

impl AppState {
    pub fn new(db: SqlitePool, config: Config) -> Self {
        let config = Arc::new(config);
        let ws_hub = Arc::new(WsHub::new());
        let consent_repo = ConsentRepository::new(db.clone());
        let rooms_repo = RoomRepository::new(db.clone());
        let friends_repo = FriendRepository::new(db.clone());

        let consent = Arc::new(ConsentService::new(
            consent_repo,
            RoomRepository::new(db.clone()),
            ws_hub.clone(),
        ));

        let auth = Arc::new(AuthService::new(
            UserRepository::new(db.clone()),
            Arc::new(config.jwt_secret.clone()),
            Arc::new(config.admin_usernames.clone()),
        ));

        let rooms = Arc::new(RoomService::new(
            rooms_repo,
            UserRepository::new(db.clone()),
            (*consent).clone(),
            ws_hub.clone(),
        ));

        let friends = Arc::new(FriendService::new(
            friends_repo,
            UserRepository::new(db.clone()),
            ws_hub.clone(),
        ));

        let media = Arc::new(MediaService::new(
            MediaRepository::new(db.clone()),
            RoomRepository::new(db.clone()),
            config.clone(),
        ));

        let pranks = Arc::new(PrankService::new(
            PrankRepository::new(db.clone()),
            RoomRepository::new(db.clone()),
            UserRepository::new(db.clone()),
            MediaRepository::new(db.clone()),
            (*consent).clone(),
            ws_hub.clone(),
            config.allow_self_prank,
        ));

        let monitors = Arc::new(MonitorService::new(
            MonitorRepository::new(db.clone()),
            RoomRepository::new(db.clone()),
            ws_hub.clone(),
        ));

        Self {
            db,
            config,
            auth,
            rooms,
            friends,
            consent,
            media,
            pranks,
            monitors,
            ws_hub,
            login_limiter: Arc::new(login_limiter()),
            register_limiter: Arc::new(register_limiter()),
            api_limiter: Arc::new(api_limiter()),
        }
    }
}
