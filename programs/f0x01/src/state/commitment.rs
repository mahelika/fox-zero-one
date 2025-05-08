use anchor_lang::prelude::*;

#[account]
pub struct FocusCommitment {
    pub user: Pubkey,
    pub bump: u8,
    pub commitment_id: u64,  
    pub amount_staked: u64,
    pub sessions_per_day: u8,
    pub total_days: u8,
    pub start_timestamp: i64,
    pub days_completed: u8,
    pub is_active: bool,
    pub last_session_timestamp: i64,
    pub sessions_completed_today: u8,
}