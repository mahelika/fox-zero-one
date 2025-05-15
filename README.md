# F0x01 - Decentralized Pomodoro Protocol

F0x01 (pronounced "fox-zero-one") is a decentralized Pomodoro protocol built on Solana that uses financial incentives to encourage focused work. It enables users to create time-based focus commitments, stake tokens, track completed Pomodoro sessions, and earn rewards based on their commitment fulfillment.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/mahelika/fox-zero-one.git
cd f0x01

# Install dependencies
npm install

# Build the program
anchor build

# Run tests
anchor test
```

## 🚀 Overview

F0x01 incentivizes productive behavior through a token staking mechanism:

- **Create Commitments**: Stake tokens against your productivity goals
- **Complete Pomodoro Sessions**: Track 55-minute focus sessions on-chain
- **Earn Rewards**: Receive your stake back plus bonus rewards for high completion rates
- **Build Streaks**: Maintain and track daily activity streaks

## 🌐 Deployments

- **Devnet**: [5zbzYLKziAmPUMv25xHo4XWkbbAsp21q6D5EM7J9c6r6](https://explorer.solana.com/address/5zbzYLKziAmPUMv25xHo4XWkbbAsp21q6D5EM7J9c6r6?cluster=devnet)


## 🏗️ Architecture

The protocol consists of the following main components:

### Program State

- `FocusProgram`: Global program state tracking total users, total staked amount, and reward parameters
- `UserProfile`: Per-user state tracking sessions completed, rewards earned, and activity streaks
- `FocusCommitment`: Individual commitment tracking staked amount and session requirements
- `SessionRecord`: Records of individual Pomodoro sessions

### Instructions

- `initialize_program`: Set up the program with token mint and reward parameters
- `create_user_profile`: Create a new user profile to start participating
- `create_commitment`: Stake tokens against a new productivity commitment
- `start_session`: Begin a new Pomodoro session
- `complete_session`: Verify and record completion of a Pomodoro session
- `claim_rewards`: Claim rewards after completing a commitment

## 🔧 Technical Implementation

FocusChain uses Solana's Program Derived Addresses (PDAs) for secure token custody and verification:

- Token vaults are created for each commitment to securely hold staked tokens
- Sessions require adequate time and slot verification to prevent gaming the system
- Strict time constraints between sessions prevent cheating
- Daily sessions are tracked to ensure consistent productivity

## 💰 Reward Mechanism

Rewards are determined by your fulfillment rate:

- **90%+ completion**: Return of staked amount + bonus reward (based on program reward rate)
- **75-89% completion**: Return of full staked amount
- **<75% completion**: Partial refund (75% of staked amount)

## 🔄 Session Lifecycle

1. Create a user profile to start tracking stats
2. Create a commitment by staking tokens and setting goals (sessions per day, total days)
3. Start daily sessions and complete the required focused work (55 minutes per session)
4. Build streaks by completing sessions across consecutive days
5. Claim rewards after the commitment period ends

## 🧩 Program Architecture

```
lib.rs               # Program entry point and instruction routing
│
├── instructions/    # Program instructions
│   ├── initialize.rs    # Initialize program state
│   ├── user.rs          # User profile management
│   ├── commitment.rs    # Commitment creation and reward claiming
│   └── session.rs       # Session tracking and completion
│
├── state/           # Program state definitions
│   ├── program.rs       # Global program state
│   ├── user_profile.rs  # User-specific state
│   ├── commitment.rs    # Commitment state
│   └── session.rs       # Session state
│
└── error.rs         # Custom program errors
```

## 🛠️ Development Setup

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://www.anchor-lang.com/docs/installation)
- [Node.js](https://nodejs.org/) 

### Project Structure

The project is organized following standard Anchor project structure:

```
f0x01/
├── programs/                 # Program source code
│   └── f0x01/
│       ├── src/
│       │   ├── lib.rs        # Program entry point
│       │   ├── instructions/ # All instructions
│       │   ├── state/        # Program state
│       │   └── error.rs      # Error definitions
│       └── Cargo.toml
├── tests/                    # JavaScript tests
├── migrations/               # Deployment scripts
├── app/                      # Frontend (if applicable)
├── target/                   # Build artifacts
├── .anchor/                  # Anchor configuration
├── Anchor.toml               # Anchor settings
└── package.json              # Project dependencies
```

### Building and Testing

```bash
# Build the program
anchor build

# Run the test suite
anchor test

The test suite includes comprehensive tests for:
- Program initialization
- User profile creation
- Commitment creation and staking
- Session starting and completion
- Reward claiming with different completion rates
- Streak calculation and verification

## 🛠️ Usage

### Creating a Commitment

```typescript
// Create a new commitment with 100 tokens, 4 sessions per day for 7 days
await program.methods
  .createCommitment(
    new BN(commitmentId),
    new BN(100_000_000), // 100 tokens with 6 decimals
    4, // sessions per day
    7  // total days
  )
  .accounts({
    commitment: commitmentPDA,
    userProfile: userProfilePDA,
    focusProgram: focusProgramPDA,
    user: wallet.publicKey,
    userTokenAccount: userTokenAccount,
    vault: vaultPDA,
    vaultAuthority: vaultAuthorityPDA,
    tokenMint: focusTokenMint,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .rpc();
```

### Completing Sessions

```typescript
// Start a new session
await program.methods
  .startSession(new BN(sessionId))
  .accounts({
    commitment: commitmentPDA,
    sessionRecord: sessionPDA,
    userProfile: userProfilePDA,
    user: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

// After 55 minutes, complete the session
await program.methods
  .completeSession()
  .accounts({
    sessionRecord: sessionPDA,
    commitment: commitmentPDA,
    userProfile: userProfilePDA,
    user: wallet.publicKey,
  })
  .rpc();
```

## 📊 Verification Mechanisms

F0x01 implements several verification mechanisms to ensure legitimate session completion:

1. **Time-based verification**: Sessions must last at least 55 minutes
2. **Blockchain slot verification**: Additional verification using Solana slot timing
3. **Session spacing**: Minimum 30-minute gap between sessions
4. **Daily limits**: Maximum sessions per day as defined in commitment

## 🔍 Technical Details

- Sessions are structured as two 25-minute focus periods with a 5-minute break (55 minutes total)
- The protocol uses Solana's native slot timing as an additional verification mechanism
- Activity streaks are tracked and reset based on continuous daily participation
- All token operations use secure PDA-based vaults with proper authority checks

## 🚧 Next Steps

- Frontend UI for easy interaction
- Mobile notifications for session tracking
- Social features for community accountability
- NFT rewards for milestone achievements
- Integration with productivity tools

<!-- ## 🦊 About F0x01

F0x01 (fox-zero-one) combines the Pomodoro productivity technique with blockchain financial incentives. The name reflects our mission to help users maintain singular focus (01) with the cleverness and adaptability of a fox. -->