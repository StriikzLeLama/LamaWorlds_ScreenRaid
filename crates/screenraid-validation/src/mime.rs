use screenraid_types::MediaType;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("file too large: {size} bytes (max {max})")]
    FileTooLarge { size: u64, max: u64 },
    #[error("invalid file type: {mime}")]
    InvalidMime { mime: String },
    #[error("mime mismatch: declared {declared}, detected {detected}")]
    MimeMismatch { declared: String, detected: String },
}

const IMAGE_MIMES: &[&str] = &["image/png", "image/jpeg", "image/webp"];
const GIF_MIMES: &[&str] = &["image/gif"];
const VIDEO_MIMES: &[&str] = &["video/mp4", "video/webm"];
const AUDIO_MIMES: &[&str] = &["audio/mpeg", "audio/wav", "audio/ogg"];

pub fn media_type_from_mime(mime: &str) -> Option<MediaType> {
    if IMAGE_MIMES.contains(&mime) {
        Some(MediaType::Image)
    } else if GIF_MIMES.contains(&mime) {
        Some(MediaType::Gif)
    } else if VIDEO_MIMES.contains(&mime) {
        Some(MediaType::Video)
    } else if AUDIO_MIMES.contains(&mime) {
        Some(MediaType::Audio)
    } else {
        None
    }
}

pub fn detect_mime_from_bytes(data: &[u8]) -> Option<&'static str> {
    if data.len() >= 8 && &data[0..8] == b"\x89PNG\r\n\x1a\n" {
        return Some("image/png");
    }
    if data.len() >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
        return Some("image/jpeg");
    }
    if data.len() >= 6 && (&data[0..6] == b"GIF87a" || &data[0..6] == b"GIF89a") {
        return Some("image/gif");
    }
    if data.len() >= 12 && &data[0..4] == b"RIFF" && data.len() >= 12 && &data[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if data.len() >= 12 && &data[4..8] == b"ftyp" {
        return Some("video/mp4");
    }
    if data.len() >= 4 && &data[0..4] == b"RIFF" {
        return Some("audio/wav");
    }
    if data.len() >= 4 && &data[0..4] == b"OggS" {
        return Some("audio/ogg");
    }
    if data.len() >= 3 && data[0] == 0xFF && (data[1] & 0xE0) == 0xE0 {
        return Some("audio/mpeg");
    }
    None
}

pub fn validate_upload(data: &[u8], declared_mime: &str) -> Result<MediaType, ValidationError> {
    let detected = detect_mime_from_bytes(data).ok_or_else(|| ValidationError::InvalidMime {
        mime: declared_mime.to_string(),
    })?;

    if detected != declared_mime {
        return Err(ValidationError::MimeMismatch {
            declared: declared_mime.to_string(),
            detected: detected.to_string(),
        });
    }

    let media_type = media_type_from_mime(detected).ok_or_else(|| ValidationError::InvalidMime {
        mime: declared_mime.to_string(),
    })?;

    let max = crate::limits::max_bytes_for_type(media_type);
    if data.len() as u64 > max {
        return Err(ValidationError::FileTooLarge {
            size: data.len() as u64,
            max,
        });
    }

    Ok(media_type)
}
