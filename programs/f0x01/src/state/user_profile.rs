use anchor_lang::prelude::*;

#[account]
pub struct UserProfile {
    pub user: Pubkey,
    pub bump: u8,
    pub total_sessions_completed: u64,
    pub total_rewards_earned: u64,
    pub current_streak: u16,
    pub best_streak: u16,
    pub last_active_day: i64,  // unix timestamp of last active day
}