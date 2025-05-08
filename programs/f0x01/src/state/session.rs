use anchor_lang::prelude::*;

#[account]
pub struct SessionRecord {
    pub user: Pubkey, //32
    pub commitment: Pubkey, //32
    pub bump: u8, //1
    pub session_number: u64, //8
    pub start_timestamp: i64, //8
    pub completed: bool, //1
    pub verification_slot: u64,  // 8 (slot for verification)
    pub end_timestamp: i64, //8
}

impl SessionRecord {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 1 + 8 + 8;
}