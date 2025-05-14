#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

use crate::instructions::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use state::*;

declare_id!("5zbzYLKziAmPUMv25xHo4XWkbbAsp21q6D5EM7J9c6r6");

#[program]
pub mod f0x01 {
    use super::*;

    // pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    //     initialize::handler(ctx)
    // }

    pub fn initialize_program(ctx: Context<InitializeProgram>, reward_rate: u64) -> Result<()> {
        instructions::initialize_program(ctx, reward_rate)
    }

     pub fn create_user_profile(ctx: Context<CreateUserProfile>) -> Result<()> {
        instructions::user::create_user_profile(ctx)
    }

      pub fn create_commitment(
        ctx: Context<CreateCommitment>,
        commitment_id: u64,
        amount: u64,
        sessions_per_day: u8,
        total_days: u8,
    ) -> Result<()> {
        instructions::commitment::create_commitment(ctx, commitment_id, amount, sessions_per_day, total_days)
    }

     pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        instructions::commitment::claim_rewards(ctx)
    }

    //session management
    pub fn start_session(ctx: Context<StartSession>, session_id: u64) -> Result<()> {
        instructions::session::start_session(ctx, session_id)
    }

    pub fn complete_session(ctx: Context<CompleteSession>) -> Result<()> {
        instructions::session::complete_session(ctx)
    }

}
