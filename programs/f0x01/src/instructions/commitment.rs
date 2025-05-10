use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::error::*;
//create_commitment, claim_rewards

#[derive(Accounts)]
#[instruction(commitment_id: u64)]
pub struct CreateCommitment<'info> {
    #[account(
        init,
        payer = user,
        space = FocusCommitment::SPACE,
        seeds = [b"commitment", user.key().as_ref(), &commitment_id.to_le_bytes()],
        bump
    )]
    pub commitment: Account<'info, FocusCommitment>,
    
    #[account(
        mut,
        seeds = [b"user_profile", user.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    
    #[account(mut)]
    pub focus_program: Account<'info, FocusProgram>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == focus_program.focus_token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"vault", user.key().as_ref(), &commitment_id.to_le_bytes()],
        bump,
        token::mint = token_mint,
        token::authority = vault_authority
    )]
    pub vault: Account<'info, TokenAccount>,
    
    /// CHECK: this is a PDA that acts as the vault authority and doesn't need type checking
    /// as it's not expected to be a deserialized account with specific data
    #[account(
        seeds = [b"vault_authority"],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    #[account(address = focus_program.focus_token_mint)]
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn create_commitment(
    ctx: Context<CreateCommitment>,
    commitment_id: u64,
    amount: u64,
    sessions_per_day: u8,
    total_days: u8,
) -> Result<()> {
    require!(sessions_per_day > 0 && sessions_per_day <= 10, FocusError::InvalidSessionCount);
    require!(total_days > 0 && total_days <= 30, FocusError::InvalidDayCount);
    
    //transfer tokens to PDA vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;
    
    //initialize commitment state
    let commitment = &mut ctx.accounts.commitment;
    commitment.user = ctx.accounts.user.key();
    commitment.bump = ctx.bumps.commitment;
    commitment.commitment_id = commitment_id;
    commitment.amount_staked = amount;
    commitment.sessions_per_day = sessions_per_day;
    commitment.total_days = total_days;
    commitment.start_timestamp = Clock::get()?.unix_timestamp;
    commitment.days_completed = 0;
    commitment.is_active = true;
    commitment.last_session_timestamp = 0;
    commitment.sessions_completed_today = 0;
    
    //update program state
    let program = &mut ctx.accounts.focus_program;
    program.total_staked = program.total_staked.checked_add(amount).unwrap();
    
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(
        mut,
        seeds = [b"commitment", user.key().as_ref(), &commitment.commitment_id.to_le_bytes()],
        bump = commitment.bump,
        constraint = commitment.user == user.key() @ FocusError::InvalidAuthority
    )]
    pub commitment: Account<'info, FocusCommitment>,
    
    #[account(
        mut,
        seeds = [b"user_profile", user.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    
    #[account(mut)]
    pub focus_program: Account<'info, FocusProgram>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == focus_program.focus_token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref(), &commitment.commitment_id.to_le_bytes()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    /// CHECK: this is a PDA that acts as the vault authority and doesn't need type checking
    /// as it's used only as a signer for token transfers
    #[account(
        seeds = [b"vault_authority"],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
    let commitment = &mut ctx.accounts.commitment;
    let user_profile = &mut ctx.accounts.user_profile;
    
    //verifyif the commitment has ended
    let current_timestamp = Clock::get()?.unix_timestamp;
    let day_in_seconds = 86400;
    let days_elapsed = ((current_timestamp - commitment.start_timestamp) / day_in_seconds) as u8;
    
    require!(days_elapsed >= commitment.total_days, FocusError::CommitmentNotEnded);
    require!(commitment.is_active, FocusError::CommitmentInactive);
    
    //calculate success rate
    let total_expected_sessions = commitment.sessions_per_day * commitment.total_days;
    let total_completed_sessions = user_profile.total_sessions_completed;
    let success_rate = (total_completed_sessions as f64) / (total_expected_sessions as f64);
    
    //calculate reward amount
    let program = &ctx.accounts.focus_program;
    let reward_amount = if success_rate >= 0.9 {
        //complete reward + bonus for 90%+ completion
        let base_reward = commitment.amount_staked;
        let bonus = (base_reward * program.reward_rate) / 100;
        base_reward.checked_add(bonus).unwrap()
    } else if success_rate >= 0.75 {
        //return original stake for 75%+ completion
        commitment.amount_staked
    } else {
        //partial refund for less than 75% completion
        (commitment.amount_staked * 75) / 100
    };
    
    //transfer reward tokens back to user
    let seeds = &[
        b"vault_authority".as_ref(),
        &[ctx.bumps.vault_authority],
    ];
    let signer = &[&seeds[..]];
    
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::transfer(cpi_ctx, reward_amount)?;
    
    //update state
    commitment.is_active = false;
    user_profile.total_rewards_earned = user_profile.total_rewards_earned.checked_add(reward_amount).unwrap();
    
    //update the program state
    let program = &mut ctx.accounts.focus_program;
    program.total_staked = program.total_staked.checked_sub(commitment.amount_staked).unwrap();
    
    Ok(())
}