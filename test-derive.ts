import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';

const mnemonic = 'test test test test test test test test test test test junk';
const seed = bip39.mnemonicToSeedSync(mnemonic, '');

// Phantom and Solflare typically use:
const path1 = "m/44'/501'/0'/0'";
const path2 = "m/44'/501'/0'";

console.log('Path 1:', Keypair.fromSeed(derivePath(path1, seed.toString('hex')).key).publicKey.toBase58());
console.log('Path 2:', Keypair.fromSeed(derivePath(path2, seed.toString('hex')).key).publicKey.toBase58());
