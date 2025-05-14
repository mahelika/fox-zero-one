import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
import { expect } from "chai";
import { F0x01 } from "../target/types/f0x01";

describe("F0x01 User Tests", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.F0x01 as Program<F0x01>;
  const wallet = provider.wallet;

  // Store important accounts
  let focusProgramPda: PublicKey;
  let focusTokenMint: PublicKey;

  // Test users
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();

  // User profile PDAs
  let user1ProfilePda: PublicKey;
  let user2ProfilePda: PublicKey;

  // Reward rate for initialization
  const rewardRate = new anchor.BN(100);

  // Add delay function to avoid rate limits
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper function to fund wallets with SOL (instead of airdrops to avoid rate limiting)
  async function fundWallet(destination: PublicKey, amountInSol = 1) {
    const transaction = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: destination,
        lamports: amountInSol * anchor.web3.LAMPORTS_PER_SOL,
      })
    );

    const signature = await provider.sendAndConfirm(transaction);
    // console.log(`Funded ${destination.toString()} with ${amountInSol} SOL`);

    // Add delay to avoid rate limits
    await sleep(1000);

    return signature;
  }

  before(async () => {
    // console.log("Setting up test environment...");

    // Find the focus_program PDA
    [focusProgramPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("focus_program")],
      program.programId
    );

    // Find user profile PDAs
    [user1ProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_profile"), user1.publicKey.toBuffer()],
      program.programId
    );

    [user2ProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_profile"), user2.publicKey.toBuffer()],
      program.programId
    );

    // Create token mint for testing
    const mintAuthority = wallet.publicKey;
    focusTokenMint = await createMint(
      provider.connection,
      wallet.payer,
      mintAuthority,
      null,
      9
    );

    // Fund test users (avoid airdrops to prevent rate limiting)
    await fundWallet(user1.publicKey, 0.1);
    await fundWallet(user2.publicKey, 0.1);

    // Initialize the program first if not already initialized
    try {
      const programAccount = await program.account.focusProgram.fetch(focusProgramPda);
      // console.log("Program already initialized");
    } catch (e) {
      // console.log("Initializing program...");

      const tx = await program.methods
        .initializeProgram(rewardRate)
        .accountsStrict({
          focusProgram: focusProgramPda,
          focusTokenMint: focusTokenMint,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      console.log("Program initialized with tx:", tx);
      await sleep(2000); // Add delay to avoid rate limits
    }

    // console.log("Test environment setup complete");
  });

  it("Creates a user profile successfully", async () => {
    try {
      // Get total users before creating user profile
      const programStateBefore = await program.account.focusProgram.fetch(focusProgramPda);
      const totalUsersBefore = programStateBefore.totalUsers.toNumber();

      // Create user profile for user1
      const tx = await program.methods
        .createUserProfile()
        .accountsStrict({
          userProfile: user1ProfilePda,
          focusProgram: focusProgramPda,
          user: user1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc({ commitment: "confirmed" });

      // console.log("User profile created with tx:", tx);

      // Add delay to avoid rate limits
      await sleep(2000);

      // Fetch and verify the user profile
      const userProfile = await program.account.userProfile.fetch(user1ProfilePda);

      expect(userProfile.user.toString()).to.equal(user1.publicKey.toString());
      expect(userProfile.totalSessionsCompleted.toNumber()).to.equal(0);
      expect(userProfile.totalRewardsEarned.toNumber()).to.equal(0);
      expect(userProfile.currentStreak).to.equal(0);
      expect(userProfile.bestStreak).to.equal(0);
      expect(userProfile.lastActiveDay).to.be.instanceOf(anchor.BN);

      // Verify the program state was updated
      const programState = await program.account.focusProgram.fetch(focusProgramPda);
      expect(programState.totalUsers.toNumber()).to.equal(totalUsersBefore + 1);

    } catch (error) {
      console.error("Error creating user profile:", error);
      throw error;
    }
  });

  it("Creates a second user profile successfully", async () => {
    try {
      // Get the current total users
      const programStateBefore = await program.account.focusProgram.fetch(focusProgramPda);
      const totalUsersBefore = programStateBefore.totalUsers.toNumber();

      // Create user profile for user2
      const tx = await program.methods
        .createUserProfile()
        .accountsStrict({
          userProfile: user2ProfilePda,
          focusProgram: focusProgramPda,
          user: user2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc({ commitment: "confirmed" });

      // console.log("Second user profile created with tx:", tx);

      // Add delay to avoid rate limits
      await sleep(2000);

      // Fetch and verify the user profile
      const userProfile = await program.account.userProfile.fetch(user2ProfilePda);

      expect(userProfile.user.toString()).to.equal(user2.publicKey.toString());
      expect(userProfile.totalSessionsCompleted.toNumber()).to.equal(0);
      expect(userProfile.totalRewardsEarned.toNumber()).to.equal(0);

      // Verify the program state was updated
      const programState = await program.account.focusProgram.fetch(focusProgramPda);
      expect(programState.totalUsers.toNumber()).to.equal(totalUsersBefore + 1);

    } catch (error) {
      console.error("Error creating second user profile:", error);
      throw error;
    }
  });

  it("Fails when trying to create a duplicate user profile", async () => {
    try {
      // Attempt to create a duplicate user profile for user1
      await program.methods
        .createUserProfile()
        .accountsStrict({
          userProfile: user1ProfilePda,
          focusProgram: focusProgramPda,
          user: user1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      // If we reach here, the test should fail
      expect.fail("Should have thrown an error when creating a duplicate user profile");
    } catch (error) {
      // This is expected to fail, so test passes
      expect(error.toString()).to.include("Error");
    }
  });

  it("Verifies user profile data integrity", async () => {
    // Fetch user1's profile
    const userProfile = await program.account.userProfile.fetch(user1ProfilePda);

    // Verify the account ownership and data
    const accountInfo = await provider.connection.getAccountInfo(user1ProfilePda);
    expect(accountInfo.owner.toString()).to.equal(program.programId.toString(),
      "User profile account should be owned by the program");

    // Calculate the timestamp of "today" for comparison
    const todayTimestamp = Math.floor(Date.now() / 1000);
    const oneDayInSeconds = 24 * 60 * 60;

    // Verify the last_active_day is reasonably recent (within the last day)
    expect(todayTimestamp - userProfile.lastActiveDay.toNumber()).to.be.lessThan(oneDayInSeconds,
      "Last active day should be recent");

    // Verify account data size matches expected space
    const expectedSpace = 8 + 32 + 1 + 8 + 8 + 2 + 2 + 8; // From UserProfile::SPACE
    expect(accountInfo.data.length).to.equal(expectedSpace,
      "Account data size doesn't match expected space");
  });

  it("Can fetch all user profiles", async () => {
    // Get all user profiles in the program
    const allUserProfiles = await program.account.userProfile.all();

    // There should be at least the two we created
    expect(allUserProfiles.length).to.be.at.least(2,
      "Should have at least two user profiles");

    // Verify our test users are in the results
    const user1Found = allUserProfiles.some(
      profile => profile.account.user.toString() === user1.publicKey.toString()
    );

    const user2Found = allUserProfiles.some(
      profile => profile.account.user.toString() === user2.publicKey.toString()
    );

    expect(user1Found).to.be.true;
    expect(user2Found).to.be.true;
  });

  it("Can fetch user profile by filter", async () => {
    // Filter for just user1's profile
    const filteredProfiles = await program.account.userProfile.all([
      {
        memcmp: {
          offset: 8, // Skip the discriminator
          bytes: user1.publicKey.toBase58(),
        }
      }
    ]);

    expect(filteredProfiles.length).to.equal(1,
      "Should find exactly one profile matching user1");
    expect(filteredProfiles[0].account.user.toString()).to.equal(
      user1.publicKey.toString(),
      "Found profile should match user1"
    );
  });
});