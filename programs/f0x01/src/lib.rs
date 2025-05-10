pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2UimA9XeFtc4e16WnkwaFkhv8KSQdWr7CGEKk7hDpKea");

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

}
