use screenraid_types::MediaType;

pub const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
pub const MAX_GIF_BYTES: u64 = 15 * 1024 * 1024;
pub const MAX_VIDEO_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_AUDIO_BYTES: u64 = 10 * 1024 * 1024;

pub const MAX_UPLOADS_PER_HOUR: u32 = 20;
pub const MAX_PRANKS_PER_MINUTE: u32 = 30;

pub fn max_bytes_for_type(media_type: MediaType) -> u64 {
    match media_type {
        MediaType::Image => MAX_IMAGE_BYTES,
        MediaType::Gif => MAX_GIF_BYTES,
        MediaType::Video => MAX_VIDEO_BYTES,
        MediaType::Audio => MAX_AUDIO_BYTES,
    }
}
