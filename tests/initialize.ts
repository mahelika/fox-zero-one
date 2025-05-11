import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
import { expect } from "chai";
import { F0x01 } from "../target/types/f0x01";  

describe("F0x01 Initialize Tests", () => {
  //configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.F0x01 as Program<F0x01>;
  const wallet = provider.wallet;
  
  //store important accounts
  let focusProgramPda: PublicKey;
  let focusTokenMint: PublicKey;
  
  // test parameters
  const rewardRate = new anchor.BN(100); // set reward rate

  before(async () => {
    // find the focus_program PDA
    [focusProgramPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("focus_program")],
      program.programId
    );

    // create token mint for testing
    const mintAuthority = wallet.publicKey;
    focusTokenMint = await createMint(
      provider.connection,
      wallet.payer,
      mintAuthority,
      null,
      9 // 9 decimals is standard for most tokens
    );

    console.log("Focus Program PDA:", focusProgramPda.toString());
    console.log("Focus Token Mint:", focusTokenMint.toString());
  });

  it("Initializes the program", async () => {
    try {
      //call the initialize instruction
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
      
      console.log("Transaction signature:", tx);

      //fetch the program state to verify it initialized correctly
      const programState = await program.account.focusProgram.fetch(focusProgramPda);
      
      //assert that the program state was initialized correctly
      expect(programState.authority.toString()).to.equal(wallet.publicKey.toString());
      expect(programState.totalUsers.toNumber()).to.equal(0);
      expect(programState.totalStaked.toNumber()).to.equal(0);
      expect(programState.rewardRate.toNumber()).to.equal(rewardRate.toNumber());
      expect(programState.focusTokenMint.toString()).to.equal(focusTokenMint.toString());
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  });
});