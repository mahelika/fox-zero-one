use anchor_lang::prelude::*;
use crate::state::*;
// use crate::error::*;

#[derive(Accounts)]
pub struct CreateUserProfile<'info> {
    #[account(
        init,
        payer = user,
        space = UserProfile::SPACE,
        seeds = [b"user_profile", user.key().as_ref()],
        bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    #[account(mut)]
    pub focus_program: Account<'info, FocusProgram>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_user_profile(ctx: Context<CreateUserProfile>) -> Result<()> {
    let user_profile = &mut ctx.accounts.user_profile;
    user_profile.user = ctx.accounts.user.key();
    user_profile.bump = ctx.bumps.user_profile;
    user_profile.total_sessions_completed = 0;
    user_profile.total_rewards_earned = 0;
    user_profile.current_streak = 0;
    user_profile.best_streak = 0;
    user_profile.last_active_day = Clock::get()?.unix_timestamp;
    
    let program = &mut ctx.accounts.focus_program;
    program.total_users = program.total_users.checked_add(1).unwrap();
    
    Ok(())
}