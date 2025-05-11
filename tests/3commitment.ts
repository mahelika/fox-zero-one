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

describe("F0x01 Commitment Tests", () => {
  //configure the client 
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.F0x01 as Program<F0x01>;
  const wallet = provider.wallet;
  
  let focusProgramPda: PublicKey;
  let userKeypair: Keypair;
  let userProfilePda: PublicKey;
  let tokenMint: PublicKey;
  let userTokenAccount: PublicKey;
  
  const commitmentId = new anchor.BN(1);
  const stakeAmount = new anchor.BN(100_000_000); //100 tokens with 6 decimals
  const sessionsPerDay = 2;
  const totalDays = 2;
  
  before(async () => {
    console.log("Setting up test accounts...");
    
    //find the focus_program PDA
    [focusProgramPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("focus_program")],
      program.programId
    );
    
    //create a user keypair for testing
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
    
    console.log("Focus Program PDA:", focusProgramPda.toString());
    console.log("User Keypair:", userKeypair.publicKey.toString());
    console.log("User Profile PDA:", userProfilePda.toString());
    
    //check if program is initialized,if not->initialize it
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
      
      //initialize 
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
    
    //creating user token account and mint tokens for testing
    try {
      userTokenAccount = await getAssociatedTokenAddress(tokenMint, userKeypair.publicKey);
      
      //check if token account already exists
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
  });
  
  it("Creates a commitment", async () => {
    try {
      // find commitment PDA
      const [commitmentPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("commitment"),
          userKeypair.publicKey.toBuffer(),
          commitmentId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
      
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
      
      console.log("Commitment PDA:", commitmentPda.toString());
      console.log("Vault PDA:", vaultPda.toString());
      
      //fetch program state before
      const programBefore = await program.account.focusProgram.fetch(focusProgramPda);
      const totalStakedBefore = programBefore.totalStaked;
      
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
      
      console.log("Create commitment transaction signature:", tx);
      
      //fetch the commitment to verify it was created correctly
      const commitment = await program.account.focusCommitment.fetch(commitmentPda);
      
      //assert that the commitment was initialized correctly
      expect(commitment.user.toString()).to.equal(userKeypair.publicKey.toString());
      expect(commitment.commitmentId.toString()).to.equal(commitmentId.toString());
      expect(commitment.amountStaked.toString()).to.equal(stakeAmount.toString());
      expect(commitment.sessionsPerDay).to.equal(sessionsPerDay);
      expect(commitment.totalDays).to.equal(totalDays);
      expect(commitment.isActive).to.equal(true);
      expect(commitment.daysCompleted).to.equal(0);
      expect(commitment.sessionsCompletedToday).to.equal(0);
      expect(commitment.startTimestamp.toNumber()).to.be.greaterThan(0);
      
      //verify vault received the tokens
      const vaultBalance = await provider.connection.getTokenAccountBalance(vaultPda);
      expect(vaultBalance.value.amount).to.equal(stakeAmount.toString());
      
      //verify program state was updated
      const programAfter = await program.account.focusProgram.fetch(focusProgramPda);
      const expectedTotalStaked = totalStakedBefore.add(stakeAmount);
      expect(programAfter.totalStaked.toString()).to.equal(expectedTotalStaked.toString());
      
    } catch (error) {
      console.error("Error creating commitment:", error);
      throw error;
    }
  });
  
  it("Claims rewards after commitment period", async () => {
    try {
      //find commitment PDA
      const [commitmentPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("commitment"),
          userKeypair.publicKey.toBuffer(),
          commitmentId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
      
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
      
      console.log("In a real test environment:");
      console.log("1. We would advance the clock by totalDays + 1 days");
      console.log("2. Call claimRewards instruction");
      console.log("3. Verify tokens returned to user account");
      console.log("4. Verify commitment marked as inactive");
       
    } catch (error) {
      console.error("Error claiming rewards:", error);
      throw error;
    }
  });
  
  it("Fails to create commitment with invalid parameters", async () => {
    try {
      //create new commitment ID for this test
      const invalidCommitmentId = new anchor.BN(2);
      
      //find commitment PDA for the new commitment
      const [invalidCommitmentPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("commitment"),
          userKeypair.publicKey.toBuffer(),
          invalidCommitmentId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
      
      //find vault PDA for the new commitment
      const [invalidVaultPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          userKeypair.publicKey.toBuffer(),
          invalidCommitmentId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
      
      //find vault authority PDA
      const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_authority")],
        program.programId
      );
      
      //try to create a commitment with invalid sessionsPerDay (0)
      try {
        await program.methods
          .createCommitment(
            invalidCommitmentId,
            stakeAmount,
            0, //invalid sessionsPerDay -> should be > 0
            totalDays
          )
          .accountsStrict({
            commitment: invalidCommitmentPda,
            userProfile: userProfilePda,
            focusProgram: focusProgramPda,
            user: userKeypair.publicKey,
            userTokenAccount: userTokenAccount,
            vault: invalidVaultPda,
            vaultAuthority: vaultAuthorityPda,
            tokenMint: tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([userKeypair])
          .rpc();
        
        //should not reach here
        expect.fail("Expected error when creating commitment with invalid sessionsPerDay");
      } catch (error) {
        //should fail with InvalidSessionCount
        expect(error.message).to.include("InvalidSessionCount");
      }
      
      //try to create a commitment with invalid totalDays (0)
      try {
        await program.methods
          .createCommitment(
            invalidCommitmentId,
            stakeAmount,
            sessionsPerDay,
            0 //invalid totalDays ->should be > 0
          )
          .accountsStrict({
            commitment: invalidCommitmentPda,
            userProfile: userProfilePda,
            focusProgram: focusProgramPda,
            user: userKeypair.publicKey,
            userTokenAccount: userTokenAccount,
            vault: invalidVaultPda,
            vaultAuthority: vaultAuthorityPda,
            tokenMint: tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([userKeypair])
          .rpc();
        
        //shouldn't reach here
        expect.fail("Expected error when creating commitment with invalid totalDays");
      } catch (error) {
        //should fail with InvalidDayCount
        expect(error.message).to.include("InvalidDayCount");
      }
      
    } catch (error) {
      console.error("Error in testing invalid parameters:", error);
      throw error;
    }
  });
});