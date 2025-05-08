use anchor_lang::prelude::*;

#[account]
pub struct UserProfile {
    pub user: Pubkey, //32
    pub bump: u8, //1
    pub total_sessions_completed: u64, //8
    pub total_rewards_earned: u64, //8
    pub current_streak: u16, //2
    pub best_streak: u16, //2
    pub last_active_day: i64,  // unix timestamp of last active day (8)
}

impl UserProfile {
    pub const SPACE: usize = 8 + 32 + 1 + 8 + 8 + 2 + 2 + 8;
}