import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "@project-serum/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  getAccount
} from "@solana/spl-token";
import { assert, expect } from "chai";
import { F0x01 } from "../target/types/f0x01";

describe("F0x01 Commitment Tests", () => {
  //configure the client 
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.F0x01 as Program<F0x01>;
  const wallet = provider.wallet;
  //global variables
  let focusProgramPda: PublicKey;
  let userKeypair: Keypair;
  let userProfilePda: PublicKey;
  let tokenMint: PublicKey;
  let userTokenAccount: PublicKey;
  //test parameters
  const commitmentId = new anchor.BN(100); //using different IDs from main tests
  const stakeAmount = new anchor.BN(100_000_000); // 100 tokens with 6 decimals
  //store PDAs for reuse across tests
  let commitmentPda: PublicKey;
  let vaultPda: PublicKey;
  let vaultAuthorityPda: PublicKey;

  before(async () => {
    // console.log("Setting up additional test environment...");

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

    //find the program token mint
    try {
      const programAccount = await program.account.focusProgram.fetch(focusProgramPda);
      tokenMint = programAccount.focusTokenMint;
    } catch (error) {
      console.error("Error fetching program account, make sure it's initialized:", error);
      throw error;
    }

    //create user token account and mint tokens for testing
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
        // console.log("Created user token account:", userTokenAccount.toString());
      }

      //mint tokens to user account for testing
      const mintAmount = stakeAmount.toNumber() * 10; //more tokens for various tests
      await mintTo(
        provider.connection,
        wallet.payer,
        tokenMint,
        userTokenAccount,
        wallet.publicKey,
        mintAmount
      );

      // console.log(`Minted ${mintAmount / 1_000_000} tokens to user account`);
    } catch (error) {
      console.error("Error setting up token accounts:", error);
      throw error;
    }

    //create user profile if it doesn't exist
    try {
      await program.account.userProfile.fetch(userProfilePda);
      console.log("User profile already exists");
    } catch (error) {
      // console.log("Creating user profile...");

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

      // console.log("User profile created");
    }

    //pre-compute PDAs for commitments
    [commitmentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("commitment"),
        userKeypair.publicKey.toBuffer(),
        commitmentId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        userKeypair.publicKey.toBuffer(),
        commitmentId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority")],
      program.programId
    );
  });

  //test 1: create commitment with minimum valid parameters
  it("Creates commitment with minimum valid parameters", async () => {
    const minSessionsPerDay = 1;
    const minTotalDays = 1;

    try {
      //create the commitment with minimum valid parameters
      const tx = await program.methods
        .createCommitment(
          commitmentId,
          stakeAmount,
          minSessionsPerDay,
          minTotalDays
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

      // console.log("Created commitment with minimum parameters, tx:", tx);

      //verify the commitment was created correctly
      const commitment = await program.account.focusCommitment.fetch(commitmentPda);
      expect(commitment.user.toString()).to.equal(userKeypair.publicKey.toString());
      expect(commitment.sessionsPerDay).to.equal(minSessionsPerDay);
      expect(commitment.totalDays).to.equal(minTotalDays);
      expect(commitment.isActive).to.be.true;

      //verify vault received the tokens
      const vaultBalance = await provider.connection.getTokenAccountBalance(vaultPda);
      expect(vaultBalance.value.amount).to.equal(stakeAmount.toString());
    } catch (error) {
      console.error("Error creating commitment with minimum parameters:", error);
      throw error;
    }
  });

  //test 2: create commitment with maximum valid parameters
  it("Creates commitment with maximum valid parameters", async () => {
    const maxCommitmentId = new anchor.BN(101);
    const maxSessionsPerDay = 10;
    const maxTotalDays = 30;

    //find PDAs for this specific commitment
    const [maxCommitmentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("commitment"),
        userKeypair.publicKey.toBuffer(),
        maxCommitmentId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    const [maxVaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        userKeypair.publicKey.toBuffer(),
        maxCommitmentId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    try {
      //create the commitment with maximum valid parameters
      const tx = await program.methods
        .createCommitment(
          maxCommitmentId,
          stakeAmount,
          maxSessionsPerDay,
          maxTotalDays
        )
        .accountsStrict({
          commitment: maxCommitmentPda,
          userProfile: userProfilePda,
          focusProgram: focusProgramPda,
          user: userKeypair.publicKey,
          userTokenAccount: userTokenAccount,
          vault: maxVaultPda,
          vaultAuthority: vaultAuthorityPda,
          tokenMint: tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([userKeypair])
        .rpc();

      // console.log("Created commitment with maximum parameters, tx:", tx);

      //verify the commitment was created correctly
      const commitment = await program.account.focusCommitment.fetch(maxCommitmentPda);
      expect(commitment.user.toString()).to.equal(userKeypair.publicKey.toString());
      expect(commitment.sessionsPerDay).to.equal(maxSessionsPerDay);
      expect(commitment.totalDays).to.equal(maxTotalDays);
      expect(commitment.isActive).to.be.true;

      //verify vault received the tokens
      const vaultBalance = await provider.connection.getTokenAccountBalance(maxVaultPda);
      expect(vaultBalance.value.amount).to.equal(stakeAmount.toString());
    } catch (error) {
      console.error("Error creating commitment with maximum parameters:", error);
      throw error;
    }
  });

  //test 3: test for insufficient funds when creating commitment
  it("Fails to create commitment with insufficient funds", async () => {
    const insufficientFundsId = new anchor.BN(102);

    //find PDAs for this commitment
    const [insufficientCommitmentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("commitment"),
        userKeypair.publicKey.toBuffer(),
        insufficientFundsId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    const [insufficientVaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        userKeypair.publicKey.toBuffer(),
        insufficientFundsId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    //create a new user with insufficient funds
    const poorUserKeypair = Keypair.generate();

    //fund the user with just enough SOL for transaction fees
    const airdropSig = await provider.connection.requestAirdrop(
      poorUserKeypair.publicKey,
      0.1 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    //create a token account for this user
    const poorUserTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      tokenMint,
      poorUserKeypair.publicKey
    );

    //mint only a small amount of tokens (insufficient for commitment)
    const smallAmount = 1000; // Very small amount, insufficient for stake
    await mintTo(
      provider.connection,
      wallet.payer,
      tokenMint,
      poorUserTokenAccount,
      wallet.publicKey,
      smallAmount
    );

    //find the user profile PDA for this user
    const [poorUserProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_profile"), poorUserKeypair.publicKey.toBuffer()],
      program.programId
    );

    //create user profile for this user
    await program.methods
      .createUserProfile()
      .accountsStrict({
        userProfile: poorUserProfilePda,
        user: poorUserKeypair.publicKey,
        focusProgram: focusProgramPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([poorUserKeypair])
      .rpc();

    try {
      //attempt to create a commitment with insufficient funds
      await program.methods
        .createCommitment(
          insufficientFundsId,
          stakeAmount, //this is much larger than the user's balance
          1,
          1
        )
        .accountsStrict({
          commitment: insufficientCommitmentPda,
          userProfile: poorUserProfilePda,
          focusProgram: focusProgramPda,
          user: poorUserKeypair.publicKey,
          userTokenAccount: poorUserTokenAccount,
          vault: insufficientVaultPda,
          vaultAuthority: vaultAuthorityPda,
          tokenMint: tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([poorUserKeypair])
        .rpc();

      assert.fail("Should have failed due to insufficient funds");
    } catch (error) {
      //expected to fail with insufficient funds error
      // console.log("Correctly failed with insufficient funds error");
      expect(error.message).to.include("Error");
    }
  });

  //test 4: test creating multiple commitments for the same user
  it("Creates multiple commitments for the same user", async () => {
    const multipleIds = [new anchor.BN(103), new anchor.BN(104), new anchor.BN(105)];
    const commitmentPdas: PublicKey[] = [];
    const vaultPdas: PublicKey[] = [];

    //find PDAs for all commitments
    for (let id of multipleIds) {
      const [cPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("commitment"),
          userKeypair.publicKey.toBuffer(),
          id.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
      commitmentPdas.push(cPda);

      const [vPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          userKeypair.publicKey.toBuffer(),
          id.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
      vaultPdas.push(vPda);
    }

    //create multiple commitments with different parameters
    for (let i = 0; i < multipleIds.length; i++) {
      try {
        const id = multipleIds[i];
        const sessionsPerDay = i + 1;
        const totalDays = i + 1;

        const tx = await program.methods
          .createCommitment(
            id,
            stakeAmount,
            sessionsPerDay,
            totalDays
          )
          .accountsStrict({
            commitment: commitmentPdas[i],
            userProfile: userProfilePda,
            focusProgram: focusProgramPda,
            user: userKeypair.publicKey,
            userTokenAccount: userTokenAccount,
            vault: vaultPdas[i],
            vaultAuthority: vaultAuthorityPda,
            tokenMint: tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([userKeypair])
          .rpc();

        // console.log(`Created commitment ${i + 1}, tx:`, tx);

        //verify the commitment was created correctly
        const commitment = await program.account.focusCommitment.fetch(commitmentPdas[i]);
        expect(commitment.user.toString()).to.equal(userKeypair.publicKey.toString());
        expect(commitment.commitmentId.toString()).to.equal(id.toString());
        expect(commitment.sessionsPerDay).to.equal(sessionsPerDay);
        expect(commitment.totalDays).to.equal(totalDays);
        expect(commitment.isActive).to.be.true;
      } catch (error) {
        console.error(`Error creating multiple commitment ${i + 1}:`, error);
        throw error;
      }
    }

    //verify that all commitments exist for this user
    //tests that the program correctly handles multiple active commitments per user
    const fetchedProgram = await program.account.focusProgram.fetch(focusProgramPda);
    // console.log(`Program total staked: ${fetchedProgram.totalStaked.toString()}`);
  });



  //rest 5: test commitment with different stake amounts
  it("Creates commitments with different stake amounts", async () => {
    //use smaller stake amounts or mint more tokens
    const differentStakeIds = [new anchor.BN(106), new anchor.BN(107)];
    const stakeAmounts = [
      new anchor.BN(10_000_000), // 10 tokens
      new anchor.BN(50_000_000), // 50 tokens
    ];

    //mint additional tokens to ensure there are enough funds for both tests
    try {
      //add more tokens to the user's account
      await mintTo(
        provider.connection,
        wallet.payer,
        tokenMint,
        userTokenAccount,
        wallet.publicKey,
        200_000_000 //mint additional 200 tokens for testing
      );
      // console.log("Minted additional tokens to ensure sufficient funds");
    } catch (error) {
      console.error("Error minting additional tokens:", error);
    }

    for (let i = 0; i < differentStakeIds.length; i++) {
      const id = differentStakeIds[i];
      const stake = stakeAmounts[i];

      //find PDAs for this commitment
      const [cPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("commitment"),
          userKeypair.publicKey.toBuffer(),
          id.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );

      const [vPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          userKeypair.publicKey.toBuffer(),
          id.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );

      try {
        //check user's token balance before creating commitment
        const balanceBefore = await provider.connection.getTokenAccountBalance(userTokenAccount);
        // console.log(`User balance before commitment ${i + 1}: ${balanceBefore.value.amount}`);

        //create commitment with different stake amount
        const tx = await program.methods
          .createCommitment(
            id,
            stake,
            2, // sessions per day
            2  // total days
          )
          .accountsStrict({
            commitment: cPda,
            userProfile: userProfilePda,
            focusProgram: focusProgramPda,
            user: userKeypair.publicKey,
            userTokenAccount: userTokenAccount,
            vault: vPda,
            vaultAuthority: vaultAuthorityPda,
            tokenMint: tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([userKeypair])
          .rpc();

        // console.log(`Created commitment with stake ${stake.toString()}, tx:`, tx);

        //verify commitment was created with correct stake amount
        const commitment = await program.account.focusCommitment.fetch(cPda);
        expect(commitment.amountStaked.toString()).to.equal(stake.toString());

        //verify vault received the correct amount
        const vaultBalance = await provider.connection.getTokenAccountBalance(vPda);
        expect(vaultBalance.value.amount).to.equal(stake.toString());

        //check user's token balance after creating commitment
        const balanceAfter = await provider.connection.getTokenAccountBalance(userTokenAccount);
        // console.log(`User balance after commitment ${i + 1}: ${balanceAfter.value.amount}`);
      } catch (error) {
        console.error(`Error creating commitment with stake ${stake.toString()}:`, error);
        throw error;
      }
    }
  });


  //test 6:test creating a commitment with an invalid token account
  it("Fails to create commitment with invalid token account", async () => {
    const invalidTokenId = new anchor.BN(108);

    //find PDAs for this commitment
    const [invalidCommitmentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("commitment"),
        userKeypair.publicKey.toBuffer(),
        invalidTokenId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    const [invalidVaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        userKeypair.publicKey.toBuffer(),
        invalidTokenId.toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );

    //create another token mint (which is not the program's focus token)
    const wrongMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    //create token account for the wrong mint
    const wrongTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      wrongMint,
      userKeypair.publicKey
    );

    //mint some tokens of the wrong type
    await mintTo(
      provider.connection,
      wallet.payer,
      wrongMint,
      wrongTokenAccount,
      wallet.publicKey,
      100_000_000
    );

    try {
      //attempt to create commitment with invalid token account
      await program.methods
        .createCommitment(
          invalidTokenId,
          stakeAmount,
          2,
          2
        )
        .accountsStrict({
          commitment: invalidCommitmentPda,
          userProfile: userProfilePda,
          focusProgram: focusProgramPda,
          user: userKeypair.publicKey,
          userTokenAccount: wrongTokenAccount, //wrong token account
          vault: invalidVaultPda,
          vaultAuthority: vaultAuthorityPda,
          tokenMint: tokenMint, //correct mint, but wrongTokenAccount has different mint
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([userKeypair])
        .rpc();

      assert.fail("Should have failed due to invalid token account");
    } catch (error) {
      //expected to fail due to constraint violation
      // console.log("Correctly failed with token account constraint violation");
      expect(error.message).to.include("Error");
    }
  });

  //test 7: attempt to create commitment with ID that already exists
  it("Fails to create commitment with duplicate ID", async () => {
    try {
      //attempt to create commitment with the same ID as an existing one
      await program.methods
        .createCommitment(
          commitmentId, //this ID was already used in the first test
          stakeAmount,
          2,
          2
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

      assert.fail("Should have failed due to duplicate commitment ID");
    } catch (error) {
      //expected to fail because account already exists
      // console.log("Correctly failed with account already exists error");
      expect(error.message).to.include("Error");
    }
  });

  //test 8: advanced - test simulation of completing a commitment with mocked time
  // it("Simulates completing a commitment and claiming rewards", async () => {
  //   //this test only works for simulating, as we can't manipulate blockchain time
  //   //create a special commitment for this test
  //   const simulationId = new anchor.BN(109);

  //   //find PDAs for this commitment
  //   const [simCommitmentPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("commitment"),
  //       userKeypair.publicKey.toBuffer(),
  //       simulationId.toArrayLike(Buffer, "le", 8)
  //     ],
  //     program.programId
  //   );

  //   const [simVaultPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("vault"),
  //       userKeypair.publicKey.toBuffer(),
  //       simulationId.toArrayLike(Buffer, "le", 8)
  //     ],
  //     program.programId
  //   );

  //   //create the simulation commitment
  //   try {
  //     await program.methods
  //       .createCommitment(
  //         simulationId,
  //         stakeAmount,
  //         2, // 2 sessions per day
  //         1  // 1 day (shortest possible for simulation)
  //       )
  //       .accountsStrict({
  //         commitment: simCommitmentPda,
  //         userProfile: userProfilePda,
  //         focusProgram: focusProgramPda,
  //         user: userKeypair.publicKey,
  //         userTokenAccount: userTokenAccount,
  //         vault: simVaultPda,
  //         vaultAuthority: vaultAuthorityPda,
  //         tokenMint: tokenMint,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //         systemProgram: SystemProgram.programId,
  //         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //       })
  //       .signers([userKeypair])
  //       .rpc();

  //     console.log("Created simulation commitment");

  //     // get the commitment data
  //     const commitment = await program.account.focusCommitment.fetch(simCommitmentPda);
  //     console.log("Commitment:", {
  //       id: commitment.commitmentId.toString(),
  //       amountStaked: commitment.amountStaked.toString(),
  //       sessionsPerDay: commitment.sessionsPerDay,
  //       totalDays: commitment.totalDays,
  //       startTimestamp: commitment.startTimestamp.toString()
  //     });

  //     //get the program details
  //     const programData = await program.account.focusProgram.fetch(focusProgramPda);
  //     console.log("Program reward rate:", programData.rewardRate.toString());

  //     //simulate the logic that would happen in the claim_rewards function
  //     const totalExpectedSessions = commitment.sessionsPerDay * commitment.totalDays;

  //     console.log("\nREWARD SIMULATION:");

  //     //simulate different completion rates
  //     const scenarios = [
  //       { name: "90%+ completion", completedSessions: Math.ceil(totalExpectedSessions * 0.9) },
  //       { name: "75-89% completion", completedSessions: Math.ceil(totalExpectedSessions * 0.8) },
  //       { name: "<75% completion", completedSessions: Math.floor(totalExpectedSessions * 0.6) }
  //     ];

  //     for (const scenario of scenarios) {
  //       const successRate = scenario.completedSessions / totalExpectedSessions;

  //       let rewardAmount;
  //       if (successRate >= 0.9) {
  //         //complete reward + bonus
  //         const baseReward = commitment.amountStaked.toNumber();
  //         const bonus = (baseReward * programData.rewardRate.toNumber()) / 100;
  //         rewardAmount = baseReward + bonus;
  //       } else if (successRate >= 0.75) {
  //         //return original stake
  //         rewardAmount = commitment.amountStaked.toNumber();
  //       } else {
  //         //partial refund
  //         rewardAmount = (commitment.amountStaked.toNumber() * 75) / 100;
  //       }

  //       console.log(`Scenario: ${scenario.name}`);
  //       console.log(`- Completed sessions: ${scenario.completedSessions}/${totalExpectedSessions}`);
  //       console.log(`- Success rate: ${(successRate * 100).toFixed(2)}%`);
  //       console.log(`- Reward amount: ${rewardAmount / 1_000_000} tokens`);
  //       console.log(`- Original stake: ${commitment.amountStaked.toNumber() / 1_000_000} tokens`);
  //       if (rewardAmount > commitment.amountStaked.toNumber()) {
  //         console.log(`- Bonus earned: ${(rewardAmount - commitment.amountStaked.toNumber()) / 1_000_000} tokens`);
  //       } else if (rewardAmount < commitment.amountStaked.toNumber()) {
  //         console.log(`- Penalty: ${(commitment.amountStaked.toNumber() - rewardAmount) / 1_000_000} tokens`);
  //       }
  //       console.log("---");
  //     }

  //   } catch (error) {
  //     console.error("Error in commitment simulation:", error);
  //     throw error;
  //   }
  // });
  it("Simulates completing a commitment and claiming rewards", async () => {
  // This test simulates reward calculations based on session completion without manipulating blockchain time
  
  // Create a special commitment with clear parameters for this test simulation
  const simulationId = new anchor.BN(109);
  const sessionsPerDay = 2;
  const totalDays = 1;
  const totalExpectedSessions = sessionsPerDay * totalDays;
  
  // Use a round number amount for easier calculation display
  const stakeAmount = new anchor.BN(100_000_000); // 100 tokens (assuming 6 decimals)

  // Find PDAs for this commitment
  const [simCommitmentPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("commitment"),
      userKeypair.publicKey.toBuffer(),
      simulationId.toArrayLike(Buffer, "le", 8)
    ],
    program.programId
  );

  const [simVaultPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault"),
      userKeypair.publicKey.toBuffer(),
      simulationId.toArrayLike(Buffer, "le", 8)
    ],
    program.programId
  );

  try {
    // Create the simulation commitment
    await program.methods
      .createCommitment(
        simulationId,
        stakeAmount,
        sessionsPerDay,
        totalDays
      )
      .accountsStrict({
        commitment: simCommitmentPda,
        userProfile: userProfilePda,
        focusProgram: focusProgramPda,
        user: userKeypair.publicKey,
        userTokenAccount: userTokenAccount,
        vault: simVaultPda,
        vaultAuthority: vaultAuthorityPda,
        tokenMint: tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([userKeypair])
      .rpc();

    // Get the commitment data
    const commitment = await program.account.focusCommitment.fetch(simCommitmentPda);
    
    // Get the program details
    const programData = await program.account.focusProgram.fetch(focusProgramPda);
    const rewardRate = programData.rewardRate.toNumber();
    
    // Display commitment details clearly
    // console.log("\n=== COMMITMENT SIMULATION DETAILS ===");
    // console.log(`Commitment ID: ${commitment.commitmentId.toString()}`);
    // console.log(`Amount Staked: ${commitment.amountStaked.toNumber() / 1_000_000} tokens`);
    // console.log(`Sessions Required: ${sessionsPerDay} per day for ${totalDays} day(s)`);
    // console.log(`Total Required Sessions: ${totalExpectedSessions}`);
    // console.log(`Program Reward Rate: ${rewardRate}%`);
    // console.log("=====================================\n");

    // Simulate the logic that would happen in the claim_rewards function
    // console.log("=== REWARD SIMULATION SCENARIOS ===");

    // Clear scenario definitions with exact thresholds and session counts
    const scenarios = [
      { 
        name: "High Completion (90%+)", 
        completedSessions: totalExpectedSessions, // 100% completion
        description: "User completes 90% or more of required sessions"
      },
      { 
        name: "Medium Completion (75-89%)", 
        completedSessions: Math.floor(totalExpectedSessions * 0.8), // 80% completion
        description: "User completes between 75% and 89% of required sessions"
      },
      { 
        name: "Low Completion (<75%)", 
        completedSessions: Math.floor(totalExpectedSessions * 0.5), // 50% completion
        description: "User completes less than 75% of required sessions"
      }
    ];

    for (const scenario of scenarios) {
      const successRate = scenario.completedSessions / totalExpectedSessions;
      const successRatePercentage = (successRate * 100).toFixed(2);
      
      // Calculate rewards based on completion thresholds
      let rewardAmount, rewardDescription;
      
      if (successRate >= 0.9) {
        // Full stake back plus bonus
        const baseStake = commitment.amountStaked.toNumber();
        const bonus = (baseStake * rewardRate) / 100;
        rewardAmount = baseStake + bonus;
        rewardDescription = "Full stake returned plus bonus";
      } else if (successRate >= 0.75) {
        // Return original stake only
        rewardAmount = commitment.amountStaked.toNumber();
        rewardDescription = "Full stake returned (no bonus)";
      } else {
        // Partial refund (75% of stake)
        rewardAmount = Math.floor(commitment.amountStaked.toNumber() * 0.75);
        rewardDescription = "Partial stake returned (75% of original)";
      }

      const originalStakeTokens = commitment.amountStaked.toNumber() / 1_000_000;
      const rewardAmountTokens = rewardAmount / 1_000_000;
      
      // Format and display the results clearly
      // console.log(`\n--- SCENARIO: ${scenario.name} ---`);
      // console.log(`Description: ${scenario.description}`);
      // console.log(`Sessions Completed: ${scenario.completedSessions}/${totalExpectedSessions}`);
      // console.log(`Completion Rate: ${successRatePercentage}%`);
      // console.log(`Reward Policy: ${rewardDescription}`);
      // console.log(`Original Stake: ${originalStakeTokens} tokens`);
      // console.log(`Total Reward: ${rewardAmountTokens} tokens`);
      
      // Calculate and display the difference from original stake
      // const difference = rewardAmount - commitment.amountStaked.toNumber();
      // if (difference > 0) {
      //   console.log(`Bonus Earned: +${difference / 1_000_000} tokens (${rewardRate}% of stake)`);
      // } else if (difference < 0) {
      //   console.log(`Penalty Applied: -${Math.abs(difference) / 1_000_000} tokens (25% of stake)`);
      // } else {
      //   console.log(`Net Change: 0 tokens (stake returned in full)`);
      // }
    }
    
    // console.log("\n=== USER PROFILE IMPACT SIMULATION ===");
    // console.log("• Successfully completed commitments improve user reputation");
    // console.log("• Each completed session adds to the user's total count");
    // console.log("• Consecutive daily participation builds streak counters");
    // console.log("• Higher completion rates lead to better historical performance metrics");
    
  } catch (error) {
    console.error("Error in commitment simulation:", error);
    throw error;
  }
});

  //test 9: test updating user profile when completing sessions (simulation)
  it("Simulates completing sessions and updating user profile", async () => {
    // console.log("\nUSER PROFILE SESSION COMPLETION SIMULATION:");

    //get current user profile
    try {
      const userProfile = await program.account.userProfile.fetch(userProfilePda);
      // console.log("Initial user profile state:");
      // console.log(`- Total sessions completed: ${userProfile.totalSessionsCompleted}`);

      //simulate completing sessions
      const simulatedCompletedSessions = 3; // Simulate completing 3 sessions
      // console.log(`Simulating completion of ${simulatedCompletedSessions} sessions...`);

      //in actual protocol, this would happen via a recordSession instruction
      //show what the user profile would look like after session completion
      const expectedTotalSessions = userProfile.totalSessionsCompleted.add(new BN(simulatedCompletedSessions));
      // console.log("Expected user profile after sessions:");
      // console.log(`- Total sessions completed: ${expectedTotalSessions}`);

      //explain the effect on rewards
      // console.log("\nEffect on rewards:");
      // console.log("- Higher session completion leads to better rewards");
      // console.log("- 90%+ completion rate gives full stake back plus bonus");
      // console.log("- 75-89% completion rate gives full stake back");
      // console.log("- <75% completion rate gives partial refund (75% of stake)");
    } catch (error) {
      console.error("Error in user profile simulation:", error);
      throw error;
    }
  });
});