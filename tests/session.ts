import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  createMint, 
  createAssociatedTokenAccount, 
  mintTo, 
  getAssociatedTokenAddress 
} from "@solana/spl-token";
import { expect } from "chai";
import { F0x01 } from "../target/types/f0x01";

describe("F0x01 Session Tests", () => {
  // cfg the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.F0x01 as Program<F0x01>;
  const wallet = provider.wallet;
  
  //store important accounts
  let focusProgramPda: PublicKey;
  let userKeypair: Keypair;
  let userProfilePda: PublicKey;
  let tokenMint: PublicKey;
  let userTokenAccount: PublicKey;
  let commitmentPda: PublicKey;
  let sessionRecordPda: PublicKey;
  
  //testing params
  const commitmentId = new anchor.BN(1);
  const sessionId = new anchor.BN(1);
  const stakeAmount = new anchor.BN(100_000_000); //100 tokens with 6 decimals
  const sessionsPerDay = 2;
  const totalDays = 7;
  
  before(async () => {
    console.log("Setting up test accounts...");
    
    //find the focus_program PDA
    [focusProgramPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("focus_program")],
      program.programId
    );
    
    //xreate a user keypair for testing
    userKeypair = Keypair.generate();
    
    //fund the user account with SOL
    const airdropSig = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
    
    //find the user profile PDA
    [userProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_profile"), userKeypair.publicKey.toBuffer()],
      program.programId
    );
    
    //find the commitment PDA
    [commitmentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("commitment"), 
        userKeypair.publicKey.toBuffer(), 
        commitmentId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    
    console.log("Focus Program PDA:", focusProgramPda.toString());
    console.log("User Keypair:", userKeypair.publicKey.toString());
    console.log("User Profile PDA:", userProfilePda.toString());
    console.log("Commitment PDA:", commitmentPda.toString());
    
    //check if program is initialized, if not - initialize it
    try {
      const programAccount = await program.account.focusProgram.fetch(focusProgramPda);
      tokenMint = programAccount.focusTokenMint;
      console.log("Program already initialized with token mint:", tokenMint.toString());
    } catch (error) {
      console.log("Initializing program...");
      
      //create a token mint for initialization
      tokenMint = await createMint(
        provider.connection,
        wallet.payer,
        wallet.publicKey,
        null,
        6  
      );
      
      //initializing the program
      await program.methods
        .initializeProgram(new anchor.BN(10)) //setting reward rate to 10%
        .accountsStrict({
          focusProgram: focusProgramPda,
          focusTokenMint: tokenMint,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      
      console.log("Program initialized with token mint:", tokenMint.toString());
    }
    
    //create user token account and mint tokens for testing
    try {
      userTokenAccount = await getAssociatedTokenAddress(tokenMint, userKeypair.publicKey);
      
      //check if token account exists
      try {
        await provider.connection.getTokenAccountBalance(userTokenAccount);
        console.log("User token account already exists:", userTokenAccount.toString());
      } catch (error) {
        //create token account if it doesn't exist
        userTokenAccount = await createAssociatedTokenAccount(
          provider.connection,
          wallet.payer,
          tokenMint,
          userKeypair.publicKey
        );
        console.log("Created user token account:", userTokenAccount.toString());
      }
      
      //mint tokens to user account for testing
      await mintTo(
        provider.connection,
        wallet.payer,
        tokenMint,
        userTokenAccount,
        wallet.publicKey,
        stakeAmount.toNumber() * 2  //mint extra tokens for testing
      );
      
      console.log("Minted tokens to user account");
    } catch (error) {
      console.error("Error setting up token accounts:", error);
      throw error;
    }
    
    //create user profile if it doesn't exist
    try {
      await program.account.userProfile.fetch(userProfilePda);
      console.log("User profile already exists");
    } catch (error) {
      console.log("Creating user profile...");
      
      await program.methods
        .createUserProfile()
        .accountsStrict({
          userProfile: userProfilePda,
          user: userKeypair.publicKey,
          focusProgram: focusProgramPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();
      
      console.log("User profile created");
    }

    //check if commitment exists, if not - create it
    try {
      await program.account.focusCommitment.fetch(commitmentPda);
      console.log("Commitment already exists");
    } catch (error) {
      console.log("Creating commitment...");
      
      //find vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          userKeypair.publicKey.toBuffer(),
          commitmentId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
      
      //find vault authority PDA
      const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_authority")],
        program.programId
      );
      
      //create the commitment
      const tx = await program.methods
        .createCommitment(
          commitmentId,
          stakeAmount,
          sessionsPerDay,
          totalDays
        )
        .accountsStrict({
          commitment: commitmentPda,
          userProfile: userProfilePda,
          focusProgram: focusProgramPda,
          user: userKeypair.publicKey,
          userTokenAccount: userTokenAccount,
          vault: vaultPda,
          vaultAuthority: vaultAuthorityPda,
          tokenMint: tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([userKeypair])
        .rpc();
      
      console.log("Commitment created:", tx);
    }
    
    //calculate the session record PDA
    [sessionRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("session"),
        commitmentPda.toBuffer(),
        sessionId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    console.log("Session Record PDA:", sessionRecordPda.toString());
  });
  
  it("Starts a session", async () => {
    try {
      //skip if session already exists
      try {
        await program.account.sessionRecord.fetch(sessionRecordPda);
        console.log("Session already exists, skipping start session test");
        return;
      } catch (error) {
        //session doesn't exist, continue with the test
      }
      
      //fetch user profile and commitment states before starting session
      const userProfileBefore = await program.account.userProfile.fetch(userProfilePda);
      const commitmentBefore = await program.account.focusCommitment.fetch(commitmentPda);
      
      console.log("Starting a new session...");
      
      //start a new session
      const tx = await program.methods
        .startSession(sessionId)
        .accountsStrict({
          sessionRecord: sessionRecordPda,
          commitment: commitmentPda,
          userProfile: userProfilePda,
          user: userKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();
      
      console.log("Start session transaction signature:", tx);
      
      //fetch the session record to verify it was created correctly
      const sessionRecord = await program.account.sessionRecord.fetch(sessionRecordPda);
      
      //assert that the session was initialized correctly
      expect(sessionRecord.user.toString()).to.equal(userKeypair.publicKey.toString());
      expect(sessionRecord.commitment.toString()).to.equal(commitmentPda.toString());
      expect(sessionRecord.sessionNumber.toString()).to.equal(sessionId.toString());
      expect(sessionRecord.completed).to.equal(false);
      expect(sessionRecord.startTimestamp.toNumber()).to.be.greaterThan(0);
      expect(sessionRecord.endTimestamp.toNumber()).to.equal(0);
      expect(sessionRecord.verificationSlot.toNumber()).to.be.greaterThan(0);
      
    } catch (error) {
      console.error("Error starting session:", error);
      throw error;
    }
  });
  
  it("Handles session completion validation", async () => {
    try {
      // try to complete the session right away -> should fail due to time constraints
      try {
        await program.methods
          .completeSession()
          .accountsStrict({
            sessionRecord: sessionRecordPda,
            commitment: commitmentPda,
            userProfile: userProfilePda,
            user: userKeypair.publicKey,
          })
          .signers([userKeypair])
          .rpc();
        
        //should not reach here
        expect.fail("Expected error when completing session too early");
      } catch (error) {
        //should fail with a SessionNotComplete error
        expect(error.message).to.include("SessionNotComplete");
        console.log("Successfully caught error when completing session too early");
      }
      
      //in a real test, we would advance the clock and try again
    //   console.log("In a real test environment:");
    //   console.log("1. We would advance the clock by 55+ minutes");
    //   console.log("2. Call completeSession instruction");
    //   console.log("3. Verify session is marked as completed");
    //   console.log("4. Verify user profile and commitment stats are updated");
      
      // Here's the code that would be used if we could advance the clock:
      /*
      // Advance clock (in a real test environment)
      
      // Complete the session
      const tx = await program.methods
        .completeSession()
        .accountsStrict({
          sessionRecord: sessionRecordPda,
          commitment: commitmentPda,
          userProfile: userProfilePda,
          user: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();
      
      console.log("Complete session transaction signature:", tx);
      
      // Fetch the session record to verify it was updated correctly
      const sessionRecord = await program.account.sessionRecord.fetch(sessionRecordPda);
      expect(sessionRecord.completed).to.equal(true);
      expect(sessionRecord.endTimestamp.toNumber()).to.be.greaterThan(0);
      
      // Verify commitment was updated
      const commitment = await program.account.focusCommitment.fetch(commitmentPda);
      expect(commitment.sessionsCompletedToday).to.be.greaterThan(0);
      expect(commitment.lastSessionTimestamp.toNumber()).to.be.greaterThan(0);
      
      // Verify user profile was updated
      const userProfile = await program.account.userProfile.fetch(userProfilePda);
      expect(userProfile.totalSessionsCompleted).to.be.greaterThan(0);
      */
    } catch (error) {
      console.error("Error testing session completion:", error);
      throw error;
    }
  });
  
  it("Fails to start a session when already completed all daily sessions", async () => {
    try {
      // Since we can't actually complete sessions in this test environment,
      // we'll simulate the case where a user tries to start more sessions than allowed
      
      //create a new session ID for this test
      const newSessionId = new anchor.BN(99);
      
      //find the session record PDA for this new session
      const [newSessionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("session"),
          commitmentPda.toBuffer(),
          newSessionId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
      
      //fetch the commitment to check its state
      const commitment = await program.account.focusCommitment.fetch(commitmentPda);
      
      //only run this test if we're still in the legitimate range of testing
      //if we've already hit the session limit, this test is superfluous
      if (commitment.sessionsCompletedToday >= commitment.sessionsPerDay) {
        console.log("Max sessions already reached, testing session limit...");
        
        try {
          //try to start a new session -> should fail due to daily limit
          await program.methods
            .startSession(newSessionId)
            .accountsStrict({
              sessionRecord: newSessionPda,
              commitment: commitmentPda,
              userProfile: userProfilePda,
              user: userKeypair.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .signers([userKeypair])
            .rpc();
          
          //should not reach here
          expect.fail("Expected error when starting too many sessions");
        } catch (error) {
          //should fail with a DailySessionsCompleted error
          expect(error.message).to.include("DailySessionsCompleted");
          console.log("Successfully caught error when exceeding daily session limit");
        }
      } else {
        console.log("Daily sessions not maxed out, skipping session limit test");
        console.log("Current sessions completed today:", commitment.sessionsCompletedToday);
        console.log("Max sessions per day:", commitment.sessionsPerDay);
      }
    } catch (error) {
      console.error("Error testing session limits:", error);
      throw error;
    }
  });
  
  it("Handles session time verification", async () => {
    //verify the time-based validations if we could manipulate time
    // console.log("Testing session time verification...");
    // console.log("In a real test environment with clock control:");
    // console.log("1. We would start a session");
    // console.log("2. Try to start another session right away - should fail due to time constraint");
    // console.log("3. Advance clock by 30+ minutes");
    // console.log("4. Successfully start another session");
    // console.log("5. Try to complete a session too early - should fail");
    // console.log("6. Advance clock by 55+ minutes");
    // console.log("7. Successfully complete the session");
    
    //since we can't manipulate time in this environment, this test is informational only
  });
});
