use anchor_lang::prelude::*;

// utility functions that might be needed across instructions
pub fn get_current_day_timestamp() -> Result<i64> {
    let timestamp = Clock::get()?.unix_timestamp;
    let day_in_seconds = 86400;
    Ok((timestamp / day_in_seconds) * day_in_seconds)
}