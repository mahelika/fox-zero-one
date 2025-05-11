import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import { F0x01 } from "../target/types/f0x01";


describe("F0x01 Create User Profile Tests", () => {
  //configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.F0x01 as Program<F0x01>;
  
  //store important accounts
  let focusProgramPda: PublicKey;
  let userKeypair: Keypair;
  let userProfilePda: PublicKey;
  
  //helper function to safely compare BN values
  const assertBNEquals = (actual: any, expected: number | string | anchor.BN) => {
    if (typeof actual === 'object' && actual !== null && typeof actual.toString === 'function') {
      //handles BN objects
      expect(actual.toString()).to.equal(expected.toString());
    } else {
      //handles regular numbers
      expect(actual).to.equal(expected);
    }
  };
  
  before(async () => {
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
    
    //ensure the program is initialized
    try {
      const programAccount = await program.account.focusProgram.fetch(focusProgramPda);
      console.log("Program already initialized with", programAccount.totalUsers.toString(), "users");
    } catch (error) {
      console.log("Initializing program...");
      
      //create a token mint for initialization
      const mintKeypair = Keypair.generate();
      
      //initialize the program
      await program.methods
        .initializeProgram(new anchor.BN(100)) // set reward rate to 100
        .accountsStrict({
          focusProgram: focusProgramPda,
          focusTokenMint: mintKeypair.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      
      console.log("Program initialized");
    }
  });
  
  it("Creates a user profile", async () => {
    try {
      //fetch initial program state
      const programBefore = await program.account.focusProgram.fetch(focusProgramPda);
      const totalUsersBefore = programBefore.totalUsers; // This is a BN
      
      //call the create user profile instruction
      const tx = await program.methods
        .createUserProfile()
        .accountsStrict({
          userProfile: userProfilePda,
          user: userKeypair.publicKey,
          focusProgram: focusProgramPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();
      
      console.log("Transaction signature:", tx);
      
      //fetch the user profile to verify it was created correctly
      const userProfile = await program.account.userProfile.fetch(userProfilePda);
      
      //assert that the user profile was initialized correctly
      expect(userProfile.user.toString()).to.equal(userKeypair.publicKey.toString());
      
      //use toString comparison for BN values
      expect(userProfile.totalSessionsCompleted.toString()).to.equal('0');
      expect(userProfile.totalRewardsEarned.toString()).to.equal('0');
      expect(userProfile.currentStreak.toString()).to.equal('0');
      expect(userProfile.bestStreak.toString()).to.equal('0');
      expect(userProfile.lastActiveDay.toNumber()).to.be.greaterThan(0); //should be set to current timestamp
      
      //fetch the program state to verify total users was incremented
      const programAfter = await program.account.focusProgram.fetch(focusProgramPda);
      
      //use the helper function for BN comparison
      const expectedUsers = totalUsersBefore.add(new anchor.BN(1));
      expect(programAfter.totalUsers.toString()).to.equal(expectedUsers.toString());
      
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  });
  
  it("Fails to create duplicate user profile", async () => {
    try {
      //try to create another user profile for the same user
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
      
      //should not reach here
      expect.fail("Expected error when creating duplicate user profile");
    } catch (error) {
      // should fail with account already in use
      expect(error.message).to.include("already in use");
    }
  });
  
  it("Creates a different user profile", async () => {
    //create another user
    const anotherUserKeypair = Keypair.generate();
    
    //fund new user
    const airdropSig = await provider.connection.requestAirdrop(
      anotherUserKeypair.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
    
    //find the new user profile PDA
    const [anotherUserProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_profile"), anotherUserKeypair.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      //fetch initial program state
      const programBefore = await program.account.focusProgram.fetch(focusProgramPda);
      const totalUsersBefore = programBefore.totalUsers; //this is a BN
      
      //create user profile for the new user
      const tx = await program.methods
        .createUserProfile()
        .accountsStrict({
          userProfile: anotherUserProfilePda,
          user: anotherUserKeypair.publicKey,
          focusProgram: focusProgramPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([anotherUserKeypair])
        .rpc();
      
      console.log("Transaction signature for second user:", tx);
      
      //fetch the user profile to verify it was created correctly
      const userProfile = await program.account.userProfile.fetch(anotherUserProfilePda);
      
      //assert that the user profile was initialized correctly
      expect(userProfile.user.toString()).to.equal(anotherUserKeypair.publicKey.toString());
      
      //fetch the program state to verify total users was incremented
      const programAfter = await program.account.focusProgram.fetch(focusProgramPda);
      
      //direct string comparison for BN values
      const expectedUsers = totalUsersBefore.add(new anchor.BN(1));
      expect(programAfter.totalUsers.toString()).to.equal(expectedUsers.toString());
      
    } catch (error) {
      console.error("Error creating second user:", error);
      throw error;
    }
  });
});