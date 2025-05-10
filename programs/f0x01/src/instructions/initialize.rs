use anchor_lang::prelude::*;
// use anchor_spl::token::{Mint, Token};
use anchor_spl::token::{Mint, Token};
use crate::state::*;
// use crate::error::*;

#[derive(Accounts)]
pub struct InitializeProgram<'info> {
    #[account(
        init,
        payer = authority,
        space = FocusProgram::SPACE,
        seeds = [b"focus_program"],
        bump
    )]
    pub focus_program: Account<'info, FocusProgram>,
    pub focus_token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_program(ctx: Context<InitializeProgram>, reward_rate: u64) -> Result<()> {
    let program = &mut ctx.accounts.focus_program;
    program.authority = ctx.accounts.authority.key();
    program.bump = ctx.bumps.focus_program;
    program.total_users = 0;
    program.total_staked = 0;
    program.reward_rate = reward_rate;
    program.focus_token_mint = ctx.accounts.focus_token_mint.key();
    
    Ok(())
}