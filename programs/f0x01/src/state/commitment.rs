use anchor_lang::prelude::*;

#[account]
pub struct FocusCommitment {
    pub user: Pubkey, //32
    pub bump: u8, //1
    pub commitment_id: u64, //8
    pub amount_staked: u64, //8
    pub sessions_per_day: u8, //1
    pub total_days: u8, //1
    pub start_timestamp: i64, //8
    pub days_completed: u8, //1
    pub is_active: bool, //1
    pub last_session_timestamp: i64, //8
    pub sessions_completed_today: u8, //1
}

impl FocusCommitment {
    pub const SPACE: usize = 8 + 32 + 1 + 8 + 8 + 1 + 1 + 8 + 1 + 1 + 8 + 1;
}