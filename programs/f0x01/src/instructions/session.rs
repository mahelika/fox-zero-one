use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
#[instruction(session_id: u64)]
pub struct StartSession<'info> {
    #[account(
        mut,
        seeds = [b"commitment", user.key().as_ref(), &commitment.commitment_id.to_le_bytes()],
        bump = commitment.bump,
        constraint = commitment.user == user.key() @ FocusError::InvalidAuthority
    )]
    pub commitment: Account<'info, FocusCommitment>,
    
    #[account(
        init,
        payer = user,
        space = SessionRecord::SPACE,
        seeds = [b"session", commitment.key().as_ref(), &session_id.to_le_bytes()],
        bump
    )]
    pub session_record: Account<'info, SessionRecord>,
    
    #[account(
        mut,
        seeds = [b"user_profile", user.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn start_session(ctx: Context<StartSession>, session_id: u64) -> Result<()> {
    let commitment = &mut ctx.accounts.commitment;
    require!(commitment.is_active, FocusError::CommitmentInactive);
    
    // calculate current day based on start time
    let current_timestamp = Clock::get()?.unix_timestamp;
    let day_in_seconds = 86400;
    let days_elapsed = ((current_timestamp - commitment.start_timestamp) / day_in_seconds) as u8;
    
    require!(days_elapsed < commitment.total_days, FocusError::CommitmentEnded);
    
    // check if we're in a new day
    if days_elapsed > commitment.days_completed {
        commitment.days_completed = days_elapsed;
        commitment.sessions_completed_today = 0;
    }
    
    // check if user already completed all sessions for today
    require!(
        commitment.sessions_completed_today < commitment.sessions_per_day,
        FocusError::DailySessionsCompleted
    );
    
    // check if enough time has passed since last session
    if commitment.last_session_timestamp > 0 {
        let min_time_between_sessions = 30 * 60; // 30 minutes in seconds
        require!(
            current_timestamp - commitment.last_session_timestamp >= min_time_between_sessions,
            FocusError::SessionTooSoon
        );
    }
    
    // create new session record
    let session_record = &mut ctx.accounts.session_record;
    session_record.user = ctx.accounts.user.key();
    session_record.commitment = commitment.key();
    session_record.bump = ctx.bumps.session_record;
    session_record.session_number = session_id;
    session_record.start_timestamp = current_timestamp;
    session_record.completed = false;
    session_record.verification_slot = Clock::get()?.slot;
    session_record.end_timestamp = 0;
    
    Ok(())
}

#[derive(Accounts)]
pub struct CompleteSession<'info> {
    #[account(
        mut,
        seeds = [b"session", commitment.key().as_ref(), &session_record.session_number.to_le_bytes()],
        bump = session_record.bump,
        constraint = session_record.user == user.key() @ FocusError::InvalidAuthority
    )]
    pub session_record: Account<'info, SessionRecord>,
    
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
    pub user: Signer<'info>,
}

pub fn complete_session(ctx: Context<CompleteSession>) -> Result<()> {
    let session_record = &mut ctx.accounts.session_record;
    let commitment = &mut ctx.accounts.commitment;
    let user_profile = &mut ctx.accounts.user_profile;
    
    // verify session wasn't already completed
    require!(!session_record.completed, FocusError::SessionAlreadyCompleted);
    
    // verify that enough time has passed (25 min focus + 5 min break + 25 min focus = 55 min)
    let current_timestamp = Clock::get()?.unix_timestamp;
    let session_duration = 55 * 60; // 55 minutes in seconds
    require!(
        current_timestamp - session_record.start_timestamp >= session_duration,
        FocusError::SessionNotComplete
    );
    
    // use solana's slot timing for additional verification
    let current_slot = Clock::get()?.slot;
    let slot_difference = current_slot - session_record.verification_slot;
    let expected_slots = (session_duration as u64) / 400; // approx slots in 55 minutes
    require!(
        slot_difference >= expected_slots.saturating_sub(10), // allow small tolerance
        FocusError::SlotVerificationFailed
    );
    
    // mark session as completed
    session_record.completed = true;
    session_record.end_timestamp = current_timestamp;
    commitment.last_session_timestamp = current_timestamp;
    commitment.sessions_completed_today += 1;
    
    // update user profile stats
    user_profile.total_sessions_completed += 1;
    
    // update streak logic
    let day_in_seconds = 86400;
    let today_timestamp = (current_timestamp / day_in_seconds) * day_in_seconds;
    let last_active_day_timestamp = (user_profile.last_active_day / day_in_seconds) * day_in_seconds;
    
    if today_timestamp > last_active_day_timestamp {
        // check if this is consecutive day (yesterday)
        if today_timestamp - last_active_day_timestamp <= day_in_seconds {
            user_profile.current_streak += 1;
            if user_profile.current_streak > user_profile.best_streak {
                user_profile.best_streak = user_profile.current_streak;
            }
        } else {
            // streak broken
            user_profile.current_streak = 1;
        }
        user_profile.last_active_day = today_timestamp;
    }
    
    Ok(())
}