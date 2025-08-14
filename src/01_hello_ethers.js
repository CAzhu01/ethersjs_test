import { ethers } from "ethers";
import { configDotenv } from "dotenv";
configDotenv();

const INFURA_API_KEY = process.env.INFURA_API_KEY;
const providerSepolia = new ethers.JsonRpcProvider(
  `https://sepolia.infura.io/v3/${INFURA_API_KEY}`
);

const main = async () => {
  const balanceSepolia = await providerSepolia.getBalance(
    `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`
  );

  // 输出Sepolia测试网ETH余额
  console.log(
    `Sepolia ETH Balance of vitalik: ${ethers.formatEther(balanceSepolia)} ETH`
  );
};

main();
