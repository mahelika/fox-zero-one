use anchor_lang::prelude::*;

#[account]
pub struct SessionRecord {
    pub user: Pubkey,
    pub commitment: Pubkey,
    pub bump: u8,
    pub session_number: u64,
    pub start_timestamp: i64,
    pub completed: bool,
    pub verification_slot: u64,  // slot for verification
    pub end_timestamp: i64,      
}