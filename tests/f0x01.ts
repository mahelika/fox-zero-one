import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { F0x01 } from "../target/types/f0x01";

describe("f0x01", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.F0x01 as Program<F0x01>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
