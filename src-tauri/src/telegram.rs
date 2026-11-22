/// Shared HTTP client for all Telegram API calls. Reusing the client lets
/// reqwest pool connections and reuse TLS sessions across send_message /
/// send_photo / getUpdates, instead of rebuilding the client (and re-doing
/// the TLS handshake) every call.
static TELEGRAM_CLIENT: once_cell::sync::Lazy<reqwest::Client> =
    once_cell::sync::Lazy::new(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("Failed to build Telegram HTTP client")
    });

/// Send a message to a Telegram channel/chat via a bot.
///
/// `token`   — bot token from @BotFather (e.g. `123456:ABCdef...`)
/// `chat_id` — channel username (e.g. `@mychannel`) or numeric chat id
/// `text`    — message body (plain text, up to 4096 chars)
pub async fn send_message(token: &str, chat_id: &str, text: &str) -> Result<(), String> {
    if token.is_empty() || chat_id.is_empty() {
        return Err("Telegram token and chat_id must not be empty".to_string());
    }

    let url = format!("https://api.telegram.org/bot{token}/sendMessage");
    let body = serde_json::json!({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    });

    let response = TELEGRAM_CLIENT
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Telegram request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        let description = serde_json::from_str::<serde_json::Value>(&body_text)
            .ok()
            .and_then(|v| v["description"].as_str().map(str::to_string))
            .unwrap_or(body_text);
        eprintln!("[telegram] sendMessage failed (status={status}): {description}");
        return Err(humanize_error(status.as_u16(), &description));
    }

    Ok(())
}

/// Turns Telegram's API errors into something an admin can act on (shown in
/// Settings when testing). Unknown errors keep Telegram's own description.
pub fn humanize_error(status: u16, description: &str) -> String {
    let d = description.to_lowercase();
    if status == 401 || status == 404 || d.contains("unauthorized") {
        "El token del bot no es válido. Cópialo de nuevo desde @BotFather.".to_string()
    } else if d.contains("chat not found") {
        "Telegram no encuentra ese chat. Revisa el Chat ID y que el bot esté dentro del canal o grupo.".to_string()
    } else if d.contains("not a member") || d.contains("need administrator rights") || d.contains("not enough rights") {
        "El bot no puede publicar ahí. Añádelo al canal como administrador con permiso para publicar.".to_string()
    } else if d.contains("bot was blocked") {
        "Has bloqueado al bot en Telegram. Desbloquéalo y vuelve a probar.".to_string()
    } else if d.contains("can't parse entities") {
        format!("Telegram no ha podido leer el formato del mensaje ({description}).")
    } else if status == 429 {
        "Telegram está limitando los envíos. Espera unos segundos y vuelve a probar.".to_string()
    } else {
        format!("Telegram ha respondido con un error ({status}): {description}")
    }
}

/// Calls `getUpdates` on the given bot token and returns the chat_id of the most
/// recent message sender. Returns `None` if no messages have been received yet.
/// The caller should instruct the user to send any message to their bot first.
pub async fn get_updates_first_chat_id(token: &str) -> Result<Option<String>, String> {
    if token.is_empty() {
        return Err("Token de bot vacío".to_string());
    }

    let url = format!("https://api.telegram.org/bot{token}/getUpdates?limit=1&offset=-1");

    let response = TELEGRAM_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Error al contactar con Telegram: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Token de bot inválido (HTTP {status}): {body}"));
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    if !json["ok"].as_bool().unwrap_or(false) {
        let desc = json["description"].as_str().unwrap_or("error desconocido");
        return Err(format!("Token de bot inválido: {desc}"));
    }

    let chat_id = json["result"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(chat_from_update)
        .map(|c| c.id);

    Ok(chat_id)
}

/// Chat found in a bot update: id plus a human name for the UI.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub struct DetectedChat {
    pub id: String,
    pub title: String,
    /// "private" | "group" | "supergroup" | "channel"
    pub kind: String,
}

/// Extracts the chat of any update kind: private/group messages, channel
/// posts (a bot in a channel never gets `message`), edits, and the
/// `my_chat_member` event fired when the bot is added to a group/channel.
fn chat_from_update(upd: &serde_json::Value) -> Option<DetectedChat> {
    const KEYS: [&str; 5] = [
        "message",
        "channel_post",
        "edited_message",
        "edited_channel_post",
        "my_chat_member",
    ];
    KEYS.iter().find_map(|k| {
        let chat = &upd[*k]["chat"];
        let id = chat["id"].as_i64()?;
        let title = chat["title"]
            .as_str()
            .map(str::to_string)
            .or_else(|| chat["username"].as_str().map(|u| format!("@{u}")))
            .or_else(|| chat["first_name"].as_str().map(str::to_string))
            .unwrap_or_default();
        Some(DetectedChat {
            id: id.to_string(),
            title,
            kind: chat["type"].as_str().unwrap_or("").to_string(),
        })
    })
}

/// Latest chat that interacted with the bot (newest update first). Used by
/// Settings → "Detectar" so admins don't have to call getUpdates by hand.
pub async fn detect_latest_chat(token: &str) -> Result<Option<DetectedChat>, String> {
    if token.is_empty() {
        return Err("Token de bot vacío".to_string());
    }
    let url = format!("https://api.telegram.org/bot{token}/getUpdates?limit=20&offset=-20");
    let response = TELEGRAM_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Error al contactar con Telegram: {e}"))?;
    let status = response.status();
    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() || !json["ok"].as_bool().unwrap_or(false) {
        let desc = json["description"].as_str().unwrap_or("error desconocido");
        return Err(if status.as_u16() == 401 || status.as_u16() == 404 {
            "El token del bot no es válido. Cópialo de nuevo desde @BotFather.".to_string()
        } else if status.as_u16() == 409 {
            "El bot tiene un webhook activo, así que Telegram no deja leer sus mensajes. Quítalo o escribe el chat ID a mano.".to_string()
        } else {
            format!("Telegram ha respondido: {desc}")
        });
    }
    Ok(json["result"]
        .as_array()
        .and_then(|arr| arr.iter().rev().find_map(chat_from_update)))
}

/// Telegram caption hard limit for `sendPhoto`. `sendMessage` allows 4096
/// but anything attached to a media has to fit in this window or the API
/// rejects the whole request with `MEDIA_CAPTION_TOO_LONG`.
pub const TELEGRAM_CAPTION_LIMIT: usize = 1024;

/// Trim a caption to at most `TELEGRAM_CAPTION_LIMIT` UTF-8 chars. Tries to
/// cut at the last newline before the limit so we don't slice an open HTML
/// tag in half; falls back to a hard char cut. Appends `…` when trimmed.
fn truncate_caption(caption: &str) -> String {
    if caption.chars().count() <= TELEGRAM_CAPTION_LIMIT {
        return caption.to_string();
    }
    // Reserve 1 char for the ellipsis.
    let budget = TELEGRAM_CAPTION_LIMIT - 1;
    let prefix: String = caption.chars().take(budget).collect();
    let cut_at = prefix.rfind('\n').unwrap_or(prefix.len());
    let mut out = prefix[..cut_at].to_string();
    out.push('…');
    out
}

/// Sends a photo to a Telegram channel/chat via a bot.
///
/// Downloads the image from `photo_url` first and uploads it as multipart, so
/// we don't depend on Telegram's servers being able to reach the source URL
/// (which fails intermittently for image.tmdb.org with `WEBPAGE_CURL_FAILED`).
///
/// Caption is auto-trimmed to Telegram's 1024-char limit. On non-2xx response
/// the Telegram error `description` is logged and returned as `Err` so the
/// caller can choose a fallback (e.g. send the full text as a plain message).
pub async fn send_photo(token: &str, chat_id: &str, photo_url: &str, caption: &str) -> Result<(), String> {
    if token.is_empty() || chat_id.is_empty() {
        return Err("Telegram token and chat_id must not be empty".to_string());
    }

    let image_bytes = TELEGRAM_CLIENT
        .get(photo_url)
        .send()
        .await
        .map_err(|e| format!("Poster download failed ({photo_url}): {e}"))?
        .error_for_status()
        .map_err(|e| format!("Poster download non-2xx ({photo_url}): {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Poster body read failed: {e}"))?;

    let caption_trimmed = truncate_caption(caption);

    let part = reqwest::multipart::Part::bytes(image_bytes.to_vec())
        .file_name("poster.jpg")
        .mime_str("image/jpeg")
        .map_err(|e| format!("Multipart part init failed: {e}"))?;
    let form = reqwest::multipart::Form::new()
        .text("chat_id", chat_id.to_string())
        .text("caption", caption_trimmed.clone())
        .text("parse_mode", "HTML".to_string())
        .part("photo", part);

    let url = format!("https://api.telegram.org/bot{token}/sendPhoto");
    let response = TELEGRAM_CLIENT
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Telegram photo request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        let description = serde_json::from_str::<serde_json::Value>(&body_text)
            .ok()
            .and_then(|v| v["description"].as_str().map(str::to_string))
            .unwrap_or_else(|| body_text.clone());
        let caption_preview: String = caption_trimmed.chars().take(80).collect();
        eprintln!(
            "[telegram] sendPhoto failed (chat_id={chat_id} status={status}): {description} \
             (caption_len={} preview={:?})",
            caption_trimmed.chars().count(),
            caption_preview,
        );
        return Err(format!("Telegram sendPhoto {status}: {description}"));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_from_channel_post() {
        let upd = serde_json::json!({
            "update_id": 1,
            "channel_post": {"chat": {"id": -1001234567890_i64, "title": "Estrenos", "type": "channel"}}
        });
        let c = chat_from_update(&upd).expect("chat");
        assert_eq!(c.id, "-1001234567890");
        assert_eq!(c.title, "Estrenos");
        assert_eq!(c.kind, "channel");
    }

    #[test]
    fn chat_from_bot_added_to_group() {
        let upd = serde_json::json!({
            "update_id": 2,
            "my_chat_member": {"chat": {"id": -4242, "title": "Familia", "type": "group"}}
        });
        assert_eq!(chat_from_update(&upd).map(|c| c.id), Some("-4242".to_string()));
    }

    #[test]
    fn chat_from_private_message() {
        let upd = serde_json::json!({
            "update_id": 3,
            "message": {"chat": {"id": 99, "first_name": "Alex", "type": "private"}}
        });
        let c = chat_from_update(&upd).expect("chat");
        assert_eq!((c.id.as_str(), c.title.as_str()), ("99", "Alex"));
    }

    #[test]
    fn humanizes_common_errors() {
        assert!(humanize_error(400, "Bad Request: chat not found").contains("Chat ID"));
        assert!(humanize_error(401, "Unauthorized").contains("token"));
        assert!(humanize_error(403, "Forbidden: bot is not a member of the channel chat").contains("administrador"));
        assert!(humanize_error(400, "Bad Request: something new").contains("something new"));
    }

    #[test]
    fn truncate_caption_keeps_short_text() {
        assert_eq!(truncate_caption("hola"), "hola");
    }
}
