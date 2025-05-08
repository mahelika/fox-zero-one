use anchor_lang::prelude::*;

#[error_code]
pub enum FocusError {
    #[msg("invalid number of sessions per day")]
    InvalidSessionCount,
    #[msg("invalid number of days for commitment")]
    InvalidDayCount,
    #[msg("commitment is no longer active")]
    CommitmentInactive,
    #[msg("commitment period has ended")]
    CommitmentEnded,
    #[msg("all daily sessions are already completed")]
    DailySessionsCompleted,
    #[msg("not enough time has passed since last session")]
    SessionTooSoon,
    #[msg("session is already marked as completed")]
    SessionAlreadyCompleted,
    #[msg("session duration requirement not met")]
    SessionNotComplete,
    #[msg("slot-based verification failed")]
    SlotVerificationFailed,
    #[msg("commitment period has not ended yet")]
    CommitmentNotEnded,
    #[msg("insufficient balance")]
    InsufficientBalance,
    #[msg("invalid authority")]
    InvalidAuthority,
}