//! In-memory login rate-limit / lockout.
//!
//! Tracks failed login attempts per `(email, ip)` pair. After
//! `MAX_FAILURES_PER_WINDOW` failures within `FAILURE_WINDOW`, the pair is
//! locked out for `LOCKOUT_DURATION`. A successful login clears the entry.
//!
//! Lives in process memory only — a server restart resets all counters.
//! That's acceptable: it stops password-spray bots, not determined attackers
//! with persistent infrastructure. For the latter, persistence + per-IP
//! global limits should be layered on at the reverse proxy.

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;

const MAX_FAILURES_PER_WINDOW: u32 = 5;
const FAILURE_WINDOW: Duration = Duration::from_secs(5 * 60); // 5 min
const LOCKOUT_DURATION: Duration = Duration::from_secs(15 * 60); // 15 min

#[derive(Debug, Clone)]
struct FailureRecord {
    count: u32,
    first_failure: Instant,
    locked_until: Option<Instant>,
}

static FAILED_LOGINS: Lazy<Mutex<HashMap<(String, IpAddr), FailureRecord>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Returns `Err(retry_after)` when the (email, ip) pair is currently locked.
pub fn check_login_allowed(email: &str, ip: IpAddr) -> Result<(), Duration> {
    let mut map = FAILED_LOGINS.lock().unwrap();
    let key = (email.to_lowercase(), ip);
    let now = Instant::now();

    if let Some(rec) = map.get(&key) {
        if let Some(until) = rec.locked_until {
            if now < until {
                return Err(until - now);
            }
        }
    }
    // Drop stale entries opportunistically to keep the map bounded.
    map.retain(|_, rec| {
        rec.locked_until.map_or(false, |u| now < u)
            || now.duration_since(rec.first_failure) < FAILURE_WINDOW
    });
    Ok(())
}

/// Record a failed login. Locks the pair out if the threshold is hit.
pub fn record_failure(email: &str, ip: IpAddr) {
    let mut map = FAILED_LOGINS.lock().unwrap();
    let key = (email.to_lowercase(), ip);
    let now = Instant::now();

    let rec = map.entry(key).or_insert(FailureRecord {
        count: 0,
        first_failure: now,
        locked_until: None,
    });

    if now.duration_since(rec.first_failure) > FAILURE_WINDOW {
        rec.count = 0;
        rec.first_failure = now;
        rec.locked_until = None;
    }

    rec.count += 1;
    if rec.count >= MAX_FAILURES_PER_WINDOW {
        rec.locked_until = Some(now + LOCKOUT_DURATION);
    }
}

/// Clear failure history for the pair (call on successful login).
pub fn clear(email: &str, ip: IpAddr) {
    let mut map = FAILED_LOGINS.lock().unwrap();
    map.remove(&(email.to_lowercase(), ip));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    // The failure map is process-global, so each test uses its own email.
    fn ip(last: u8) -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(10, 0, 0, last))
    }

    #[test]
    fn locks_after_the_fifth_failure() {
        let email = "lock@test.local";
        for _ in 0..MAX_FAILURES_PER_WINDOW - 1 {
            record_failure(email, ip(1));
            assert!(check_login_allowed(email, ip(1)).is_ok());
        }
        record_failure(email, ip(1));
        let retry = check_login_allowed(email, ip(1)).expect_err("should be locked");
        assert!(retry <= LOCKOUT_DURATION && retry > LOCKOUT_DURATION - Duration::from_secs(60));
    }

    #[test]
    fn lock_is_per_email_and_ip_and_ignores_email_case() {
        let email = "Case@Test.local";
        for _ in 0..MAX_FAILURES_PER_WINDOW {
            record_failure(email, ip(2));
        }
        assert!(check_login_allowed("case@test.local", ip(2)).is_err());
        assert!(check_login_allowed(email, ip(3)).is_ok(), "another IP is not locked");
        assert!(check_login_allowed("other@test.local", ip(2)).is_ok(), "another email is not locked");
    }

    #[test]
    fn successful_login_clears_the_counter() {
        let email = "clear@test.local";
        for _ in 0..MAX_FAILURES_PER_WINDOW {
            record_failure(email, ip(4));
        }
        assert!(check_login_allowed(email, ip(4)).is_err());
        clear(email, ip(4));
        assert!(check_login_allowed(email, ip(4)).is_ok());
        // Counting starts again from zero.
        record_failure(email, ip(4));
        assert!(check_login_allowed(email, ip(4)).is_ok());
    }
}
