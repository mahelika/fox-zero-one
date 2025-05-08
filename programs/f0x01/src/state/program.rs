use anchor_lang::prelude::*;

#[account]
pub struct FocusProgram {
    pub authority: Pubkey, //32
    pub bump: u8, //1
    pub total_users: u64, //8
    pub total_staked: u64, //8
    pub reward_rate: u64,  // reward multiplier for successful completion (8)
    pub focus_token_mint: Pubkey, //32
}

impl FocusProgram {
    pub const SPACE: usize = 8 + 32 + 1 + 8 + 8 + 8 + 32;
}