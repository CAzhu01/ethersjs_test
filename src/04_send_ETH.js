import { ethers } from "ethers";

const main = async () => {
  const wallet01 = ethers.Wallet.createRandom();
  console.log(wallet01);
};

main();
