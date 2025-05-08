use anchor_lang::prelude::*;

#[account]
pub struct FocusProgram {
    pub authority: Pubkey,
    pub bump: u8,
    pub total_users: u64,
    pub total_staked: u64,
    pub reward_rate: u64,  // reward multiplier for successful completion
    pub focus_token_mint: Pubkey,
}